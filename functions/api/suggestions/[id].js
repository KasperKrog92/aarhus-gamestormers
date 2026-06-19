import { fail, json, readJson, clean } from '../../_lib/http.js';
import {
  ensureRoundScheduleColumns,
  ensureSuggestionVisibilityColumn,
  getCurrentRound,
  toOwnedSuggestion,
} from '../../_lib/db.js';
import { roundScheduleState } from '../../_lib/schedule.js';
import { getSessionUser } from '../../_lib/member-auth.js';

// PATCH /api/suggestions/:id - let the original suggester change their own
// suggestion. The display-name preference (showName) can change in any voting
// phase; the pitch can only change while suggestions are open for the current
// round, so a pitch cannot be rewritten after members have started voting.
// Ownership comes from the session and cannot be supplied by the client.
export async function onRequestPatch({ request, env, params }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const body = await readJson(request);
  if (!body) return fail('Invalid body.');
  const hasShowName = Object.prototype.hasOwnProperty.call(body, 'showName');
  const hasPitch = Object.prototype.hasOwnProperty.call(body, 'pitch');
  if (hasShowName && typeof body.showName !== 'boolean') return fail('showName must be true or false.');
  if (!hasShowName && !hasPitch) return fail('Nothing to update.');

  const user = await getSessionUser(db, request, env);
  if (!user) return fail('Log in with Discord to continue.', 401);

  const id = Number(params && params.id);
  if (!Number.isInteger(id) || id < 1) return fail('Invalid suggestion id.');

  await ensureSuggestionVisibilityColumn(db);
  const owned = await db
    .prepare('SELECT id, round_id FROM suggestions WHERE id = ? AND discord_user_id = ? LIMIT 1')
    .bind(id, user.discordId)
    .first();
  if (!owned) return fail('Suggestion not found.', 404);

  // Pitch edits are only allowed while suggestions are open for that round.
  if (hasPitch) {
    await ensureRoundScheduleColumns(db);
    const round = await getCurrentRound(db);
    const pitchEditable =
      round &&
      Number(round.id) === Number(owned.round_id) &&
      round.phase === 'suggesting' &&
      roundScheduleState(round).suggestionsAreOpen;
    if (!pitchEditable) return fail('You can only edit your pitch while suggestions are open.', 409);
  }

  const sets = [];
  const vals = [];
  if (hasShowName) {
    sets.push('show_suggester_name = ?');
    vals.push(body.showName ? 1 : 0);
  }
  if (hasPitch) {
    sets.push('pitch = ?');
    vals.push(clean(body.pitch, 500) || null);
  }
  vals.push(id, user.discordId);

  await db
    .prepare('UPDATE suggestions SET ' + sets.join(', ') + ' WHERE id = ? AND discord_user_id = ?')
    .bind(...vals)
    .run();

  const updated = await db
    .prepare(
      `SELECT id, title, status, suggested_by, discord_user_id, show_suggester_name, pitch
         FROM suggestions
        WHERE id = ? AND discord_user_id = ?`
    )
    .bind(id, user.discordId)
    .first();

  return json({ ok: true, suggestion: toOwnedSuggestion(updated) });
}
