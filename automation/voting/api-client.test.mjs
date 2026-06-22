import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiClient } from './api-client.mjs';

// A fetch stub that records calls and returns queued responses. Each queued
// entry is { ok, status, body } (body is JSON-stringified for response.text()).
function fakeFetch(responses = []) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  async function fetchImpl(url, init) {
    fetchImpl.calls.push({ url, init });
    const next = queue.length ? queue.shift() : {};
    const ok = next.ok !== undefined ? next.ok : true;
    const status = next.status !== undefined ? next.status : ok ? 200 : 400;
    const text = next.text !== undefined ? next.text : JSON.stringify(next.body ?? {});
    return {
      ok,
      status,
      async text() {
        return text;
      },
    };
  }
  fetchImpl.calls = [];
  return fetchImpl;
}

const OPTS = { baseUrl: 'https://www.gamestormers.dk/', adminToken: 'secret-token' };

test('createApiClient requires a baseUrl and an adminToken', () => {
  assert.throws(() => createApiClient({ adminToken: 'x' }), /baseUrl/);
  assert.throws(() => createApiClient({ baseUrl: 'https://x' }), /adminToken/);
});

test('getCurrentRound GETs the admin round with a bearer token and trims the base slash', async () => {
  const rcvResult = { winnerId: 101, blocked: null, rounds: [] };
  const fetch = fakeFetch({ body: { round: { id: 19 }, rcvResult } });
  const client = createApiClient({ ...OPTS, fetch });

  const data = await client.getCurrentRound();

  assert.deepEqual(data, { round: { id: 19 }, rcvResult });
  assert.equal(fetch.calls.length, 1);
  const { url, init } = fetch.calls[0];
  assert.equal(url, 'https://www.gamestormers.dk/api/admin/round');
  assert.equal(init.method, 'GET');
  assert.equal(init.headers.authorization, 'Bearer secret-token');
  assert.equal(init.headers.accept, 'application/json');
  assert.equal(init.body, undefined, 'GET has no body');
  assert.equal(init.headers['content-type'], undefined, 'GET has no content-type');
});

test('getAdminRound targets the round id', async () => {
  const fetch = fakeFetch({ body: { round: { id: 19 } } });
  const client = createApiClient({ ...OPTS, fetch });

  await client.getAdminRound(19);

  assert.equal(fetch.calls[0].url, 'https://www.gamestormers.dk/api/admin/round/19');
  assert.equal(fetch.calls[0].init.method, 'GET');
});

test('patchRound sends a JSON body with the content-type header', async () => {
  const fetch = fakeFetch({ body: { ok: true } });
  const client = createApiClient({ ...OPTS, fetch });

  await client.patchRound(19, { phase: 'voting' });

  const { url, init } = fetch.calls[0];
  assert.equal(url, 'https://www.gamestormers.dk/api/admin/round/19');
  assert.equal(init.method, 'PATCH');
  assert.equal(init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { phase: 'voting' });
});

test('selectWinner posts suggestionId and merges options into the body', async () => {
  const fetch = fakeFetch({ body: { ok: true, gameId: 5 } });
  const client = createApiClient({ ...OPTS, fetch });

  await client.selectWinner(19, 101, { draft: true });

  const { url, init } = fetch.calls[0];
  assert.equal(url, 'https://www.gamestormers.dk/api/admin/round/19/select');
  assert.equal(init.method, 'POST');
  assert.deepEqual(JSON.parse(init.body), { suggestionId: 101, draft: true });
});

test('selectWinner works without options', async () => {
  const fetch = fakeFetch({ body: { ok: true } });
  const client = createApiClient({ ...OPTS, fetch });

  await client.selectWinner(19, 101);

  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), { suggestionId: 101 });
});

test('patchMeeting targets the meeting id (= round id)', async () => {
  const fetch = fakeFetch({ body: { ok: true } });
  const client = createApiClient({ ...OPTS, fetch });

  await client.patchMeeting(19, { hltbUrl: 'https://hltb.example/x' });

  assert.equal(fetch.calls[0].url, 'https://www.gamestormers.dk/api/admin/meeting/19');
  assert.equal(fetch.calls[0].init.method, 'PATCH');
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), { hltbUrl: 'https://hltb.example/x' });
});

test('recordAutomationEvent posts the event body and returns the JSON result', async () => {
  const fetch = fakeFetch({ body: { ok: true, duplicate: false, id: 7 } });
  const client = createApiClient({ ...OPTS, fetch });

  const res = await client.recordAutomationEvent({
    roundId: 19,
    eventType: 'voting_opened',
    payload: { posted: true },
  });

  assert.deepEqual(res, { ok: true, duplicate: false, id: 7 });
  const { url, init } = fetch.calls[0];
  assert.equal(url, 'https://www.gamestormers.dk/api/admin/automation-event');
  assert.equal(init.method, 'POST');
  assert.deepEqual(JSON.parse(init.body), {
    roundId: 19,
    eventType: 'voting_opened',
    payload: { posted: true },
  });
});

test('a duplicate automation event is a normal 200 result, not an error', async () => {
  const fetch = fakeFetch({ body: { ok: true, duplicate: true, id: null } });
  const client = createApiClient({ ...OPTS, fetch });

  const res = await client.recordAutomationEvent({ roundId: 19, eventType: 'voting_opened' });

  assert.deepEqual(res, { ok: true, duplicate: true, id: null });
});

test('a non-ok response throws with the API error message and status', async () => {
  const fetch = fakeFetch({ ok: false, status: 404, body: { error: 'Round not found' } });
  const client = createApiClient({ ...OPTS, fetch });

  await assert.rejects(() => client.getAdminRound(999), /GET \/api\/admin\/round\/999 failed: 404 Round not found/);
});
