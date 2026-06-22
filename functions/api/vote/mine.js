import { ensureRoundScheduleColumns, ensureVoteRankColumn, getCurrentRound } from '../../_lib/db.js';
import { fail, json } from '../../_lib/http.js';
import { requireMemberSession } from '../../_lib/member-auth.js';

// GET /api/vote/mine - the logged-in member's current-round ranking only.
// Ballot ids, voter metadata, and every other member's rows stay private.
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const auth = await requireMemberSession(db, request, env);
  if (!auth.ok) return json({ error: auth.message, invite: auth.invite || null }, auth.status);

  await ensureVoteRankColumn(db);
  await ensureRoundScheduleColumns(db);
  const round = await getCurrentRound(db);
  if (!round) return json({ rankings: [] });

  const { results } = await db
    .prepare(
      `SELECT suggestion_id
         FROM votes
        WHERE round_id = ? AND discord_user_id = ?
        ORDER BY CASE WHEN rank IS NULL THEN 1 ELSE 0 END ASC,
                 rank ASC,
                 created_at ASC,
                 suggestion_id ASC`
    )
    .bind(round.id, auth.user.discordId)
    .all();

  const rankings = (results || [])
    .map((row) => Number(row.suggestion_id))
    .filter(Number.isInteger);
  return json({ rankings });
}
