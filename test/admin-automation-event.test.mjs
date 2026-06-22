import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/api/admin/[[route]].js';

// Minimal D1 fake. `round` answers getRoundById; `automationEvents` feeds the
// automation_events SELECT used by GET round; `insertError`, when set, makes the
// automation_events INSERT throw so duplicate/error handling is exercised.
function makeDb({ round = null, automationEvents = [], insertError = null, suggestions = [], votes = [] } = {}) {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async run() {
          statements.push({ sql, args: this.args });
          if (sql.includes('INSERT INTO automation_events')) {
            if (insertError) throw new Error(insertError);
            return { success: true, meta: { last_row_id: 99 } };
          }
          return { success: true, meta: {} };
        },
        async first() {
          if (sql.includes('FROM rounds ORDER BY id DESC')) return round;
          if (sql.includes('FROM rounds WHERE id')) return round;
          if (sql.includes('has_ranked_ballots')) {
            return votes.some((vote) => vote.round_id === this.args[0] && vote.rank != null)
              ? { has_ranked_ballots: 1 }
              : null;
          }
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
          if (sql.startsWith('PRAGMA table_info(votes)')) return { results: [{ name: 'rank' }] };
          if (sql.includes('FROM suggestions WHERE round_id = ?')) return { results: suggestions };
          if (sql.includes('COUNT(*) AS votes')) {
            const counts = new Map();
            votes
              .filter((vote) => vote.round_id === this.args[0] && (vote.rank === 1 || vote.rank == null))
              .forEach((vote) => counts.set(vote.suggestion_id, (counts.get(vote.suggestion_id) || 0) + 1));
            return {
              results: [...counts].map(([suggestion_id, count]) => ({ suggestion_id, votes: count })),
            };
          }
          if (sql.includes('SELECT ballot_id, voter_name, created_at, suggestion_id, rank')) {
            return {
              results: votes
                .filter((vote) => vote.round_id === this.args[0])
                .sort((a, b) => a.ballot_id.localeCompare(b.ballot_id) || a.rank - b.rank),
            };
          }
          if (sql.includes('FROM automation_events')) return { results: automationEvents };
          return { results: [] };
        },
      };
    },
  };
}

function adminRequest(url, method, body) {
  return new Request(url, {
    method,
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('recording an automation event inserts it and reports it as new', async () => {
  const db = makeDb({ round: { id: 19, phase: 'voting' } });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/automation-event', 'POST', {
      roundId: 19,
      eventType: 'voting_opened',
      payload: { posted: true },
    }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['automation-event'] },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, duplicate: false, id: 99 });

  const insert = db.statements.find((s) => s.sql.includes('INSERT INTO automation_events'));
  assert.ok(insert, 'issues the insert');
  assert.deepEqual(insert.args, [19, 'voting_opened', '{"posted":true}']);
});

test('recording accepts newer lifecycle event types', async () => {
  const db = makeDb({ round: { id: 19, phase: 'revealed' } });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/automation-event', 'POST', {
      roundId: 19,
      eventType: 'blocked_alerted',
      payload: { blocker: 'tie' },
    }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['automation-event'] },
  });

  assert.equal(response.status, 200);
  const insert = db.statements.find((s) => s.sql.includes('INSERT INTO automation_events'));
  assert.deepEqual(insert.args, [19, 'blocked_alerted', '{"blocker":"tie"}']);
});


test('recording a duplicate automation event succeeds and flags it', async () => {
  const db = makeDb({
    round: { id: 19, phase: 'voting' },
    insertError: 'D1_ERROR: UNIQUE constraint failed: automation_events.round_id, automation_events.event_type',
  });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/automation-event', 'POST', {
      roundId: 19,
      eventType: 'voting_opened',
    }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['automation-event'] },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, duplicate: true, id: null });
});

