import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestPost } from '../functions/api/vote.js';

function makeDb() {
  const state = {
    votes: [],
    round: {
      id: 19,
      phase: 'voting',
      storm_code: 'storm19',
      suggestions_open_at: '2026-06-10',
      voting_opens_at: '2026-06-13',
      voting_closes_at: '2026-07-08',
    },
    suggestions: [
      { id: 7, round_id: 19, status: 'approved', created_at: '2026-06-01' },
      { id: 8, round_id: 19, status: 'approved', created_at: '2026-06-02' },
      { id: 9, round_id: 19, status: 'pending', created_at: '2026-06-03' },
    ],
  };

  function statement(sql, args = []) {
    return {
      bind(...nextArgs) {
        return statement(sql, nextArgs);
      },
      async first() {
        if (sql.includes("phase != 'closed'")) return state.round;
        if (sql.includes('ORDER BY id DESC')) return state.round;
        return null;
      },
      async all() {
        if (sql.startsWith('PRAGMA table_info(rounds)')) {
          return {
            results: [
              { name: 'meeting_date' },
              { name: 'suggestions_open_months_before' },
              { name: 'voting_opens_months_before' },
              { name: 'voting_closes_months_before' },
              { name: 'suggestions_open_at' },
              { name: 'voting_opens_at' },
            ],
          };
        }
        if (sql.includes("r.phase = 'revealed'")) return { results: [] };
        if (sql.includes('FROM suggestions')) {
          return {
            results: state.suggestions
              .filter((s) => s.round_id === args[0] && (!sql.includes("status = 'approved'") || s.status === 'approved'))
              .sort((a, b) => a.id - b.id),
          };
        }
        return { results: [] };
      },
      async run() {
        if (sql.startsWith('DELETE FROM votes WHERE round_id = ? AND ballot_id = ?')) {
          state.votes = state.votes.filter((v) => !(v.round_id === args[0] && v.ballot_id === args[1]));
        }
        if (sql.startsWith('INSERT INTO votes')) {
          state.votes.push({
            round_id: args[0],
            suggestion_id: args[1],
            ballot_id: args[2],
            voter_name: args[3],
          });
        }
        return { success: true, meta: {} };
      },
    };
  }

  return {
    state,
    prepare(sql) {
      return statement(sql);
    },
    async batch(statements) {
      for (const stmt of statements) await stmt.run();
      return statements.map(() => ({ success: true }));
    },
  };
}

function voteRequest(body) {
  return new Request('https://example.com/api/vote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('submitting with a stored ballot id replaces the previous ballot rows', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), {
    headers: { 'content-type': 'application/json' },
  });

  try {
    const db = makeDb();
    const env = { DB: db, TURNSTILE_SECRET: 'test-secret' };
    const first = await onRequestPost({
      request: voteRequest({
        suggestionIds: [7, 8],
        voterName: 'Kasper',
        stormCode: 'storm19',
        turnstileToken: 'ok',
      }),
      env,
    });
    const firstBody = await first.json();

    assert.equal(first.status, 201);
    assert.equal(firstBody.counted, 2);
    assert.equal(firstBody.replaced, false);
    assert.deepEqual(db.state.votes.map((v) => v.suggestion_id), [7, 8]);

    const second = await onRequestPost({
      request: voteRequest({
        suggestionIds: [8],
        voterName: 'Kasper',
        stormCode: 'storm19',
        turnstileToken: 'ok',
        ballotId: firstBody.ballotId,
      }),
      env,
    });
    const secondBody = await second.json();

    assert.equal(second.status, 200);
    assert.equal(secondBody.ballotId, firstBody.ballotId);
    assert.equal(secondBody.counted, 1);
    assert.equal(secondBody.replaced, true);
    assert.deepEqual(db.state.votes, [
      {
        round_id: 19,
        suggestion_id: 8,
        ballot_id: firstBody.ballotId,
        voter_name: 'Kasper',
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
