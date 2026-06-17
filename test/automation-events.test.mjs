import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAutomationEvents,
  isUniqueConstraintError,
  recordAutomationEvent,
  toAutomationEvent,
} from '../functions/_lib/db.js';

// Minimal D1 fake. `rows` feeds SELECT results; `insertError`, when set, makes
// the INSERT throw so duplicate/error handling can be exercised. CREATE TABLE /
// CREATE INDEX from ensureAutomationEventTable run through `run()` untouched.
function makeDb({ rows = [], insertError = null } = {}) {
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
            return { success: true, meta: { last_row_id: 42 } };
          }
          return { success: true, meta: {} };
        },
        async all() {
          statements.push({ sql, args: this.args });
          if (sql.includes('FROM automation_events')) return { results: rows };
          return { results: [] };
        },
        async first() {
          return null;
        },
      };
    },
  };
}

test('recordAutomationEvent inserts a stringified payload and reports the new id', async () => {
  const db = makeDb();
  const result = await recordAutomationEvent(db, 19, 'voting_opened', { posted: true });

  assert.deepEqual(result, { duplicate: false, id: 42 });
  const insert = db.statements.find((s) => s.sql.includes('INSERT INTO automation_events'));
  assert.ok(insert, 'issues the insert');
  assert.deepEqual(insert.args, [19, 'voting_opened', '{"posted":true}']);
});

test('recordAutomationEvent stores a null payload when none is given', async () => {
  const db = makeDb();
  await recordAutomationEvent(db, 19, 'handoff_generated');

  const insert = db.statements.find((s) => s.sql.includes('INSERT INTO automation_events'));
  assert.equal(insert.args[2], null);
});

test('recordAutomationEvent reports a duplicate instead of throwing on a unique violation', async () => {
  const db = makeDb({
    insertError: 'D1_ERROR: UNIQUE constraint failed: automation_events.round_id, automation_events.event_type',
  });
  const result = await recordAutomationEvent(db, 19, 'voting_opened', { posted: true });

  assert.deepEqual(result, { duplicate: true, id: null });
});

test('recordAutomationEvent rethrows errors that are not unique violations', async () => {
  const db = makeDb({ insertError: 'D1_ERROR: no such table: automation_events' });

  await assert.rejects(() => recordAutomationEvent(db, 19, 'voting_opened', {}), /no such table/);
});

test('getAutomationEvents shapes rows and parses the JSON payload', async () => {
  const db = makeDb({
    rows: [
      {
        id: 1,
        round_id: 19,
        event_type: 'voting_opened',
        payload_json: '{"posted":true}',
        created_at: '2026-06-30 10:00:00',
      },
      {
        id: 2,
        round_id: 19,
        event_type: 'winner_revealed',
        payload_json: null,
        created_at: '2026-07-10 10:00:00',
      },
    ],
  });

  const events = await getAutomationEvents(db, 19);

  assert.deepEqual(events, [
    { id: 1, roundId: 19, eventType: 'voting_opened', payload: { posted: true }, createdAt: '2026-06-30 10:00:00' },
    { id: 2, roundId: 19, eventType: 'winner_revealed', payload: null, createdAt: '2026-07-10 10:00:00' },
  ]);
  const select = db.statements.find((s) => s.sql.includes('FROM automation_events'));
  assert.deepEqual(select.args, [19], 'binds the round id');
});

test('getAutomationEvents tolerates malformed payload JSON', async () => {
  const db = makeDb({
    rows: [
      {
        id: 3,
        round_id: 19,
        event_type: 'handoff_generated',
        payload_json: 'not json',
        created_at: '2026-07-11 10:00:00',
      },
    ],
  });

  const events = await getAutomationEvents(db, 19);
  assert.equal(events[0].payload, null);
});

test('toAutomationEvent shapes a single row without a DB round-trip', () => {
  assert.deepEqual(
    toAutomationEvent({
      id: 7,
      round_id: 20,
      event_type: 'voting_opened',
      payload_json: '{"channel":"voting"}',
      created_at: '2026-08-01 09:00:00',
    }),
    { id: 7, roundId: 20, eventType: 'voting_opened', payload: { channel: 'voting' }, createdAt: '2026-08-01 09:00:00' }
  );
});

test('isUniqueConstraintError detects D1 unique violations only', () => {
  assert.equal(
    isUniqueConstraintError(new Error('D1_ERROR: UNIQUE constraint failed: automation_events.round_id')),
    true
  );
  assert.equal(isUniqueConstraintError(new Error('D1_ERROR: no such table')), false);
  assert.equal(isUniqueConstraintError(null), false);
});
