import assert from 'node:assert/strict';
import test from 'node:test';

import { isAdmin } from '../functions/_lib/auth.js';
import { isHttpUrl, readJson } from '../functions/_lib/http.js';
import { onRequest } from '../functions/api/admin/[[route]].js';

test('isHttpUrl validation helper', () => {
  assert.equal(isHttpUrl('https://example.com'), true);
  assert.equal(isHttpUrl('http://example.com/some/path?query=1'), true);
  assert.equal(isHttpUrl('ftp://example.com'), false);
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
  assert.equal(isHttpUrl('data:text/html,<html></html>'), false);
  assert.equal(isHttpUrl('plain-text-no-scheme'), false);
  assert.equal(isHttpUrl(null), false);
  assert.equal(isHttpUrl(''), false);
});

test('isAdmin asynchronous token check', async () => {
  const env = { ADMIN_TOKEN: 'super-secret-admin-token' };

  // Valid token
  const req1 = new Request('http://example.com', {
    headers: { authorization: 'Bearer super-secret-admin-token' },
  });
  assert.equal(await isAdmin(req1, env), true);

  // Invalid token (same length)
  const req2 = new Request('http://example.com', {
    headers: { authorization: 'Bearer super-secret-admin-tokeX' },
  });
  assert.equal(await isAdmin(req2, env), false);

  // Invalid token (different length)
  const req3 = new Request('http://example.com', {
    headers: { authorization: 'Bearer short' },
  });
  assert.equal(await isAdmin(req3, env), false);

  // Missing header
  const req4 = new Request('http://example.com');
  assert.equal(await isAdmin(req4, env), false);

  // Environment without ADMIN_TOKEN configured
  assert.equal(await isAdmin(req1, {}), false);
});

test('readJson hardened request parsing', async () => {
  // Valid JSON and correct Content-Type
  const req1 = new Request('http://example.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true }),
    duplex: 'half',
  });
  const res1 = await readJson(req1);
  assert.deepEqual(res1, { ok: true });

  // Invalid Content-Type
  const req2 = new Request('http://example.com', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ ok: true }),
    duplex: 'half',
  });
  const res2 = await readJson(req2);
  assert.ok(res2 instanceof Response);
  assert.equal(res2.status, 415);

  // Payload too large via Content-Length header
  const req3 = new Request('http://example.com', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': '100000',
    },
    body: JSON.stringify({ ok: true }),
    duplex: 'half',
  });
  const res3 = await readJson(req3, 50); // limit to 50 bytes
  assert.ok(res3 instanceof Response);
  assert.equal(res3.status, 413);

  // Payload too large via dynamic stream check
  const largeJson = JSON.stringify({ data: 'A'.repeat(1000) });
  const req4 = new Request('http://example.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: largeJson,
    duplex: 'half',
  });
  const res4 = await readJson(req4, 100); // limit to 100 bytes
  assert.ok(res4 instanceof Response);
  assert.equal(res4.status, 413);

  // Invalid JSON body
  const req5 = new Request('http://example.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{invalid-json',
    duplex: 'half',
  });
  const res5 = await readJson(req5);
  assert.ok(res5 instanceof Response);
  assert.equal(res5.status, 400);
});

function makeDb(state) {
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
          return { success: true, meta: {} };
        },
        async first() {
          if (sql.includes('FROM rounds WHERE id')) return state.round || null;
          if (sql.includes('FROM meetings WHERE id')) return state.meeting || null;
          if (sql.includes('FROM suggestions WHERE id')) return state.suggestion || null;
          if (sql.includes('FROM games WHERE id')) return state.game || null;
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
          if (sql.includes('FROM meeting_copy')) return { results: state.copy || [] };
          return { results: [] };
        },
      };
    },
  };
}

test('adminPatchMeeting URL protocol validation', async () => {
  const db = makeDb({
    meeting: { id: 19, selected_game_id: 5 },
    game: { id: 5, title: 'Portal' },
  });

  // Valid patch
  const req1 = new Request('https://example.com/api/admin/meeting/19', {
    method: 'PATCH',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify({
      storeUrl: 'https://store.steampowered.com/app/400',
    }),
    duplex: 'half',
  });
  const res1 = await onRequest({
    request: req1,
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['meeting', '19'] },
  });
  assert.equal(res1.status, 200);

  // Invalid patch (javascript:)
  const req2 = new Request('https://example.com/api/admin/meeting/19', {
    method: 'PATCH',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify({
      storeUrl: 'javascript:alert(1)',
    }),
    duplex: 'half',
  });
  const res2 = await onRequest({
    request: req2,
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['meeting', '19'] },
  });
  assert.equal(res2.status, 400);
  const out2 = await res2.json();
  assert.equal(out2.error, 'Store link must be a valid http(s) URL.');
});

test('adminPatchSuggestion URL protocol validation', async () => {
  const db = makeDb({
    suggestion: { id: 10, round_id: 19 },
  });

  // Valid patch
  const req1 = new Request('https://example.com/api/admin/suggestion/10', {
    method: 'PATCH',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify({
      storeUrl: 'https://store.steampowered.com/app/400',
    }),
    duplex: 'half',
  });
  const res1 = await onRequest({
    request: req1,
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['suggestion', '10'] },
  });
  assert.equal(res1.status, 200);

  // Invalid patch (javascript:)
  const req2 = new Request('https://example.com/api/admin/suggestion/10', {
    method: 'PATCH',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify({
      storeUrl: 'javascript:alert(1)',
    }),
    duplex: 'half',
  });
  const res2 = await onRequest({
    request: req2,
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['suggestion', '10'] },
  });
  assert.equal(res2.status, 400);
  const out2 = await res2.json();
  assert.equal(out2.error, 'Store link must be a valid http(s) URL.');
});
