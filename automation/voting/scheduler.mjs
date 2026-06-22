// Pure phase-decision logic for the voting scheduler. No network or D1 access:
// callers pass the raw round row, its suggestions, the aggregate IRV result, and the
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
//   announce_suggestions  post the suggestions-open Discord message
//   open_voting    move the round suggesting -> voting
//   reveal_winner  move the round voting -> revealed with a winnerSuggestionId
//   blocked        a transition is due but cannot complete automatically
//                  (no ballots, or a final IRV tie); needs the maintainer
//   noop           nothing to do this run
export const ACTIONS = {
  ANNOUNCE_SUGGESTIONS: 'announce_suggestions',
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

function firstPreferenceVotes(rcvResult, candidateId) {
  const firstRound = rcvResult && Array.isArray(rcvResult.rounds) ? rcvResult.rounds[0] : null;
  const count = firstRound && Array.isArray(firstRound.counts)
    ? firstRound.counts.find((entry) => Number(entry.id) === Number(candidateId))
    : null;
  return count ? Number(count.votes) || 0 : 0;
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
  rcvResult = null,
  automationEvents = [],
} = {}) {
  if (!round || round.id == null) {
    return { action: ACTIONS.NOOP, roundId: null, reason: 'No round to evaluate.' };
  }

  const roundId = Number(round.id);
  const phase = round.phase;
  const day = cleanDateOnly(today) || todayDateOnly();

  if (phase === 'suggesting') {
    const opensAt = cleanDateOnly(round.voting_opens_at);
    if (!hasEvent(automationEvents, 'voting_opened') && opensAt && !isBeforeDateOnly(day, opensAt)) {
      return { action: ACTIONS.OPEN_VOTING, roundId, reason: `Voting open date ${opensAt} reached on ${day}.` };
    }
    if (hasEvent(automationEvents, 'voting_opened')) {
      return { action: ACTIONS.NOOP, roundId, reason: 'Voting already opened for this round.' };
    }

    const suggestionsAt = cleanDateOnly(round.suggestions_open_at);
    if (!hasEvent(automationEvents, 'suggestions_opened') && suggestionsAt && !isBeforeDateOnly(day, suggestionsAt)) {
      return {
        action: ACTIONS.ANNOUNCE_SUGGESTIONS,
        roundId,
        reason: `Suggestions open date ${suggestionsAt} reached on ${day}.`,
      };
    }

    if (opensAt && isBeforeDateOnly(day, opensAt)) {
      return { action: ACTIONS.NOOP, roundId, reason: `Voting opens on ${opensAt}; today is ${day}.` };
    }
    return {
      action: ACTIONS.NOOP,
      roundId,
      reason: 'No voting_opens_at date set; not opening voting automatically.',
    };
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

    if (!rcvResult || (rcvResult.blocked && rcvResult.blocked.reason === 'no_ballots')) {
      return {
        action: ACTIONS.BLOCKED,
        roundId,
        blocker: 'no_votes',
        reason: `Voting closed on ${closesAt} but no votes were cast; a winner needs manual review.`,
      };
    }

    if (rcvResult.blocked && rcvResult.blocked.reason === 'tie') {
      const tied = (rcvResult.blocked.tied || []).map((entry) => ({
        id: Number(entry.id),
        title: suggestionTitle(suggestions, entry.id),
        votes: Number(entry.votes) || 0,
      }));
      const names = tied.map((t) => t.title || `#${t.id}`).join(', ');
      return {
        action: ACTIONS.BLOCKED,
        roundId,
        blocker: 'tie',
        tied,
        reason: `Voting closed on ${closesAt} with a final ranked-choice tie (${names}); needs manual review.`,
      };
    }

    const winnerId = Number(rcvResult.winnerId);
    if (!Number.isInteger(winnerId)) {
      return {
        action: ACTIONS.BLOCKED,
        roundId,
        blocker: 'no_votes',
        reason: `Voting closed on ${closesAt} but the ranked result had no winner; a winner needs manual review.`,
      };
    }
    const votes = firstPreferenceVotes(rcvResult, winnerId);
    return {
      action: ACTIONS.REVEAL_WINNER,
      roundId,
      winnerSuggestionId: winnerId,
      winner: { id: winnerId, title: suggestionTitle(suggestions, winnerId), votes },
      reason: `Winner is suggestion ${winnerId} with ${votes} first-preference vote(s).`,
    };
  }

  return { action: ACTIONS.NOOP, roundId, reason: `Phase "${phase}" needs no scheduled action.` };
}
