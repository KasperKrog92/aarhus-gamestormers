import { fail, json } from '../../_lib/http.js';
import {
  ensureRoundScheduleColumns,
  ensureSuggestionVisibilityColumn,
  getCurrentRound,
  toOwnedSuggestion,
} from '../../_lib/db.js';
import { getSessionUser } from '../../_lib/member-auth.js';

// GET /api/suggestions/mine - current-round suggestions owned by this session.
// This private response includes the saved display name, but never a Discord id.
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const user = await getSessionUser(db, request, env);
  if (!user) return fail('Log in with Discord to continue.', 401);

  await ensureSuggestionVisibilityColumn(db);
  await ensureRoundScheduleColumns(db);
  const round = await getCurrentRound(db);
  if (!round) return json({ suggestions: [] });

  const { results } = await db
    .prepare(
      `SELECT id, title, status, suggested_by, discord_user_id, show_suggester_name
         FROM suggestions
        WHERE round_id = ? AND discord_user_id = ?
        ORDER BY created_at ASC, id ASC`
    )
    .bind(round.id, user.discordId)
    .all();

  return json({ suggestions: (results || []).map(toOwnedSuggestion) });
}
