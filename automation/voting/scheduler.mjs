// Pure phase-decision logic for the voting scheduler. No network or D1 access:
// callers pass the raw round row, its suggestions, the aggregate IRV result, and the
// already-recorded automation events, and get back a single decision describing
// what (if anything) the scheduler should do this run. All side effects (API
// calls, Discord posts, handoff files) live in the runner so these rules stay
// easy to test.
import {
  addDaysDateOnly,
  cleanDateOnly,
  isAfterDateOnly,
  isBeforeDateOnly,
  midpointDateOnly,
  todayDateOnly,
} from '../../functions/_lib/schedule.js';

// Decision actions:
//   announce_suggestions  post the suggestions-open Discord message
//   open_voting    move the round suggesting -> voting
//   remind_suggestions  post a general-chat reminder mid-suggestion-window
//                  (decision.reminder is 'halfway' or 'last_day', and
//                  decision.eventType names the idempotency event)
//   remind_voting  same, mid-voting-window
//   reveal_winner  move the round voting -> revealed with a winnerSuggestionId
//   blocked        a transition is due but cannot complete automatically
//                  (no ballots, or a final IRV tie); needs the maintainer
//   noop           nothing to do this run
export const ACTIONS = {
  ANNOUNCE_SUGGESTIONS: 'announce_suggestions',
  OPEN_VOTING: 'open_voting',
  REMIND_SUGGESTIONS: 'remind_suggestions',
  REMIND_VOTING: 'remind_voting',
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

    // Mid-window general-chat reminders. Both need the window boundaries and
    // the opening announcement already out (so a catch-up pass never posts a
    // reminder before the announcement it refers to). The last full suggestion
    // day is the day before voting opens; the halfway reminder fires from the
    // window midpoint but yields to the last-day reminder when the dates
    // collide, and simply lapses once the last day arrives.
    if (suggestionsAt && opensAt && hasEvent(automationEvents, 'suggestions_opened')) {
      const lastDay = addDaysDateOnly(opensAt, -1);
      if (day === lastDay && !hasEvent(automationEvents, 'suggestions_last_day_reminded')) {
        return {
          action: ACTIONS.REMIND_SUGGESTIONS,
          reminder: 'last_day',
          eventType: 'suggestions_last_day_reminded',
          roundId,
          reason: `Last suggestion day ${lastDay}; voting opens ${opensAt}.`,
        };
      }
      const halfway = midpointDateOnly(suggestionsAt, opensAt);
      if (
        halfway &&
        !isBeforeDateOnly(day, halfway) &&
        isBeforeDateOnly(day, lastDay) &&
        !hasEvent(automationEvents, 'suggestions_halfway_reminded')
      ) {
        return {
          action: ACTIONS.REMIND_SUGGESTIONS,
          reminder: 'halfway',
          eventType: 'suggestions_halfway_reminded',
          roundId,
          reason: `Suggestion window halfway point ${halfway} reached on ${day}.`,
        };
      }
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
      // Mid-window general-chat reminders, mirroring the suggesting phase. The
      // close date is itself a full voting day (the reveal happens the day
      // after), so the last-day reminder fires on the close date.
      if (hasEvent(automationEvents, 'voting_opened')) {
        if (day === closesAt && !hasEvent(automationEvents, 'voting_last_day_reminded')) {
          return {
            action: ACTIONS.REMIND_VOTING,
            reminder: 'last_day',
            eventType: 'voting_last_day_reminded',
            roundId,
            reason: `Voting closes today, ${closesAt}.`,
          };
        }
        const opensAt = cleanDateOnly(round.voting_opens_at);
        const halfway = opensAt ? midpointDateOnly(opensAt, closesAt) : '';
        if (
          halfway &&
          !isBeforeDateOnly(day, halfway) &&
          isBeforeDateOnly(day, closesAt) &&
          !hasEvent(automationEvents, 'voting_halfway_reminded')
        ) {
          return {
            action: ACTIONS.REMIND_VOTING,
            reminder: 'halfway',
            eventType: 'voting_halfway_reminded',
            roundId,
            reason: `Voting window halfway point ${halfway} reached on ${day}.`,
          };
        }
      }
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
