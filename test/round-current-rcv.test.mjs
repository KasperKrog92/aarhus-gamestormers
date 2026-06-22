import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestGet } from '../functions/api/round/current.js';

function makeDb({ phase = 'voting', votes = [] } = {}) {
  const round = {
    id: 19,
    title: 'Meeting 19',
    phase,
    meeting_date: '2026-08-01',
    suggestions_open_at: '2026-06-01',
    voting_opens_at: '2026-06-10',
    voting_closes_at: '2026-07-08',
    winner_suggestion_id: phase === 'revealed' ? 7 : null,
  };
  const suggestions = [
    { id: 7, round_id: 19, status: 'approved', title: 'Alpha', created_at: '2026-06-01' },
    { id: 8, round_id: 19, status: 'approved', title: 'Beta', created_at: '2026-06-02' },
  ];

  function statement(sql, args = []) {
    return {
      bind(...nextArgs) {
        return statement(sql, nextArgs);
      },
      async first() {
        if (sql.includes("phase != 'closed'")) return round;
        if (sql.includes('ORDER BY id DESC')) return round;
        if (sql.includes('WHERE id > ?')) return null;
        if (sql.includes('COUNT(DISTINCT ballot_id)')) {
          return { count: new Set(votes.filter((vote) => vote.round_id === args[0]).map((vote) => vote.ballot_id)).size };
        }
        if (sql.includes('has_ranked_ballots')) {
          return votes.some((vote) => vote.round_id === args[0] && vote.rank != null)
            ? { has_ranked_ballots: 1 }
            : null;
        }
        return null;
      },
      async all() {
        if (sql.startsWith('PRAGMA table_info(rounds)')) {
          return {
            results: [
              'meeting_date',
              'suggestions_open_months_before',
              'voting_opens_months_before',
              'voting_closes_months_before',
              'suggestions_open_at',
              'voting_opens_at',
              'voting_closes_at',
            ].map((name) => ({ name })),
          };
        }
        if (sql.startsWith('PRAGMA table_info(votes)')) return { results: [{ name: 'rank' }] };
        if (sql.includes("r.phase = 'revealed'")) {
          return {
            results: phase === 'revealed'
              ? [{ id: round.id, closes_at: round.voting_closes_at, next_opens_at: null }]
              : [],
          };
        }
        if (sql.includes("FROM suggestions WHERE round_id = ? AND status = 'approved'")) {
          return { results: suggestions };
        }
        if (sql.includes('SELECT ballot_id, suggestion_id, rank, created_at')) {
          return {
            results: votes
              .filter((vote) => vote.round_id === args[0])
              .sort((a, b) => (
                a.ballot_id.localeCompare(b.ballot_id)
                || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
                || a.suggestion_id - b.suggestion_id
              )),
          };
        }
        if (sql.includes('COUNT(*) AS votes')) {
          const counts = new Map();
          votes
            .filter((vote) => vote.round_id === args[0] && (vote.rank === 1 || vote.rank == null))
            .forEach((vote) => counts.set(vote.suggestion_id, (counts.get(vote.suggestion_id) || 0) + 1));
          return {
            results: [...counts].map(([suggestion_id, count]) => ({ suggestion_id, votes: count })),
          };
        }
        return { results: [] };
      },
      async run() {
        return { success: true };
      },
    };
  }

  return { prepare: (sql) => statement(sql) };
}

async function currentPayload(options) {
  const response = await onRequestGet({ env: { DB: makeDb(options) } });
  assert.equal(response.status, 200);
  return response.json();
}

test('voting payload exposes distinct turnout but hides rankings and candidate counts', async () => {
  const payload = await currentPayload({
    phase: 'voting',
    votes: [
      { round_id: 19, ballot_id: 'a', suggestion_id: 7, rank: 1 },
      { round_id: 19, ballot_id: 'a', suggestion_id: 8, rank: 2 },
      { round_id: 19, ballot_id: 'b', suggestion_id: 8, rank: 1 },
    ],
  });

  assert.equal(payload.round.ballotCount, 2);
  assert.equal(payload.rcvResult, undefined);
  assert.ok(payload.suggestions.every((suggestion) => suggestion.votes === undefined));
  assert.doesNotMatch(JSON.stringify(payload), /ballotId|rankings|discord_user_id|voter_name/);
});

test('revealed ranked payload exposes aggregate IRV rounds and first preferences only', async () => {
  const payload = await currentPayload({
    phase: 'revealed',
    votes: [
      { round_id: 19, ballot_id: 'a', suggestion_id: 7, rank: 1, created_at: '2026-06-20' },
      { round_id: 19, ballot_id: 'a', suggestion_id: 8, rank: 2, created_at: '2026-06-20' },
      { round_id: 19, ballot_id: 'b', suggestion_id: 8, rank: 1, created_at: '2026-06-21' },
      { round_id: 19, ballot_id: 'b', suggestion_id: 7, rank: 2, created_at: '2026-06-21' },
      { round_id: 19, ballot_id: 'c', suggestion_id: 7, rank: 1, created_at: '2026-06-22' },
    ],
  });

  assert.equal(payload.round.ballotCount, 3);
  assert.equal(payload.rcvResult.winnerId, 7);
  assert.equal(payload.rcvResult.totalBallots, 3);
  assert.deepEqual(payload.rcvResult.rounds[0].counts, [
    { id: 7, votes: 2 },
    { id: 8, votes: 1 },
  ]);
  assert.deepEqual(payload.suggestions.map(({ id, votes }) => ({ id, votes })), [
    { id: 7, votes: 2 },
    { id: 8, votes: 1 },
  ]);
  assert.doesNotMatch(JSON.stringify(payload), /ballotId|rankings|discord_user_id|voter_name/);
});

test('revealed legacy approval rows keep aggregate counts without an IRV result', async () => {
  const payload = await currentPayload({
    phase: 'revealed',
    votes: [
      { round_id: 19, ballot_id: 'legacy-a', suggestion_id: 7, rank: null },
      { round_id: 19, ballot_id: 'legacy-a', suggestion_id: 8, rank: null },
    ],
  });

  assert.equal(payload.round.ballotCount, 1);
  assert.equal(payload.rcvResult, undefined);
  assert.deepEqual(payload.suggestions.map(({ id, votes }) => ({ id, votes })), [
    { id: 7, votes: 1 },
    { id: 8, votes: 1 },
  ]);
});
