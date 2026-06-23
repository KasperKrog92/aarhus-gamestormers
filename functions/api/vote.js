// POST /api/vote - cast a ranked ballot of one or more approved games.
// Body: { rankings: number[] }. suggestionIds remains a temporary alias for the
// approval-voting frontend until the ranking UI lands.
// Gated by: phase === 'voting', voting schedule window, and authenticated
// Discord guild membership. Re-submitting replaces the logged-in user's ballot.
import { json, fail, readJson } from '../_lib/http.js';
import {
  ensureRoundScheduleColumns,
  ensureVoteRankColumn,
  getCurrentRound,
  getSuggestions,
} from '../_lib/db.js';
import { roundScheduleState } from '../_lib/schedule.js';
import { displayName, requireMemberSession } from '../_lib/member-auth.js';

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const body = await readJson(request);
  if (body instanceof Response) return body;
  if (!body) return fail('Invalid request body');

  const auth = await requireMemberSession(db, request, env);
  if (!auth.ok) return json({ error: auth.message, invite: auth.invite || null }, auth.status);

  await ensureVoteRankColumn(db);
  await ensureRoundScheduleColumns(db);
  const round = await getCurrentRound(db);
  if (!round) return fail('No active round', 409);
  if (round.phase !== 'voting') return fail('Voting is not open', 409);
  const schedule = roundScheduleState(round);
  if (!schedule.votingHasStarted) return fail('Voting is not open yet', 409);
  if (!schedule.votingIsOpen) return fail('Voting has closed for this round', 409);

  const submittedRankings = Array.isArray(body.rankings)
    ? body.rankings
    : (Array.isArray(body.suggestionIds) ? body.suggestionIds : []);
  const requested = submittedRankings.map(Number).filter(Number.isInteger);
  if (!requested.length) return fail('Rank at least one game');

  // Only approved suggestions in this round are valid ballot options.
  const approved = await getSuggestions(db, round.id, { approvedOnly: true });
  const approvedIds = new Set(approved.map((s) => s.id));
  const valid = [...new Set(requested)]
    .filter((id) => approvedIds.has(id))
    .slice(0, approvedIds.size);
  if (!valid.length) return fail('Those games are not on the ballot');

  const previous = await db
    .prepare('SELECT ballot_id FROM votes WHERE round_id = ? AND discord_user_id = ? LIMIT 1')
    .bind(round.id, auth.user.discordId)
    .first();
  const ballotId = previous && previous.ballot_id ? previous.ballot_id : crypto.randomUUID();
  const voterName = displayName(auth.user);

  await db
    .prepare('DELETE FROM votes WHERE round_id = ? AND discord_user_id = ?')
    .bind(round.id, auth.user.discordId)
    .run();
  const stmt = db.prepare(
    `INSERT INTO votes (round_id, suggestion_id, ballot_id, rank, voter_name, discord_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  await db.batch(valid.map((id, index) => (
    stmt.bind(round.id, id, ballotId, index + 1, voterName, auth.user.discordId)
  )));

  return json({ ok: true, counted: valid.length, replaced: !!previous }, previous ? 200 : 201);
}
