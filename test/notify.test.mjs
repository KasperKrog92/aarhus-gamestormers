import assert from 'node:assert/strict';
import test from 'node:test';

import { notifyDiscord } from '../functions/_lib/notify.js';

test('suggestion notification webhook suppresses link-preview embeds', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  let task;

  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  };

  try {
    notifyDiscord('https://discord.example/webhook', (pending) => { task = pending; }, 'Vote link');
    await task;
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(request.url, 'https://discord.example/webhook');
  assert.deepEqual(JSON.parse(request.options.body), {
    content: 'Vote link',
    allowed_mentions: { parse: [] },
    flags: 4,
  });
});
