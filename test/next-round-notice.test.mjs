import assert from 'node:assert/strict';
import test from 'node:test';

import { getNextRound, toNextRoundNotice } from '../functions/_lib/db.js';

function roundRow(overrides = {}) {
  return {
    id: 31,
    title: 'Next storm',
    meeting_date: '2026-10-05',
    storm_code: 'SECRET-CODE',
    phase: 'suggesting',
    suggestions_open_at: '2026-07-21',
    voting_closes_at: '2026-08-05',
    winner_suggestion_id: null,
    ...overrides,
  };
}

function fakeD1(rows) {
  return {
    prepare(sql) {
      return {
        _sql: sql,
        _args: [],
        bind(...args) {
          this._args = args;
          return this;
        },
        async first() {
          // Mimic "WHERE id > ? ORDER BY id ASC LIMIT 1".
          const after = Number(this._args[0]);
          const candidates = rows
            .filter((r) => r.id > after)
            .sort((a, b) => a.id - b.id);
          return candidates[0] || null;
        },
      };
    },
  };
}

test('toNextRoundNotice exposes public schedule but never the storm code', () => {
  const notice = toNextRoundNotice(roundRow());

  assert.deepEqual(notice, {
    id: 31,
    title: 'Next storm',
    meetingDate: '2026-10-05',
    suggestionsOpenAt: '2026-07-21',
    votingClosesAt: '2026-08-05',
  });
  assert.equal(Object.hasOwn(notice, 'stormCode'), false);
  assert.equal(Object.hasOwn(notice, 'storm_code'), false);
  assert.equal(Object.hasOwn(notice, 'phase'), false);
});

test('toNextRoundNotice returns null without a next round', () => {
  assert.equal(toNextRoundNotice(null), null);
  assert.equal(toNextRoundNotice(undefined), null);
});

test('getNextRound returns the smallest round id greater than the current one', async () => {
  const db = fakeD1([roundRow({ id: 30 }), roundRow({ id: 31 }), roundRow({ id: 33 })]);

  const next = await getNextRound(db, 30);
  assert.equal(next.id, 31);

  const afterLast = await getNextRound(db, 33);
  assert.equal(afterLast, null);
});
