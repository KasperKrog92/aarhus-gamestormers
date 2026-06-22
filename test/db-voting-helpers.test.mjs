import assert from 'node:assert/strict';
import test from 'node:test';

import { getBallotCount, getBallots, getRankedBallots, getTallies } from '../functions/_lib/db.js';

function fakeDb({ rows = [], count = 0, tallies = [] } = {}) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async all() {
              if (sql.includes('COUNT(*) AS votes')) return { results: tallies };
              return { results: rows };
            },
            async first() {
              return { count };
            },
          };
        },
      };
    },
  };
}

test('getRankedBallots groups rank-ordered vote rows without voter metadata', async () => {
  const db = fakeDb({
    rows: [
      { ballot_id: 'a', suggestion_id: 9, rank: 1, created_at: '2026-06-22 10:00:00' },
      { ballot_id: 'a', suggestion_id: 4, rank: 2, created_at: '2026-06-22 10:00:00' },
      { ballot_id: 'b', suggestion_id: 4, rank: 1, created_at: '2026-06-22 11:00:00' },
    ],
  });

  assert.deepEqual(await getRankedBallots(db, 3), [
    { ballotId: 'a', rankings: [9, 4] },
    { ballotId: 'b', rankings: [4] },
  ]);
});

test('getBallots returns rankings and keeps ballots ordered by their earliest row', async () => {
  const db = fakeDb({
    rows: [
      { ballot_id: 'a', voter_name: 'Ada', suggestion_id: 9, rank: 1, created_at: '2026-06-22 12:00:00' },
      { ballot_id: 'a', voter_name: 'Ada', suggestion_id: 4, rank: 2, created_at: '2026-06-22 12:00:00' },
      { ballot_id: 'b', voter_name: null, suggestion_id: 4, rank: 1, created_at: '2026-06-22 10:00:00' },
    ],
  });

  assert.deepEqual(await getBallots(db, 3), [
    { ballotId: 'b', rankings: [4], voterName: null, createdAt: '2026-06-22 10:00:00' },
    { ballotId: 'a', rankings: [9, 4], voterName: 'Ada', createdAt: '2026-06-22 12:00:00' },
  ]);
});

test('getBallotCount returns the distinct ballot count', async () => {
  assert.equal(await getBallotCount(fakeDb({ count: 2 }), 3), 2);
  assert.equal(await getBallotCount(fakeDb({ count: null }), 3), 0);
});

test('getTallies shapes first-preference and legacy aggregate rows', async () => {
  const db = fakeDb({ tallies: [{ suggestion_id: 4, votes: 2 }, { suggestion_id: 9, votes: 1 }] });
  assert.deepEqual(await getTallies(db, 3), { 4: 2, 9: 1 });
});
