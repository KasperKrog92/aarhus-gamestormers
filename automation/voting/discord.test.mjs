import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockedMessage,
  deleteDiscordMessage,
  postDiscord,
  suggestionsOpenedMessage,
  toWebhookPayload,
  votingOpenedMessage,
  winnerAnnouncementFromPayload,
  winnerRevealedMessage,
  winnerSetupNeededMessage,
} from './discord.mjs';

const ROUND = {
  id: 19,
  meeting_date: '2026-09-15',
  voting_opens_at: '2026-07-20',
  voting_closes_at: '2026-07-27',
};
const BASE = 'https://www.gamestormers.dk';

test('suggestions opened message: header, en links, Discord login note, and dates', () => {
  const content = suggestionsOpenedMessage({ round: ROUND, baseUrl: BASE });
  assert.match(content, /^# 🎮 Game Suggestions Open - Club Meeting #19$/m);
  assert.match(content, /Aarhus Gamestormers #19 on \*\*15 September 2026\*\*/);
  // Masked links target the /en/ pages and suppress the preview card (<...>).
  assert.match(content, /\[frontpage\]\(<https:\/\/www\.gamestormers\.dk\/en\/>\)/);
  assert.match(content, /\[the vote page\]\(<https:\/\/www\.gamestormers\.dk\/en\/vote>\)/);
  assert.match(content, /Log in with Discord on the page to confirm club membership\./);
  assert.match(content, /Voting opens on \*\*20 July 2026\*\*/);
});

test('suggestions opened message drops the open-date line when absent', () => {
  const content = suggestionsOpenedMessage({
    round: { id: 20, meeting_date: '2026-10-05' },
    baseUrl: `${BASE}/`,
  });
  assert.match(content, /Club Meeting #20/);
  assert.doesNotMatch(content, /Voting opens on/);
  assert.match(content, /Looking forward to seeing what you come up with!/);
});

test('voting opened message: header, lineup, Discord login note, and close date', () => {
  const content = votingOpenedMessage({
    round: ROUND,
    baseUrl: BASE,
    games: ['Hollow Knight', 'Celeste', 'Outer Wilds'],
  });
  assert.match(content, /^# 🗳️ Voting Has Begun - Club Meeting #19$/m);
  assert.match(content, /voting is now open for the Meeting #19 game on \*\*15 September 2026\*\*/);
  assert.match(content, /Here's the lineup this time:\n- Hollow Knight\n- Celeste\n- Outer Wilds/);
  assert.match(content, /\[the vote page\]\(<https:\/\/www\.gamestormers\.dk\/en\/vote>\)/);
  assert.match(content, /Log in with Discord on the page to confirm club membership\./);
  assert.match(content, /Voting closes on \*\*27 July 2026\*\*/);
});

test('voting opened message tolerates no lineup', () => {
  const content = votingOpenedMessage({ round: { id: 20, meeting_date: '2026-10-05' }, baseUrl: BASE });
  assert.doesNotMatch(content, /lineup/);
  assert.match(content, /You can vote for as many games as you like\. Log in with Discord on the page to confirm club membership\./);
});

test('voting opened message keeps the vote link and trims an oversized lineup', () => {
  const games = Array.from({ length: 80 }, (_, i) => `Very Long Game Title ${i + 1} With Extra Words`);
  const content = votingOpenedMessage({ round: ROUND, baseUrl: BASE, games });
  assert.ok(content.length <= 2000);
  assert.match(content, /\[the vote page\]\(<https:\/\/www\.gamestormers\.dk\/en\/vote>\)/);
  assert.match(content, /Log in with Discord on the page to confirm club membership\./);
  assert.match(content, /And \d+ more\.\.\./);
});

test('winner message: full meeting announcement with event and useful links', () => {
  const content = winnerRevealedMessage({
    round: ROUND,
    winner: {
      title: 'Hollow Knight',
      description: 'A hand-drawn metroidvania about exploring a ruined kingdom.',
      steamUrl: 'https://store.steampowered.com/app/367520/',
      hltbUrl: 'https://howlongtobeat.com/game/26606',
    },
    meeting: {
      startTime: '18:30',
      endTime: '21:00',
      venueName: 'Folkehuset Møllestien',
      venueAddress: 'Grønnegade 10, 8000 Aarhus C',
    },
    eventUrl: 'https://discord.com/events/111/222',
    baseUrl: BASE,
  });
  assert.match(content, /^# 🏆 Club Meeting #19 - Hollow Knight$/m);
  assert.match(content, /the winner for Club Meeting #19 is\.\.\./);
  assert.match(content, /^### 🎮 Hollow Knight$/m);
  assert.match(content, /A hand-drawn metroidvania/);
  assert.match(content, /📅 \w+day, 15 September 2026/);
  assert.match(content, /⏰ 18:30 to ~21:00/);
  assert.match(
    content,
    /📍 \[Folkehuset Møllestien, Grønnegade 10, 8000 Aarhus C\]\(<https:\/\/maps\.app\.goo\.gl\/8fqwBqEZA7x3TUgR6>\)/
  );
  assert.match(content, /Sign up here: \[Discord event\]\(<https:\/\/discord\.com\/events\/111\/222>\)/);
  assert.match(content, /🔗 \[Steam\]\(<https:\/\/store\.steampowered\.com\/app\/367520\/>\)/);
  assert.match(content, /🔗 \[HowLongToBeat\]\(<https:\/\/howlongtobeat\.com\/game\/26606>\)/);
  assert.match(content, /Looking forward to seeing everyone there ✨/);
});

test('winner message degrades to title, reveal, and date when only the winner is known', () => {
  const content = winnerRevealedMessage({
    round: ROUND,
    winner: { id: 101, title: 'Hollow Knight', votes: 7 },
    baseUrl: BASE,
  });
  assert.match(content, /# 🏆 Club Meeting #19 - Hollow Knight/);
  assert.match(content, /the winner for Club Meeting #19 is/);
  assert.match(content, /📅 \w+day, 15 September 2026/);
  // No meeting object, event, or links supplied, so those sections are omitted.
  assert.doesNotMatch(content, /⏰/);
  assert.doesNotMatch(content, /📍/);
  assert.doesNotMatch(content, /Sign up here:/);
  assert.doesNotMatch(content, /Useful links:/);
});

test('winner announcement can be built from an admin round payload', () => {
  const content = winnerAnnouncementFromPayload({
    round: ROUND,
    meeting: {
      meetingDate: '2026-09-15',
      startTime: '18:30',
      endTime: '21:00',
      venueName: 'Folkehuset Møllestien',
      venueAddress: 'Grønnegade 10, 8000 Aarhus C',
      discordEventUrl: 'https://discord.com/events/111/222',
    },
    selectedGame: {
      title: 'Hollow Knight',
      storeUrl: 'https://store.steampowered.com/app/367520/',
      hltbUrl: 'https://howlongtobeat.com/game/26606',
      descriptionEn: 'Fallback game description.',
    },
    meetingCopy: { en: { eventDescription: 'Curated event description.' }, da: { eventDescription: 'Dansk.' } },
  }, { baseUrl: BASE });

  assert.match(content, /Curated event description/);
  assert.match(content, /Sign up here: \[Discord event\]/);
  assert.match(content, /HowLongToBeat/);
});

test('winner setup needed message names missing fields and the admin URL', () => {
  const content = winnerSetupNeededMessage({
    round: ROUND,
    missing: ['HowLongToBeat URL', 'Discord event URL'],
    baseUrl: BASE,
  });
  assert.match(content, /HowLongToBeat URL, Discord event URL/);
  assert.match(content, /https:\/\/www\.gamestormers\.dk\/vote-admin\//);
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

test('postDiscord can wait for and return the created message id', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ id: '1234567890' }) };
  };

  const result = await postDiscord('https://discord.example/webhook?thread_id=abc', 'hi there', { fetch, wait: true });

  assert.deepEqual(result, { skipped: false, posted: true, status: 200, messageId: '1234567890' });
  assert.equal(calls[0].url, 'https://discord.example/webhook?thread_id=abc&wait=true');
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

test('deleteDiscordMessage deletes through the webhook message endpoint', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 204 };
  };

  const result = await deleteDiscordMessage('https://discord.example/webhook?wait=true', '1234567890', { fetch });

  assert.deepEqual(result, { skipped: false, deleted: true, status: 204 });
  assert.equal(calls[0].url, 'https://discord.example/webhook/messages/1234567890');
  assert.equal(calls[0].init.method, 'DELETE');
});

test('deleteDiscordMessage treats missing messages and fetch errors as best-effort results', async () => {
  const missing = await deleteDiscordMessage('https://discord.example/webhook', '123', {
    fetch: async () => ({ ok: false, status: 404 }),
  });
  assert.deepEqual(missing, { skipped: false, deleted: true, status: 404 });

  const failed = await deleteDiscordMessage('https://discord.example/webhook', '123', {
    fetch: async () => {
      throw new Error('network down');
    },
  });
  assert.deepEqual(failed, { skipped: false, deleted: false, status: null, error: 'network down' });
});
