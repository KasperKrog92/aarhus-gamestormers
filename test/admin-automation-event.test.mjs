import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/api/admin/[[route]].js';

// Minimal D1 fake. `round` answers getRoundById; `automationEvents` feeds the
// automation_events SELECT used by GET round; `insertError`, when set, makes the
// automation_events INSERT throw so duplicate/error handling is exercised.
function makeDb({ round = null, automationEvents = [], insertError = null } = {}) {
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
});
