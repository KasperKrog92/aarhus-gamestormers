// Pure phase-decision logic for the voting scheduler. No network or D1 access:
// callers pass the raw round row, its suggestions, vote tallies, and the
// already-recorded automation events, and get back a single decision describing
// what (if anything) the scheduler should do this run. All side effects (API
// calls, Discord posts, handoff files) live in the runner so these rules stay
// easy to test.
import {
  cleanDateOnly,
  isAfterDateOnly,
  isBeforeDateOnly,
  todayDateOnly,
} from '../../functions/_lib/schedule.js';

// Decision actions:
//   open_voting    move the round suggesting -> voting
//   reveal_winner  move the round voting -> revealed with a winnerSuggestionId
//   blocked        a transition is due but cannot complete automatically
//                  (no votes, or a tie for first place); needs the maintainer
//   noop           nothing to do this run
export const ACTIONS = {
  OPEN_VOTING: 'open_voting',
  REVEAL_WINNER: 'reveal_winner',
  BLOCKED: 'blocked',
  NOOP: 'noop',
};

function hasEvent(automationEvents, eventType) {
  return (automationEvents || []).some((event) => event && event.eventType === eventType);
}

function suggestionTitle(suggestions, id) {
  const match = (suggestions || []).find((s) => Number(s.id) === Number(id));
  return match && match.title ? match.title : null;
}

// Tallies are { [suggestionId]: voteCount } and only contain suggestions that
// received at least one vote. Return them as { id, votes } sorted by votes
// descending, then id ascending for a stable order. Non-positive or malformed
// entries are dropped so "no votes" is simply an empty result.
function rankTallies(tallies) {
  return Object.entries(tallies || {})
    .map(([id, votes]) => ({ id: Number(id), votes: Number(votes) || 0 }))
    .filter((entry) => Number.isInteger(entry.id) && entry.votes > 0)
    .sort((a, b) => b.votes - a.votes || a.id - b.id);
}

// Decide the single action the scheduler should take for one round. `today` is a
// YYYY-MM-DD string (falls back to the real current date if missing/invalid).
// The date comparisons mirror the public schedule rules: voting opens on
// voting_opens_at inclusive, and the winner is revealed strictly after
// voting_closes_at (the close date itself is still an open voting day).
export function decideRoundActions({
  today,
  round,
  suggestions = [],
  tallies = {},
  automationEvents = [],
} = {}) {
  if (!round || round.id == null) {
    return { action: ACTIONS.NOOP, roundId: null, reason: 'No round to evaluate.' };
  }

  const roundId = Number(round.id);
  const phase = round.phase;
  const day = cleanDateOnly(today) || todayDateOnly();

  if (phase === 'suggesting') {
    if (hasEvent(automationEvents, 'voting_opened')) {
      return { action: ACTIONS.NOOP, roundId, reason: 'Voting already opened for this round.' };
    }
    const opensAt = cleanDateOnly(round.voting_opens_at);
    if (!opensAt) {
      return {
        action: ACTIONS.NOOP,
        roundId,
        reason: 'No voting_opens_at date set; not opening voting automatically.',
      };
    }
    if (isBeforeDateOnly(day, opensAt)) {
      return { action: ACTIONS.NOOP, roundId, reason: `Voting opens on ${opensAt}; today is ${day}.` };
    }
    return { action: ACTIONS.OPEN_VOTING, roundId, reason: `Voting open date ${opensAt} reached on ${day}.` };
  }

  if (phase === 'voting') {
    if (hasEvent(automationEvents, 'winner_revealed')) {
      return { action: ACTIONS.NOOP, roundId, reason: 'Winner already revealed for this round.' };
    }
    const closesAt = cleanDateOnly(round.voting_closes_at);
    if (!closesAt) {
      return {
        action: ACTIONS.NOOP,
        roundId,
        reason: 'No voting_closes_at date set; not revealing a winner automatically.',
      };
    }
    if (!isAfterDateOnly(day, closesAt)) {
      return { action: ACTIONS.NOOP, roundId, reason: `Voting closes on ${closesAt}; today is ${day}.` };
    }

    const ranked = rankTallies(tallies);
    if (ranked.length === 0) {
      return {
        action: ACTIONS.BLOCKED,
        roundId,
        blocker: 'no_votes',
        reason: `Voting closed on ${closesAt} but no votes were cast; a winner needs manual review.`,
      };
    }

    const topVotes = ranked[0].votes;
    const leaders = ranked.filter((entry) => entry.votes === topVotes);
    if (leaders.length > 1) {
      const tied = leaders.map((entry) => ({
        id: entry.id,
        title: suggestionTitle(suggestions, entry.id),
        votes: entry.votes,
      }));
      const names = tied.map((t) => t.title || `#${t.id}`).join(', ');
      return {
        action: ACTIONS.BLOCKED,
        roundId,
        blocker: 'tie',
        tied,
        reason: `Voting closed on ${closesAt} with a ${topVotes}-vote tie for first place (${names}); needs manual review.`,
      };
    }

    const winner = ranked[0];
    return {
      action: ACTIONS.REVEAL_WINNER,
      roundId,
      winnerSuggestionId: winner.id,
      winner: { id: winner.id, title: suggestionTitle(suggestions, winner.id), votes: winner.votes },
      reason: `Winner is suggestion ${winner.id} with ${winner.votes} vote(s).`,
    };
  }

  return { action: ACTIONS.NOOP, roundId, reason: `Phase "${phase}" needs no scheduled action.` };
}
