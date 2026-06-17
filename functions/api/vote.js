// POST /api/vote — cast an approval ballot (tick one or more approved games).
// Body: { suggestionIds: number[], voterName?, stormCode, turnstileToken }
// Gated by: phase === 'voting', voting schedule window, correct storm code, Turnstile pass.
// voterName is optional and self-reported (helps the admin spot funky ballots).
import { json, fail, readJson, clean } from '../_lib/http.js';
import { ensureRoundScheduleColumns, getCurrentRound, getSuggestions } from '../_lib/db.js';
import { roundScheduleState } from '../_lib/schedule.js';
import { verifyTurnstile } from '../_lib/turnstile.js';

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const body = await readJson(request);
  if (!body) return fail('Invalid request body');

  await ensureRoundScheduleColumns(db);
  const round = await getCurrentRound(db);
  if (!round) return fail('No active round', 409);
  if (round.phase !== 'voting') return fail('Voting is not open', 409);
  const schedule = roundScheduleState(round);
  if (!schedule.votingHasStarted) return fail('Voting is not open yet', 409);
  if (!schedule.votingIsOpen) return fail('Voting has closed for this round', 409);

  if (clean(body.stormCode, 40) !== round.storm_code) return fail('Wrong code', 403);

  const ts = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET);
  if (!ts.ok) return fail('Bot check failed — please try again', 403);

  const requested = Array.isArray(body.suggestionIds)
    ? body.suggestionIds.map(Number).filter(Number.isInteger)
    : [];
  if (!requested.length) return fail('Pick at least one game');

  // Only approved suggestions in this round are valid ballot options.
  const approved = await getSuggestions(db, round.id, { approvedOnly: true });
  const approvedIds = new Set(approved.map((s) => s.id));
  const valid = [...new Set(requested)].filter((id) => approvedIds.has(id));
  if (!valid.length) return fail('Those games are not on the ballot');

  const ballotId = crypto.randomUUID();
  const voterName = clean(body.voterName, 80) || null;
  const stmt = db.prepare('INSERT INTO votes (round_id, suggestion_id, ballot_id, voter_name) VALUES (?, ?, ?, ?)');
  await db.batch(valid.map((id) => stmt.bind(round.id, id, ballotId, voterName)));

  return json({ ok: true, ballotId, counted: valid.length }, 201);
}
