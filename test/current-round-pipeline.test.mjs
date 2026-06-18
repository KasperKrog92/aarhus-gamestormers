import assert from 'node:assert/strict';
import test from 'node:test';

import { closeDueRevealedRounds, getCurrentRound } from '../functions/_lib/db.js';

// Minimal in-memory D1 stand-in that understands exactly the queries
// getCurrentRound and closeDueRevealedRounds issue. Backed by a mutable array of
// round rows so the lazy close is observable.
function makeDb(rounds) {
  const store = rounds.map((r) => ({ ...r }));
  function statement(sql) {
    let args = [];
    return {
      bind(...a) {
        args = a;
        return this;
      },
      async first() {
        if (sql.includes("phase != 'closed'")) {
          return store.filter((r) => r.phase !== 'closed').sort((a, b) => a.id - b.id)[0] || null;
        }
        if (sql.includes('ORDER BY id DESC')) {
          return store.slice().sort((a, b) => b.id - a.id)[0] || null;
        }
        return null;
      },
      async all() {
        if (sql.includes("r.phase = 'revealed'")) {
          const results = store
            .filter((r) => r.phase === 'revealed')
            .map((r) => {
              const next = store.filter((n) => n.id > r.id).sort((a, b) => a.id - b.id)[0];
              return {
                id: r.id,
                closes_at: r.voting_closes_at,
                next_opens_at: next ? next.suggestions_open_at : null,
              };
            });
          return { results };
        }
        return { results: [] };
      },
      async run() {
        if (sql.startsWith("UPDATE rounds SET phase = 'closed'")) {
          const id = Number(args[0]);
          const row = store.find((r) => r.id === id && r.phase === 'revealed');
          if (row) row.phase = 'closed';
        }
        return { success: true };
      },
    };
  }
  return { prepare: (sql) => statement(sql), _store: store };
}

// Production-like pipeline: meetings 19-22, monthly cadence.
function pipeline(overrides = {}) {
  const base = [
    { id: 19, phase: 'suggesting', voting_closes_at: '2026-07-08', suggestions_open_at: '2026-06-20' },
    { id: 20, phase: 'suggesting', voting_closes_at: '2026-07-30', suggestions_open_at: '2026-07-12' },
    { id: 21, phase: 'suggesting', voting_closes_at: '2026-08-27', suggestions_open_at: '2026-08-09' },
    { id: 22, phase: 'suggesting', voting_closes_at: '2026-10-01', suggestions_open_at: '2026-09-13' },
  ];
  return base.map((r) => ({ ...r, ...(overrides[r.id] || {}) }));
}

test('current round is the earliest non-closed round, not the highest id', async () => {
  const db = makeDb(pipeline());
  const round = await getCurrentRound(db, new Date('2026-06-18T12:00:00Z'));
  assert.equal(round.id, 19);
});

test('a revealed round stays current until the halfway point before the next round opens', async () => {
  const db = makeDb(pipeline({ 19: { phase: 'revealed' } }));
  // Midpoint between 19 close (07-08) and 20 suggestions open (07-12) is 07-10.
  const beforeHalfway = await getCurrentRound(db, new Date('2026-07-09T12:00:00Z'));
  assert.equal(beforeHalfway.id, 19);
  assert.equal(beforeHalfway.phase, 'revealed');
});

test('a revealed round closes at the halfway point and hands off to the next round', async () => {
  const db = makeDb(pipeline({ 19: { phase: 'revealed' } }));
  const round = await getCurrentRound(db, new Date('2026-07-10T12:00:00Z'));
  assert.equal(round.id, 20);
  assert.equal(db._store.find((r) => r.id === 19).phase, 'closed');
});

test('the last revealed round keeps showing its winner when no successor exists', async () => {
  const db = makeDb([
    { id: 22, phase: 'revealed', voting_closes_at: '2026-10-01', suggestions_open_at: '2026-09-13' },
  ]);
  const round = await getCurrentRound(db, new Date('2027-01-01T12:00:00Z'));
  assert.equal(round.id, 22);
  assert.equal(round.phase, 'revealed');
});

test('when every round is closed, fall back to the most recent round', async () => {
  const db = makeDb(
    pipeline({
      19: { phase: 'closed' },
      20: { phase: 'closed' },
      21: { phase: 'closed' },
      22: { phase: 'closed' },
    })
  );
  const round = await getCurrentRound(db, new Date('2027-01-01T12:00:00Z'));
  assert.equal(round.id, 22);
});

test('closeDueRevealedRounds leaves a revealed round open before its halfway point', async () => {
  const db = makeDb(pipeline({ 19: { phase: 'revealed' } }));
  await closeDueRevealedRounds(db, new Date('2026-07-09T12:00:00Z'));
  assert.equal(db._store.find((r) => r.id === 19).phase, 'revealed');
});
