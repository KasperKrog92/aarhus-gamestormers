import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTIONS, decideRoundActions } from './scheduler.mjs';

// A suggesting-phase round whose voting window opens 2026-06-30 and closes
// 2026-07-09 (inclusive). Tests override fields as needed.
function suggestingRound(overrides = {}) {
  return {
    id: 19,
    phase: 'suggesting',
    voting_opens_at: '2026-06-30',
    voting_closes_at: '2026-07-09',
    ...overrides,
  };
}

function votingRound(overrides = {}) {
  return suggestingRound({ phase: 'voting', ...overrides });
}

const SUGGESTIONS = [
  { id: 101, title: 'Hollow Knight' },
  { id: 102, title: 'Celeste' },
  { id: 103, title: 'Outer Wilds' },
];

const CLEAR_RCV_RESULT = {
  winnerId: 101,
  blocked: null,
  totalBallots: 12,
  rounds: [{ counts: [{ id: 101, votes: 5 }, { id: 103, votes: 4 }, { id: 102, votes: 3 }] }],
};

const NO_BALLOTS_RCV_RESULT = {
  winnerId: null,
  blocked: { reason: 'no_ballots', tied: [] },
  totalBallots: 0,
  rounds: [],
};

const TIED_RCV_RESULT = {
  winnerId: null,
  blocked: { reason: 'tie', tied: [{ id: 101, votes: 4 }, { id: 102, votes: 4 }] },
  totalBallots: 8,
  rounds: [{ counts: [{ id: 101, votes: 4 }, { id: 102, votes: 4 }] }],
};

test('opens voting once the open date is reached', () => {
  const decision = decideRoundActions({
    today: '2026-06-30',
    round: suggestingRound(),
    automationEvents: [],
  });
  assert.equal(decision.action, ACTIONS.OPEN_VOTING);
  assert.equal(decision.roundId, 19);
});

test('announces suggestions once the suggestions-open date is reached', () => {
  const decision = decideRoundActions({
    today: '2026-06-20',
    round: {
      id: 19,
      phase: 'suggesting',
      suggestions_open_at: '2026-06-20',
      voting_opens_at: '2026-06-30',
    },
    automationEvents: [],
  });

  assert.equal(decision.action, 'announce_suggestions');
  assert.equal(decision.roundId, 19);
});

test('does not repeat the suggestions-open announcement', () => {
  const decision = decideRoundActions({
    today: '2026-06-21',
    round: {
      id: 19,
      phase: 'suggesting',
      suggestions_open_at: '2026-06-20',
      voting_opens_at: '2026-06-30',
    },
    automationEvents: [{ eventType: 'suggestions_opened' }],
  });

  assert.equal(decision.action, 'noop');
});

test('does not open voting before the open date', () => {
  const decision = decideRoundActions({
    today: '2026-06-29',
    round: suggestingRound(),
  });
  assert.equal(decision.action, ACTIONS.NOOP);
});

test('does not reopen voting when voting_opened is already recorded', () => {
  const decision = decideRoundActions({
    today: '2026-07-01',
    round: suggestingRound(),
    automationEvents: [{ eventType: 'voting_opened' }],
  });
  assert.equal(decision.action, ACTIONS.NOOP);
});

test('does not open voting when no open date is set', () => {
  const decision = decideRoundActions({
    today: '2026-07-01',
    round: suggestingRound({ voting_opens_at: null }),
  });
  assert.equal(decision.action, ACTIONS.NOOP);
  assert.match(decision.reason, /voting_opens_at/);
});

test('keeps voting open through the close date itself', () => {
  const decision = decideRoundActions({
    today: '2026-07-09',
    round: votingRound(),
    suggestions: SUGGESTIONS,
    rcvResult: CLEAR_RCV_RESULT,
  });
  assert.equal(decision.action, ACTIONS.NOOP);
});

test('reveals the winner the day after voting closes', () => {
  const decision = decideRoundActions({
    today: '2026-07-10',
    round: votingRound(),
    suggestions: SUGGESTIONS,
    rcvResult: CLEAR_RCV_RESULT,
  });
  assert.equal(decision.action, ACTIONS.REVEAL_WINNER);
  assert.equal(decision.winnerSuggestionId, 101);
  assert.deepEqual(decision.winner, { id: 101, title: 'Hollow Knight', votes: 5 });
});

test('blocks with no_votes when voting closed without any votes', () => {
  const decision = decideRoundActions({
    today: '2026-07-10',
    round: votingRound(),
    suggestions: SUGGESTIONS,
    rcvResult: NO_BALLOTS_RCV_RESULT,
  });
  assert.equal(decision.action, ACTIONS.BLOCKED);
  assert.equal(decision.blocker, 'no_votes');
});

