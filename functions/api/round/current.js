// GET /api/round/current — public view of the current round + approved games.
// Vote tallies are returned ONLY once the round is revealed (avoids bandwagon).
import { json, fail } from '../../_lib/http.js';
import {
  ensureRoundScheduleColumns,
  ensureVoteRankColumn,
  getBallotCount,
  getCurrentRound,
  getNextRound,
  getRankedBallots,
  getSuggestions,
  getTallies,
  toCard,
  toNextRoundNotice,
} from '../../_lib/db.js';
import { runIrv } from '../../_lib/rcv.js';
import {
  DEFAULT_SUGGESTIONS_OPEN_MONTHS_BEFORE,
  DEFAULT_VOTING_OPENS_MONTHS_BEFORE,
  DEFAULT_VOTING_CLOSES_MONTHS_BEFORE,
  roundScheduleState,
} from '../../_lib/schedule.js';

export async function onRequestGet({ env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  await ensureRoundScheduleColumns(db);
  await ensureVoteRankColumn(db);
  const round = await getCurrentRound(db);
  if (!round) return json({ round: null, suggestions: [] });

  const revealed = round.phase === 'revealed' || round.phase === 'closed';
  // Independent reads for the public page's hottest endpoint run in parallel.
  const [suggestions, ballotCount, nextRoundRow] = await Promise.all([
    getSuggestions(db, round.id, { approvedOnly: true }),
    getBallotCount(db, round.id),
    getNextRound(db, round.id),
  ]);
  let tallies = null;
  let rcvResult = null;

  if (revealed) {
    const rankedMarker = await db
      .prepare('SELECT 1 AS has_ranked_ballots FROM votes WHERE round_id = ? AND rank IS NOT NULL LIMIT 1')
      .bind(round.id)
      .first();

    if (rankedMarker) {
      const ballots = await getRankedBallots(db, round.id);
      rcvResult = runIrv({
        ballots: ballots.map((ballot) => ballot.rankings),
        candidateIds: suggestions.map((suggestion) => suggestion.id),
      });
      tallies = Object.fromEntries(
        (rcvResult.rounds[0]?.counts || []).map(({ id, votes }) => [id, votes])
      );
    } else {
      // Historical approval ballots have NULL rank and keep their old aggregate
      // reveal instead of being interpreted as an arbitrary ranking.
      tallies = await getTallies(db, round.id);
    }
  }
  const schedule = roundScheduleState(round);

  const cards = suggestions.map((s) => toCard(s, revealed ? tallies[s.id] || 0 : null));

  // Lightweight social-proof counts for the suggestions phase: how many games
  // are on the board and how many distinct members suggested them. Distinct
  // people are counted by Discord user id; legacy pre-auth rows without an id
  // fall back to the display name, then to a per-row key. No ids are exposed,
  // only the two totals.
  const stats = {
    games: suggestions.length,
    people: new Set(
      suggestions.map((s) =>
        s.discord_user_id ? `u-${s.discord_user_id}` : s.suggested_by ? `n-${s.suggested_by}` : `row-${s.id}`
      )
    ).size,
  };

  // Surface the next round so the vote page can point people there once this
  // round is decided.
  const nextRound = toNextRoundNotice(nextRoundRow);

  return json({
    round: {
      id: round.id,
      title: round.title,
      phase: round.phase, // suggesting | voting | revealed | closed
      meetingDate: round.meeting_date,
      suggestionsOpenMonthsBefore: round.suggestions_open_months_before ?? DEFAULT_SUGGESTIONS_OPEN_MONTHS_BEFORE,
      votingOpensMonthsBefore: round.voting_opens_months_before ?? DEFAULT_VOTING_OPENS_MONTHS_BEFORE,
      votingClosesMonthsBefore: round.voting_closes_months_before ?? DEFAULT_VOTING_CLOSES_MONTHS_BEFORE,
      suggestionsOpenAt: round.suggestions_open_at,
      votingOpensAt: round.voting_opens_at,
      votingClosesAt: round.voting_closes_at,
      suggestionsAreOpen: schedule.suggestionsAreOpen,
      votingHasStarted: schedule.votingHasStarted,
      votingIsOpen: schedule.votingIsOpen,
      winnerSuggestionId: round.winner_suggestion_id,
      ballotCount,
    },
    suggestions: cards,
    stats,
    nextRound,
    ...(rcvResult ? { rcvResult } : {}),
  });
}
