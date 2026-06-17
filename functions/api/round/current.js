// GET /api/round/current — public view of the current round + approved games.
// Vote tallies are returned ONLY once the round is revealed (avoids bandwagon).
import { json, fail } from '../../_lib/http.js';
import {
  ensureRoundScheduleColumns,
  getCurrentRound,
  getNextRound,
  getSuggestions,
  getTallies,
  toCard,
  toNextRoundNotice,
} from '../../_lib/db.js';
import {
  DEFAULT_SUGGESTIONS_OPEN_MONTHS_BEFORE,
  DEFAULT_VOTING_CLOSES_MONTHS_BEFORE,
  roundScheduleState,
} from '../../_lib/schedule.js';

export async function onRequestGet({ env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  await ensureRoundScheduleColumns(db);
  const round = await getCurrentRound(db);
  if (!round) return json({ round: null, suggestions: [] });

  const revealed = round.phase === 'revealed' || round.phase === 'closed';
  const suggestions = await getSuggestions(db, round.id, { approvedOnly: true });
  const tallies = revealed ? await getTallies(db, round.id) : null;
  const schedule = roundScheduleState(round);

  const cards = suggestions.map((s) => toCard(s, revealed ? tallies[s.id] || 0 : null));

  // Surface the next round so the vote page can point people there once this
  // round is decided. Storm code stays internal (toNextRoundNotice omits it).
  const nextRound = toNextRoundNotice(await getNextRound(db, round.id));

  return json({
    round: {
      id: round.id,
      title: round.title,
      phase: round.phase, // suggesting | voting | revealed | closed
      meetingDate: round.meeting_date,
      suggestionsOpenMonthsBefore: round.suggestions_open_months_before ?? DEFAULT_SUGGESTIONS_OPEN_MONTHS_BEFORE,
      votingClosesMonthsBefore: round.voting_closes_months_before ?? DEFAULT_VOTING_CLOSES_MONTHS_BEFORE,
      suggestionsOpenAt: round.suggestions_open_at,
      votingClosesAt: round.voting_closes_at,
      suggestionsAreOpen: schedule.suggestionsAreOpen,
      votingIsOpen: schedule.votingIsOpen,
      winnerSuggestionId: round.winner_suggestion_id,
    },
    suggestions: cards,
    nextRound,
    // storm_code is intentionally NOT exposed here.
  });
}
