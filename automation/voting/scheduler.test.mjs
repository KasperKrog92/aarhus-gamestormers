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

test('opens voting once the open date is reached', () => {
  const decision = decideRoundActions({
    today: '2026-06-30',
    round: suggestingRound(),
    automationEvents: [],
  });
  assert.equal(decision.action, ACTIONS.OPEN_VOTING);
  assert.equal(decision.roundId, 19);
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
    tallies: { 101: 5, 102: 2 },
  });
  assert.equal(decision.action, ACTIONS.NOOP);
});

test('reveals the winner the day after voting closes', () => {
  const decision = decideRoundActions({
    today: '2026-07-10',
    round: votingRound(),
    suggestions: SUGGESTIONS,
    tallies: { 101: 5, 102: 2, 103: 3 },
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
    tallies: {},
  });
  assert.equal(decision.action, ACTIONS.BLOCKED);
  assert.equal(decision.blocker, 'no_votes');
});

test('blocks with a tie and names the tied suggestions', () => {
  const decision = decideRoundActions({
    today: '2026-07-10',
    round: votingRound(),
    suggestions: SUGGESTIONS,
    tallies: { 101: 4, 102: 4, 103: 1 },
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
    tallies: { 101: 4, 999: 4 },
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
    tallies: { 101: 5 },
  });
  assert.equal(decision.action, ACTIONS.NOOP);
  assert.match(decision.reason, /voting_closes_at/);
});

test('does not re-reveal when winner_revealed is already recorded', () => {
  const decision = decideRoundActions({
    today: '2026-07-10',
    round: votingRound(),
    suggestions: SUGGESTIONS,
    tallies: { 101: 5 },
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
      tallies: { 101: 5 },
    });
    assert.equal(decision.action, ACTIONS.NOOP, `phase ${phase} should be a no-op`);
  }
});

test('returns a no-op when there is no round', () => {
  const decision = decideRoundActions({ today: '2026-07-10', round: null });
  assert.equal(decision.action, ACTIONS.NOOP);
  assert.equal(decision.roundId, null);
});

test('tolerates string tally keys and breaks ties by lowest id for ordering only', () => {
  // String keys are what D1 tallies use ({ "101": 5 }); ensure they parse.
  const decision = decideRoundActions({
    today: '2026-07-10',
    round: votingRound(),
    suggestions: SUGGESTIONS,
    tallies: { '102': 3, '101': 7 },
  });
  assert.equal(decision.action, ACTIONS.REVEAL_WINNER);
  assert.equal(decision.winnerSuggestionId, 101);
});
