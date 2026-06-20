import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/api/admin/[[route]].js';

function fakeD1() {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      const statement = {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async run() {
          statements.push({ sql, args: this.args });
          return { success: true, meta: {} };
        },
        async first() {
          if (sql.includes('SELECT * FROM rounds WHERE id = ?')) return null;
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
          return { results: [] };
        },
      };
      return statement;
    },
  };
}

test('opening a round creates the matching public meeting row', async () => {
  const db = fakeD1();
  const request = new Request('https://example.com/api/admin/round', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: 19,
      title: 'Meeting 19',
      meetingDate: '2026-08-03',
      meetingStartTime: '18:30',
      meetingEndTime: '21:00',
      venueName: 'Folkehuset Møllestien',
      venueAddress: 'Grønnegade 10, 8000 Aarhus C',
      discordInvite: 'https://discord.gg/N2h6DJxVDF',
    }),
  });

  const response = await onRequest({
    request,
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['round'] },
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(body, { ok: true, id: 19, meeting: true });

  const roundInsert = db.statements.find((entry) => entry.sql.includes('INSERT INTO rounds'));
  assert.ok(roundInsert);
  assert.equal(roundInsert.args[0], 19);
  assert.equal(roundInsert.args[4], 2.8);
  assert.equal(roundInsert.args[5], 2.5);
  assert.equal(roundInsert.args[6], 2.2);
  assert.equal(roundInsert.args[7], '2026-05-10');
  assert.equal(roundInsert.args[8], '2026-05-19');
  assert.equal(roundInsert.args[9], '2026-05-28');

  const meetingUpsert = db.statements.find((entry) => entry.sql.includes('INSERT INTO meetings'));
  assert.ok(meetingUpsert);
  assert.equal(meetingUpsert.args[0], 19);
  assert.equal(meetingUpsert.args[1], '2026-08-03');
  assert.equal(meetingUpsert.args[2], '2026-08-03T16:30:00.000Z');
  assert.equal(meetingUpsert.args[3], '2026-08-03T19:00:00.000Z');
  assert.equal(meetingUpsert.args[4], 'Europe/Copenhagen');
  assert.equal(meetingUpsert.args[5], 'Folkehuset Møllestien');
  assert.equal(meetingUpsert.args[6], 'Grønnegade 10, 8000 Aarhus C');
  assert.equal(meetingUpsert.args[7], 'https://discord.gg/N2h6DJxVDF');
  assert.equal(meetingUpsert.args[8], null);
  assert.equal(meetingUpsert.args[9], 'suggesting');
});

test('deleting a round removes only the round and leaves the public meeting row', async () => {
  const db = fakeD1();
  const request = new Request('https://example.com/api/admin/round/19', {
    method: 'DELETE',
    headers: { authorization: 'Bearer test' },
  });

  const response = await onRequest({
    request,
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['round', '19'] },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });

  const roundDelete = db.statements.find((entry) => entry.sql.includes('DELETE FROM rounds'));
  assert.ok(roundDelete, 'should delete from rounds');
  assert.deepEqual(roundDelete.args, [19]);

  // Round-only semantics: nothing should ever touch the public meetings table.
  const touchesMeetings = db.statements.some((entry) => /\bmeetings\b/i.test(entry.sql));
  assert.equal(touchesMeetings, false, 'round delete must not modify the meetings table');
});
