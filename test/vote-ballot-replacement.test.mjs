import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestPost } from '../functions/api/vote.js';
import { onRequestGet as onRequestGetMine } from '../functions/api/vote/mine.js';

function makeDb() {
  const state = {
    votes: [],
    round: {
      id: 19,
      phase: 'voting',
      suggestions_open_at: '2026-06-10',
      voting_opens_at: '2026-06-13',
      voting_closes_at: '2026-07-08',
    },
    suggestions: [
      { id: 7, round_id: 19, status: 'approved', created_at: '2026-06-01' },
      { id: 8, round_id: 19, status: 'approved', created_at: '2026-06-02' },
      { id: 9, round_id: 19, status: 'pending', created_at: '2026-06-03' },
    ],
    sessionUser: {
      discord_id: '123456789',
      username: 'Kasper',
      avatar: null,
      is_gamestormers_member: 1,
    },
  };

  function statement(sql, args = []) {
    return {
      bind(...nextArgs) {
        return statement(sql, nextArgs);
      },
      async first() {
        if (sql.includes('FROM auth_sessions s')) {
          return state.sessionUser;
        }
        if (sql.startsWith('SELECT ballot_id FROM votes')) {
          const found = state.votes.find((v) => v.round_id === args[0] && v.discord_user_id === args[1]);
          return found ? { ballot_id: found.ballot_id } : null;
        }
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
        if (sql.startsWith('PRAGMA table_info(suggestions)')) {
          return { results: [{ name: 'discord_user_id' }] };
        }
        if (sql.startsWith('PRAGMA table_info(votes)')) {
          return { results: [{ name: 'discord_user_id' }, { name: 'rank' }] };
        }
        if (sql.includes("r.phase = 'revealed'")) return { results: [] };
        if (sql.includes('FROM votes') && sql.includes('SELECT suggestion_id')) {
          return {
            results: state.votes
              .filter((v) => v.round_id === args[0] && v.discord_user_id === args[1])
              .sort((a, b) => a.rank - b.rank)
              .map((v) => ({ suggestion_id: v.suggestion_id })),
          };
        }
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
        if (sql.startsWith('DELETE FROM votes WHERE round_id = ? AND discord_user_id = ?')) {
          state.votes = state.votes.filter((v) => !(v.round_id === args[0] && v.discord_user_id === args[1]));
        }
        if (sql.startsWith('INSERT INTO votes')) {
          state.votes.push({
            round_id: args[0],
            suggestion_id: args[1],
            ballot_id: args[2],
            rank: args[3],
            voter_name: args[4],
            discord_user_id: args[5],
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
    headers: { 'content-type': 'application/json', cookie: 'gs_session=test-session' },
    body: JSON.stringify(body),
  });
}

test('submitting again as the same Discord user replaces the previous ballot rows', async () => {
  const db = makeDb();
  const env = { DB: db, SESSION_SECRET: 'test-secret' };
    const first = await onRequestPost({
      request: voteRequest({
        rankings: [7, 8],
      }),
      env,
    });
    const firstBody = await first.json();

    assert.equal(first.status, 201);
    assert.equal(firstBody.counted, 2);
    assert.equal(firstBody.replaced, false);
    assert.deepEqual(db.state.votes.map((v) => v.suggestion_id), [7, 8]);
    assert.deepEqual(db.state.votes.map((v) => v.rank), [1, 2]);
    const ballotId = db.state.votes[0].ballot_id;

    const second = await onRequestPost({
      request: voteRequest({
        rankings: [8],
      }),
      env,
    });
    const secondBody = await second.json();

    assert.equal(second.status, 200);
    assert.equal(secondBody.counted, 1);
    assert.equal(secondBody.replaced, true);
    assert.deepEqual(db.state.votes, [
      {
        round_id: 19,
        suggestion_id: 8,
        ballot_id: ballotId,
        rank: 1,
        voter_name: 'Kasper',
        discord_user_id: '123456789',
      },
    ]);
});

test('rankings preserve order while duplicates and non-approved ids are removed', async () => {
  const db = makeDb();
  const response = await onRequestPost({
    request: voteRequest({ rankings: [8, '7', 8, 9, 999, 7] }),
    env: { DB: db, SESSION_SECRET: 'test-secret' },
  });

  assert.equal(response.status, 201);
  assert.deepEqual(db.state.votes.map((vote) => [vote.suggestion_id, vote.rank]), [
    [8, 1],
    [7, 2],
  ]);
});

test('a ranking with no approved games is rejected without replacing the ballot', async () => {
  const db = makeDb();
  db.state.votes.push({
    round_id: 19,
    suggestion_id: 7,
    ballot_id: 'existing-ballot',
    rank: 1,
    voter_name: 'Kasper',
    discord_user_id: '123456789',
  });

  const response = await onRequestPost({
    request: voteRequest({ rankings: [9, 999] }),
    env: { DB: db, SESSION_SECRET: 'test-secret' },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(db.state.votes.map((vote) => vote.suggestion_id), [7]);
});

test('an empty ranking is rejected', async () => {
  const db = makeDb();
  const response = await onRequestPost({
    request: voteRequest({ rankings: [] }),
    env: { DB: db, SESSION_SECRET: 'test-secret' },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Rank at least one game' });
  assert.deepEqual(db.state.votes, []);
});

test('suggestionIds remains a transitional alias for the current frontend', async () => {
  const db = makeDb();
  const response = await onRequestPost({
    request: voteRequest({ suggestionIds: [8, 7] }),
    env: { DB: db, SESSION_SECRET: 'test-secret' },
  });

  assert.equal(response.status, 201);
  assert.deepEqual(db.state.votes.map((vote) => [vote.suggestion_id, vote.rank]), [
    [8, 1],
    [7, 2],
  ]);
});

test('GET /api/vote/mine returns only the member current-round ranking in rank order', async () => {
  const db = makeDb();
  db.state.votes.push(
    {
      round_id: 19,
      suggestion_id: 8,
      ballot_id: 'mine',
      rank: 2,
      voter_name: 'Kasper',
      discord_user_id: '123456789',
    },
    {
      round_id: 19,
      suggestion_id: 7,
      ballot_id: 'mine',
      rank: 1,
      voter_name: 'Kasper',
      discord_user_id: '123456789',
    },
    {
      round_id: 19,
      suggestion_id: 9,
      ballot_id: 'someone-else',
      rank: 1,
      voter_name: 'Someone else',
      discord_user_id: 'other-user',
    },
    {
      round_id: 18,
      suggestion_id: 9,
      ballot_id: 'old',
      rank: 1,
      voter_name: 'Kasper',
      discord_user_id: '123456789',
    }
  );

  const response = await onRequestGetMine({
    request: new Request('https://example.com/api/vote/mine', {
      headers: { cookie: 'gs_session=test-session' },
    }),
    env: { DB: db, SESSION_SECRET: 'test-secret' },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { rankings: [7, 8] });
});

test('GET /api/vote/mine rejects a logged-in Discord user who is not a member', async () => {
  const db = makeDb();
  db.state.sessionUser.is_gamestormers_member = 0;

  const response = await onRequestGetMine({
    request: new Request('https://example.com/api/vote/mine', {
      headers: { cookie: 'gs_session=test-session' },
    }),
    env: { DB: db, SESSION_SECRET: 'test-secret' },
  });

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.match(body.error, /not in the Aarhus Gamestormers server/);
  assert.equal(body.rankings, undefined);
});