test('recording rejects an unknown event type', async () => {
  const db = makeDb({ round: { id: 19, phase: 'voting' } });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/automation-event', 'POST', {
      roundId: 19,
      eventType: 'nope',
    }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['automation-event'] },
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Invalid eventType');
  assert.ok(!db.statements.some((s) => s.sql.includes('INSERT INTO automation_events')), 'never inserts');
});

test('recording rejects a missing round id', async () => {
  const db = makeDb({ round: { id: 19, phase: 'voting' } });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/automation-event', 'POST', {
      eventType: 'voting_opened',
    }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['automation-event'] },
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'roundId required');
});

test('recording returns 404 when the round does not exist', async () => {
  const db = makeDb({ round: null });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/automation-event', 'POST', {
      roundId: 404,
      eventType: 'voting_opened',
    }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['automation-event'] },
  });

  assert.equal(response.status, 404);
});

test('recording requires admin bearer auth', async () => {
  const db = makeDb({ round: { id: 19, phase: 'voting' } });

  const response = await onRequest({
    request: new Request('https://example.com/api/admin/automation-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roundId: 19, eventType: 'voting_opened' }),
    }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['automation-event'] },
  });

  assert.equal(response.status, 401);
  assert.ok(!db.statements.some((s) => s.sql.includes('INSERT INTO automation_events')), 'never inserts');
});

test('GET round includes the recorded automation events', async () => {
  const db = makeDb({
    round: { id: 19, phase: 'voting' },
    automationEvents: [
      {
        id: 1,
        round_id: 19,
        event_type: 'voting_opened',
        payload_json: '{"posted":true}',
        created_at: '2026-06-30 10:00:00',
      },
    ],
  });

  const response = await onRequest({
    request: new Request('https://example.com/api/admin/round/19', {
      method: 'GET',
      headers: { authorization: 'Bearer test' },
    }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['round', '19'] },
  });

  assert.equal(response.status, 200);
  const out = await response.json();
  assert.deepEqual(out.automationEvents, [
    { id: 1, roundId: 19, eventType: 'voting_opened', payload: { posted: true }, createdAt: '2026-06-30 10:00:00' },
  ]);
  assert.equal(out.rcvResult.blocked.reason, 'no_ballots');
});

test('GET round includes the aggregate IRV result for scheduler decisions', async () => {
  const db = makeDb({
    round: { id: 19, phase: 'voting' },
    suggestions: [
      { id: 101, round_id: 19, status: 'approved', title: 'Hollow Knight' },
      { id: 102, round_id: 19, status: 'approved', title: 'Celeste' },
      { id: 103, round_id: 19, status: 'pending', title: 'Pending game' },
    ],
    votes: [
      { round_id: 19, ballot_id: 'a', suggestion_id: 101, rank: 1, voter_name: 'A', created_at: '2026-06-20' },
      { round_id: 19, ballot_id: 'a', suggestion_id: 102, rank: 2, voter_name: 'A', created_at: '2026-06-20' },
      { round_id: 19, ballot_id: 'b', suggestion_id: 101, rank: 1, voter_name: 'B', created_at: '2026-06-21' },
      { round_id: 19, ballot_id: 'c', suggestion_id: 102, rank: 1, voter_name: 'C', created_at: '2026-06-22' },
    ],
  });

  const response = await onRequest({
    request: new Request('https://example.com/api/admin/round/19', {
      method: 'GET',
      headers: { authorization: 'Bearer test' },
    }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['round', '19'] },
  });

  assert.equal(response.status, 200);
  const out = await response.json();
  assert.equal(out.rcvResult.winnerId, 101);
  assert.equal(out.rcvResult.totalBallots, 3);
  assert.deepEqual(out.rcvResult.rounds[0].counts, [
    { id: 101, votes: 2 },
    { id: 102, votes: 1 },
  ]);
  assert.deepEqual(out.tallies, { 101: 2, 102: 1 });
  assert.ok(out.rcvResult.rounds[0].counts.every((count) => count.id !== 103));
});
