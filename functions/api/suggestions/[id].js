import { fail, json, readJson } from '../../_lib/http.js';
import { ensureSuggestionVisibilityColumn, toOwnedSuggestion } from '../../_lib/db.js';
import { getSessionUser } from '../../_lib/member-auth.js';

// PATCH /api/suggestions/:id - change only the public display-name preference.
// Ownership comes from the session and cannot be supplied by the client.
export async function onRequestPatch({ request, env, params }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const body = await readJson(request);
  if (!body || typeof body.showName !== 'boolean') return fail('showName must be true or false.');

  const user = await getSessionUser(db, request, env);
  if (!user) return fail('Log in with Discord to continue.', 401);

  const id = Number(params && params.id);
  if (!Number.isInteger(id) || id < 1) return fail('Invalid suggestion id.');

  await ensureSuggestionVisibilityColumn(db);
  const owned = await db
    .prepare('SELECT id FROM suggestions WHERE id = ? AND discord_user_id = ? LIMIT 1')
    .bind(id, user.discordId)
    .first();
  if (!owned) return fail('Suggestion not found.', 404);

  await db
    .prepare('UPDATE suggestions SET show_suggester_name = ? WHERE id = ? AND discord_user_id = ?')
    .bind(body.showName ? 1 : 0, id, user.discordId)
    .run();

  const updated = await db
    .prepare(
      `SELECT id, title, status, suggested_by, discord_user_id, show_suggester_name
         FROM suggestions
        WHERE id = ? AND discord_user_id = ?`
    )
    .bind(id, user.discordId)
    .first();

  return json({ ok: true, suggestion: toOwnedSuggestion(updated) });
}
