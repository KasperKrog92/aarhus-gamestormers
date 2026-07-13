import assert from 'node:assert/strict';
import test from 'node:test';

import { pingHealthcheck } from './healthcheck.mjs';

test('a missing or blank ping URL is a skip, not an error', async () => {
  assert.deepEqual(await pingHealthcheck(''), { skipped: true, ok: false });
  assert.deepEqual(await pingHealthcheck(null), { skipped: true, ok: false });
  assert.deepEqual(await pingHealthcheck('   '), { skipped: true, ok: false });
});

test('a successful ping POSTs to the check URL and reports ok', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200 };
  };

  const result = await pingHealthcheck(' https://hc-ping.example/abc ', { fetch });

  assert.deepEqual(result, { skipped: false, ok: true, status: 200 });
  assert.equal(calls[0].url, 'https://hc-ping.example/abc');
  assert.equal(calls[0].init.method, 'POST');
});

test('an HTTP error status is reported but never thrown', async () => {
  const fetch = async () => ({ ok: false, status: 503 });
  const result = await pingHealthcheck('https://hc-ping.example/abc', { fetch });
  assert.deepEqual(result, { skipped: false, ok: false, status: 503 });
});

test('a network failure is reported but never thrown', async () => {
  const fetch = async () => {
    throw new Error('getaddrinfo ENOTFOUND');
  };
  const result = await pingHealthcheck('https://hc-ping.example/abc', { fetch });
  assert.equal(result.skipped, false);
  assert.equal(result.ok, false);
  assert.equal(result.status, null);
  assert.match(result.error, /ENOTFOUND/);
});