test('blocks with a tie and names the tied suggestions', () => {
  const decision = decideRoundActions({
    today: '2026-07-10',
    round: votingRound(),
    suggestions: SUGGESTIONS,
    rcvResult: TIED_RCV_RESULT,
  });
  assert.equal(decision.action, ACTIONS.BLOCKED);
  assert.equal(decision.blocker, 'tie');
  assert.deepEqual(decision.tied, [
    { id: 101, title: 'Hollow Knight', votes: 4 },
    { id: 102, title: 'Celeste', votes: 4 },
  ]);
  assert.match(decision.reason, /Hollow Knight/);
  assert.match(decision.reason, /Celeste/);
});

test('falls back to #id in tie message when a suggestion title is unknown', () => {
  const decision = decideRoundActions({
    today: '2026-07-10',
    round: votingRound(),
    suggestions: [{ id: 101, title: 'Hollow Knight' }],
    rcvResult: {
      winnerId: null,
      blocked: { reason: 'tie', tied: [{ id: 101, votes: 4 }, { id: 999, votes: 4 }] },
      rounds: [{ counts: [{ id: 101, votes: 4 }, { id: 999, votes: 4 }] }],
    },
  });
  assert.equal(decision.blocker, 'tie');
  assert.match(decision.reason, /#999/);
  assert.equal(decision.tied.find((t) => t.id === 999).title, null);
});

test('does not reveal a winner when no close date is set', () => {
  const decision = decideRoundActions({
    today: '2026-07-10',
    round: votingRound({ voting_closes_at: '' }),
    suggestions: SUGGESTIONS,
    rcvResult: CLEAR_RCV_RESULT,
  });
  assert.equal(decision.action, ACTIONS.NOOP);
  assert.match(decision.reason, /voting_closes_at/);
});

test('does not re-reveal when winner_revealed is already recorded', () => {
  const decision = decideRoundActions({
    today: '2026-07-10',
    round: votingRound(),
    suggestions: SUGGESTIONS,
    rcvResult: CLEAR_RCV_RESULT,
    automationEvents: [{ eventType: 'winner_revealed' }],
  });
  assert.equal(decision.action, ACTIONS.NOOP);
});

test('never closes a round automatically: revealed and closed phases are no-ops', () => {
  for (const phase of ['revealed', 'closed']) {
    const decision = decideRoundActions({
      today: '2026-08-01',
      round: votingRound({ phase }),
      suggestions: SUGGESTIONS,
      rcvResult: CLEAR_RCV_RESULT,
    });
    assert.equal(decision.action, ACTIONS.NOOP, `phase ${phase} should be a no-op`);
  }
});

test('returns a no-op when there is no round', () => {
  const decision = decideRoundActions({ today: '2026-07-10', round: null });
  assert.equal(decision.action, ACTIONS.NOOP);
  assert.equal(decision.roundId, null);
});

test('uses the IRV winner id and reports round-one votes in winner metadata', () => {
  const decision = decideRoundActions({
    today: '2026-07-10',
    round: votingRound(),
    suggestions: SUGGESTIONS,
    rcvResult: {
      winnerId: '101',
      blocked: null,
      rounds: [{ counts: [{ id: '102', votes: 3 }, { id: '101', votes: 7 }] }],
    },
  });
  assert.equal(decision.action, ACTIONS.REVEAL_WINNER);
  assert.equal(decision.winnerSuggestionId, 101);
  assert.equal(decision.winner.votes, 7);
});

// --- Mid-window reminders ------------------------------------------------
// The fixture's suggestion window runs 2026-06-20 to 2026-06-30 (halfway
// 2026-06-25, last full day 2026-06-29); voting runs 2026-06-30 to 2026-07-09
// inclusive (halfway 2026-07-04, last day the close date itself).

function announcedRound(overrides = {}) {
  return suggestingRound({ suggestions_open_at: '2026-06-20', ...overrides });
}

test('reminds halfway through the suggestion window', () => {
  const decision = decideRoundActions({
    today: '2026-06-25',
    round: announcedRound(),
    automationEvents: [{ eventType: 'suggestions_opened' }],
  });
  assert.equal(decision.action, ACTIONS.REMIND_SUGGESTIONS);
  assert.equal(decision.reminder, 'halfway');
  assert.equal(decision.eventType, 'suggestions_halfway_reminded');
});

test('a late pass still catches up the halfway suggestion reminder before the last day', () => {
  const decision = decideRoundActions({
    today: '2026-06-27',
    round: announcedRound(),
    automationEvents: [{ eventType: 'suggestions_opened' }],
  });
  assert.equal(decision.action, ACTIONS.REMIND_SUGGESTIONS);
  assert.equal(decision.reminder, 'halfway');
});

test('no suggestion reminder before the halfway point', () => {
  const decision = decideRoundActions({
    today: '2026-06-24',
    round: announcedRound(),
    automationEvents: [{ eventType: 'suggestions_opened' }],
  });
  assert.equal(decision.action, ACTIONS.NOOP);
});

test('the opening announcement outranks and gates the reminders', () => {
  // With no suggestions_opened recorded, a catch-up pass posts the opening
  // announcement first; the reminder can then fire on a later pass.
  const decision = decideRoundActions({
    today: '2026-06-25',
    round: announcedRound(),
    automationEvents: [],
  });
  assert.equal(decision.action, ACTIONS.ANNOUNCE_SUGGESTIONS);
});

test('the halfway suggestion reminder is not repeated', () => {
  const decision = decideRoundActions({
    today: '2026-06-26',
    round: announcedRound(),
    automationEvents: [
      { eventType: 'suggestions_opened' },
      { eventType: 'suggestions_halfway_reminded' },
    ],
  });
  assert.equal(decision.action, ACTIONS.NOOP);
});

test('reminds on the last suggestion day, outranking an unfired halfway reminder', () => {
  const decision = decideRoundActions({
    today: '2026-06-29',
    round: announcedRound(),
    automationEvents: [{ eventType: 'suggestions_opened' }],
  });
  assert.equal(decision.action, ACTIONS.REMIND_SUGGESTIONS);
  assert.equal(decision.reminder, 'last_day');
  assert.equal(decision.eventType, 'suggestions_last_day_reminded');
});

test('the last-day suggestion reminder is not repeated', () => {
  const decision = decideRoundActions({
    today: '2026-06-29',
    round: announcedRound(),
    automationEvents: [
      { eventType: 'suggestions_opened' },
      { eventType: 'suggestions_last_day_reminded' },
    ],
  });
  assert.equal(decision.action, ACTIONS.NOOP);
});

test('opening voting outranks any pending reminder on the open date', () => {
  const decision = decideRoundActions({
    today: '2026-06-30',
    round: announcedRound(),
    automationEvents: [{ eventType: 'suggestions_opened' }],
  });
  assert.equal(decision.action, ACTIONS.OPEN_VOTING);
});

test('reminds halfway through the voting window', () => {
  const decision = decideRoundActions({
    today: '2026-07-04',
    round: votingRound(),
    automationEvents: [{ eventType: 'voting_opened' }],
  });
  assert.equal(decision.action, ACTIONS.REMIND_VOTING);
  assert.equal(decision.reminder, 'halfway');
  assert.equal(decision.eventType, 'voting_halfway_reminded');
});

test('voting reminders require the voting-open announcement', () => {
  const decision = decideRoundActions({
    today: '2026-07-04',
    round: votingRound(),
    automationEvents: [],
  });
  assert.equal(decision.action, ACTIONS.NOOP);
});

test('reminds on the close date itself, outranking an unfired halfway reminder', () => {
  const decision = decideRoundActions({
    today: '2026-07-09',
    round: votingRound(),
    automationEvents: [{ eventType: 'voting_opened' }],
  });
  assert.equal(decision.action, ACTIONS.REMIND_VOTING);
  assert.equal(decision.reminder, 'last_day');
  assert.equal(decision.eventType, 'voting_last_day_reminded');
});

test('the voting reminders are not repeated', () => {
  const halfway = decideRoundActions({
    today: '2026-07-05',
    round: votingRound(),
    automationEvents: [{ eventType: 'voting_opened' }, { eventType: 'voting_halfway_reminded' }],
  });
  assert.equal(halfway.action, ACTIONS.NOOP);

  const lastDay = decideRoundActions({
    today: '2026-07-09',
    round: votingRound(),
    automationEvents: [
      { eventType: 'voting_opened' },
      { eventType: 'voting_halfway_reminded' },
      { eventType: 'voting_last_day_reminded' },
    ],
  });
  assert.equal(lastDay.action, ACTIONS.NOOP);
});

test('the reveal still outranks reminders once voting has closed', () => {
  const decision = decideRoundActions({
    today: '2026-07-10',
    round: votingRound(),
    suggestions: SUGGESTIONS,
    rcvResult: CLEAR_RCV_RESULT,
    automationEvents: [{ eventType: 'voting_opened' }],
  });
  assert.equal(decision.action, ACTIONS.REVEAL_WINNER);
});
