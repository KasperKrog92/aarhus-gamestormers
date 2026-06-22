import assert from 'node:assert/strict';
import test from 'node:test';

import { runIrv } from './rcv.js';

test('first-round majority wins immediately', () => {
  const result = runIrv({
    ballots: [[1, 2], [1], [1, 3], [2, 1], [3, 2]],
    candidateIds: [1, 2, 3],
  });

  assert.equal(result.winnerId, 1);
  assert.equal(result.blocked, null);
  assert.equal(result.rounds.length, 1);
  assert.deepEqual(result.rounds[0], {
    round: 1,
    counts: [{ id: 1, votes: 3 }, { id: 2, votes: 1 }, { id: 3, votes: 1 }],
    activeBallots: 5,
    exhausted: 0,
    majority: 3,
    eliminatedId: null,
    winnerId: 1,
    transfersInto: {},
  });
});

test('eliminates the lowest candidate and transfers ballots to the next preference', () => {
  const result = runIrv({
    ballots: [[1], [1], [2, 1], [2, 1], [3, 2]],
    candidateIds: [1, 2, 3],
  });

  assert.equal(result.winnerId, 2);
  assert.deepEqual(result.rounds.map((round) => round.eliminatedId), [3, null]);
  assert.deepEqual(result.rounds[1].counts, [{ id: 2, votes: 3 }, { id: 1, votes: 2 }]);
  assert.deepEqual(result.rounds[1].transfersInto, { 2: 1 });
});

test('exhausts partial ballots and recomputes the majority from active ballots', () => {
  const result = runIrv({
    ballots: [[1], [1], [1], [2], [2], [3]],
    candidateIds: [1, 2, 3],
  });

  assert.equal(result.rounds[0].majority, 4);
  assert.equal(result.rounds[0].eliminatedId, 3);
  assert.equal(result.rounds[1].activeBallots, 5);
  assert.equal(result.rounds[1].exhausted, 1);
  assert.equal(result.rounds[1].majority, 3);
  assert.equal(result.winnerId, 1);
});

test('lists candidates with zero first preferences in round one', () => {
  const result = runIrv({ ballots: [[1], [1], [2]], candidateIds: [1, 2, 3] });

  assert.deepEqual(result.rounds[0].counts, [
    { id: 1, votes: 2 },
    { id: 2, votes: 1 },
    { id: 3, votes: 0 },
  ]);
});

test('a single candidate wins immediately', () => {
  const result = runIrv({ ballots: [[7], []], candidateIds: [7] });

  assert.equal(result.winnerId, 7);
  assert.equal(result.rounds.length, 1);
  assert.equal(result.rounds[0].activeBallots, 1);
  assert.equal(result.rounds[0].exhausted, 1);
  assert.equal(result.rounds[0].winnerId, 7);
});

test('the final remaining candidate wins when every ballot is exhausted', () => {
  const result = runIrv({ ballots: [[], []], candidateIds: [7] });

  assert.equal(result.winnerId, 7);
  assert.equal(result.rounds[0].activeBallots, 0);
  assert.equal(result.rounds[0].exhausted, 2);
  assert.equal(result.rounds[0].majority, 1);
});

test('no ballots returns the no_ballots blocked result', () => {
  assert.deepEqual(runIrv({ ballots: [], candidateIds: [1, 2] }), {
    winnerId: null,
    blocked: { reason: 'no_ballots', tied: [] },
    majorityThresholdNote: 'more than half of active ballots',
    totalBallots: 0,
    rounds: [],
  });
});

test('an elimination tie first uses the fewest first-preference votes', () => {
  const result = runIrv({
    ballots: [
      [1], [1], [1], [1],
      [2], [2], [2],
      [3], [3],
      [4, 3],
    ],
    candidateIds: [1, 2, 3, 4],
  });

  assert.equal(result.rounds[0].eliminatedId, 4);
  assert.deepEqual(result.rounds[1].counts, [
    { id: 1, votes: 4 },
    { id: 2, votes: 3 },
    { id: 3, votes: 3 },
  ]);
  assert.equal(result.rounds[1].eliminatedId, 3);
  assert.equal(result.winnerId, 1);
});

test('an elimination tie next uses the most recent prior round where counts differed', () => {
  const result = runIrv({
    ballots: [
      [5], [5], [5], [5],
      [1], [1], [1],
      [2], [2], [2],
      [3, 2], [3],
      [4, 1],
    ],
    candidateIds: [1, 2, 3, 4, 5],
  });

  assert.deepEqual(result.rounds[2].counts, [
    { id: 1, votes: 4 },
    { id: 2, votes: 4 },
    { id: 5, votes: 4 },
  ]);
  assert.equal(result.rounds[2].eliminatedId, 2);
});

test('an otherwise unresolved elimination tie removes the lowest candidate id', () => {
  const result = runIrv({ ballots: [[1], [2], [3]], candidateIds: [3, 2, 1] });

  assert.equal(result.rounds[0].eliminatedId, 1);
});

test('a decisive final tie is blocked for maintainer selection', () => {
  const result = runIrv({ ballots: [[2], [1]], candidateIds: [2, 1] });

  assert.equal(result.winnerId, null);
  assert.deepEqual(result.blocked, {
    reason: 'tie',
    tied: [{ id: 1, votes: 1 }, { id: 2, votes: 1 }],
  });
  assert.equal(result.rounds[0].eliminatedId, null);
  assert.equal(result.rounds[0].winnerId, null);
});

test('the same input always produces the same elimination order and winner', () => {
  const input = {
    ballots: [[1], [2], [3], [4, 1], [4, 2], [5, 3]],
    candidateIds: [5, 4, 3, 2, 1],
  };
  const expected = runIrv(input);

  for (let i = 0; i < 10; i += 1) assert.deepEqual(runIrv(input), expected);
});
