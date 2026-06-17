import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockedMessage,
  postDiscord,
  toWebhookPayload,
  votingOpenedMessage,
  winnerRevealedMessage,
} from './discord.mjs';

const ROUND = { id: 19, meeting_date: '2026-09-15' };
const BASE = 'https://www.gamestormers.dk';

test('voting opened message links to /vote and names the meeting', () => {
  const content = votingOpenedMessage({ round: ROUND, baseUrl: BASE });
  assert.match(content, /Voting is now open/);
  assert.match(content, /meeting #19 on 15 September 2026/);
  assert.match(content, /https:\/\/www\.gamestormers\.dk\/vote/);
});

test('voting opened message tolerates a missing meeting date', () => {
  const content = votingOpenedMessage({ round: { id: 20 }, baseUrl: `${BASE}/` });
  assert.match(content, /meeting #20!/);
  assert.match(content, /https:\/\/www\.gamestormers\.dk\/vote/);
});

test('winner revealed message includes the winner title, meeting label, and link', () => {
  const content = winnerRevealedMessage({
    round: ROUND,
    winner: { title: 'Hollow Knight' },
    baseUrl: BASE,
  });
  assert.match(content, /\*\*Hollow Knight\*\*/);
  assert.match(content, /meeting #19 on 15 September 2026/);
  assert.match(content, /https:\/\/www\.gamestormers\.dk\/vote/);
});

test('blocked message surfaces the scheduler reason', () => {
  const content = blockedMessage({
    round: ROUND,
    decision: { blocker: 'tie', reason: 'a 4-vote tie for first place (Celeste, Outer Wilds)' },
  });
  assert.match(content, /needs attention for meeting #19/);
  assert.match(content, /Celeste, Outer Wilds/);
});

test('toWebhookPayload disables mentions and caps the content length', () => {
  const payload = toWebhookPayload('@everyone hello');
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.equal(payload.content, '@everyone hello');
  assert.equal(toWebhookPayload('x'.repeat(2500)).content.length, 2000);
});

test('postDiscord posts the webhook payload and reports the status', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 204 };
  };

  const result = await postDiscord('https://discord.example/webhook', 'hi there', { fetch });

  assert.deepEqual(result, { skipped: false, posted: true, status: 204 });
  assert.equal(calls[0].url, 'https://discord.example/webhook');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    content: 'hi there',
    allowed_mentions: { parse: [] },
  });
});

test('postDiscord reports a non-ok webhook response without throwing', async () => {
  const fetch = async () => ({ ok: false, status: 400 });
  const result = await postDiscord('https://discord.example/webhook', 'hi', { fetch });
  assert.deepEqual(result, { skipped: false, posted: false, status: 400 });
});

test('postDiscord is a no-op without a url or content', async () => {
  let called = false;
  const fetch = async () => {
    called = true;
    return { ok: true, status: 200 };
  };

  assert.deepEqual(await postDiscord('', 'hi', { fetch }), { skipped: true, posted: false });
  assert.deepEqual(await postDiscord('https://discord.example/webhook', '', { fetch }), {
    skipped: true,
    posted: false,
  });
  assert.equal(called, false);
});
