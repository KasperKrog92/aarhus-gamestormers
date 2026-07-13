import assert from 'node:assert/strict';
import test from 'node:test';

import { readEnv, runScheduler } from './run-scheduler.mjs';

const ENV = {
  VOTING_BASE_URL: 'https://www.gamestormers.dk',
  VOTING_ADMIN_TOKEN: 'secret-token',
  DISCORD_VOTING_WEBHOOK_URL: 'https://discord.example/webhook',
  DISCORD_VOTING_ALERTS_WEBHOOK_URL: 'https://discord.example/alerts',
};

const SUGGESTIONS = [
  { id: 101, title: 'Hollow Knight' },
  { id: 102, title: 'Celeste' },
  { id: 103, title: 'Outer Wilds' },
];

const READY_SUGGESTIONS = [
  {
    id: 101,
    title: 'Hollow Knight',
    steam_appid: '367520',
    store_url: 'https://store.steampowered.com/app/367520/',
    header_image: 'https://cdn.example/hollow-knight.jpg',
    genres: 'Metroidvania, Action',
    platforms: 'Windows, macOS, Linux',
    playtime_hours: 25,
    hltb_url: 'https://howlongtobeat.com/game/26606',
    description_da: 'da',
    description_en: 'en',
  },
  ...SUGGESTIONS.slice(1),
];

const CLEAR_RCV_RESULT = {
  winnerId: 101,
  blocked: null,
  totalBallots: 12,
  rounds: [{ counts: [{ id: 101, votes: 5 }, { id: 103, votes: 4 }, { id: 102, votes: 3 }] }],
};

const TIED_RCV_RESULT = {
  winnerId: null,
  blocked: { reason: 'tie', tied: [{ id: 101, votes: 4 }, { id: 102, votes: 4 }] },
  totalBallots: 8,
  rounds: [{ counts: [{ id: 101, votes: 4 }, { id: 102, votes: 4 }] }],
};

// A round mid-voting whose close date has passed, with a clear winner.
function votingPayload(overrides = {}) {
  return {
    round: { id: 19, phase: 'voting', meeting_date: '2026-09-15', voting_opens_at: '2026-06-30', voting_closes_at: '2026-07-09' },
    suggestions: SUGGESTIONS,
    tallies: { 101: 5, 102: 3, 103: 4 },
    rcvResult: CLEAR_RCV_RESULT,
    automationEvents: [],
    ...overrides,
  };
}

// Admin round payload after the winner has been revealed but not promoted.
function revealedAdminPayload(overrides = {}) {
  return {
    round: { id: 19, title: 'September meeting', meeting_date: '2026-09-15', phase: 'revealed', winner_suggestion_id: 101 },
    meeting: { id: 19, meetingDate: '2026-09-15', hasSelectedGame: false },
    selectedGame: null,
    meetingCopy: null,
    publishReadiness: { ready: false, missing: ['selected game'] },
    announcementReadiness: { ready: false, missing: ['selected game', 'Discord event URL'] },
    suggestions: SUGGESTIONS,
    tallies: { 101: 5, 102: 3, 103: 4 },
    automationEvents: [{ eventType: 'winner_revealed' }],
    ...overrides,
  };
}

// Admin round payload whose winner is already selected and publish-ready.
function promotedAdminPayload(overrides = {}) {
  return {
    round: { id: 19, title: 'September meeting', meeting_date: '2026-09-15', phase: 'revealed', winner_suggestion_id: 101 },
    meeting: {
      id: 19,
      meetingDate: '2026-09-15',
      startTime: '18:30',
      endTime: '21:00',
      venueName: 'Folkehuset Møllestien',
      venueAddress: 'Grønnegade 10, 8000 Aarhus C',
      discordEventUrl: 'https://discord.com/events/111/222',
      hasSelectedGame: true,
    },
    selectedGame: {
      id: 5,
      title: 'Hollow Knight',
      storeUrl: 'https://store.steampowered.com/app/367520/',
      playtimeHours: 25,
      hltbUrl: 'https://howlongtobeat.com/game/26606',
    },
    meetingCopy: { da: { eventDescription: 'da' }, en: { eventDescription: 'en' } },
    publishReadiness: { ready: true, missing: [] },
    announcementReadiness: { ready: true, missing: [] },
    suggestions: SUGGESTIONS,
    tallies: { 101: 5, 102: 3, 103: 4 },
    automationEvents: [{ eventType: 'winner_revealed' }],
    ...overrides,
  };
}

// Fake api client recording every call. `adminSequence` is an array of payloads
// returned by successive getAdminRound calls (last entry repeats once drained).
// `recordResults` is a queue for recordAutomationEvent results; an Error entry is
// thrown to simulate a failed record.
function makeClient({ current, adminSequence = [], recordResults = [] } = {}) {
  const calls = {
    getCurrentRound: 0,
    getAdminRound: [],
    patchRound: [],
    recordAutomationEvent: [],
    selectWinner: [],
  };
  const admin = [...adminSequence];
  const records = [...recordResults];
  return {
    calls,
    async getCurrentRound() {
      calls.getCurrentRound += 1;
      return current;
    },
    async getAdminRound(id) {
      calls.getAdminRound.push(id);
      return admin.length > 1 ? admin.shift() : admin[0];
    },
    async patchRound(id, body) {
      calls.patchRound.push({ id, body });
      return { ok: true };
    },
    async recordAutomationEvent(body) {
      calls.recordAutomationEvent.push(body);
      const next = records.length ? records.shift() : { ok: true, duplicate: false, id: 1 };
      if (next instanceof Error) throw next;
      return next;
    },
    async selectWinner(id, suggestionId, options) {
      calls.selectWinner.push({ id, suggestionId, options });
      return { ok: true, gameId: 5 };
    },
  };
}

function makeDiscord(result = { skipped: false, posted: true, status: 204 }) {
  const calls = [];
  const results = Array.isArray(result) ? [...result] : null;
  const fn = async (url, content, options = {}) => {
    calls.push({ url, content, options });
    if (!results) return result;
    return results.length > 1 ? results.shift() : results[0];
  };
  return { fn, calls };
}

function makeDeleteDiscord(result = { skipped: false, deleted: true, status: 204 }) {
  const calls = [];
  const fn = async (url, messageId) => {
    calls.push({ url, messageId });
    return result;
  };
  return { fn, calls };
}

function makeWriteHandoff(path = 'automation-output/meeting-19-winner.md') {
  const calls = [];
  const fn = async (markdown, opts) => {
    calls.push({ markdown, opts });
    return path;
  };
  return { fn, calls };
}

function makeLogger() {
  const messages = { info: [], warn: [], error: [] };
  return {
    logger: {
      info: (m) => messages.info.push(m),
      warn: (m) => messages.warn.push(m),
      error: (m) => messages.error.push(m),
    },
    messages,
  };
}

test('readEnv requires the base url and admin token', () => {
  assert.throws(() => readEnv({ VOTING_ADMIN_TOKEN: 'x' }), /VOTING_BASE_URL/);
  assert.throws(() => readEnv({ VOTING_BASE_URL: 'https://x' }), /VOTING_ADMIN_TOKEN/);
  assert.throws(() => readEnv({}), /VOTING_BASE_URL.*VOTING_ADMIN_TOKEN/);
});

test('readEnv trims values and treats the webhook as optional', () => {
  const config = readEnv({ VOTING_BASE_URL: '  https://x  ', VOTING_ADMIN_TOKEN: ' t ' });
  assert.deepEqual(config, { baseUrl: 'https://x', adminToken: 't', discordWebhookUrl: '', discordAlertsWebhookUrl: '' });
  assert.equal(readEnv(ENV).discordWebhookUrl, 'https://discord.example/webhook');
  assert.equal(readEnv(ENV).discordAlertsWebhookUrl, 'https://discord.example/alerts');
});

test('announce_suggestions records the event and posts the suggestions-open template', async () => {
  const client = makeClient({
    current: {
      round: {
        id: 19,
        phase: 'suggesting',
        meeting_date: '2026-09-15',
        suggestions_open_at: '2026-06-20',
        voting_opens_at: '2026-06-30',
      },
      suggestions: [],
      tallies: {},
      automationEvents: [],
    },
    recordResults: [{ ok: true, duplicate: false, id: 1 }],
  });
  const discord = makeDiscord({ skipped: false, posted: true, status: 200, messageId: 'suggestions-message-1' });
  const { logger } = makeLogger();

  const result = await runScheduler({
    env: ENV,
    today: '2026-06-20',
    deps: { client, postDiscord: discord.fn, writeHandoff: async () => 'unused.md', logger },
  });

  assert.equal(result.action, 'announce_suggestions');
  assert.equal(client.calls.recordAutomationEvent[0].eventType, 'suggestions_opened');
  assert.deepEqual(client.calls.recordAutomationEvent[0].payload, {
    today: '2026-06-20',
    messageId: 'suggestions-message-1',
    status: 200,
  });
  assert.equal(discord.calls[0].options.wait, true);
  assert.match(discord.calls[0].content, /Game Suggestions Open/);
});

test('no current round is a clean no-op', async () => {
  const client = makeClient({ current: { round: null } });
  const { logger, messages } = makeLogger();
  const result = await runScheduler({ env: ENV, today: '2026-07-10', deps: { client, writeHandoff: async () => 'unused.md', logger } });

  assert.equal(result.action, 'noop');
  assert.equal(result.roundId, null);
  assert.equal(client.calls.patchRound.length, 0);
  assert.match(messages.info.join('\n'), /No current round/);
});

test('open_voting patches the phase, records the event, then announces', async () => {
  const client = makeClient({
    current: {
      round: { id: 19, phase: 'suggesting', meeting_date: '2026-09-15', voting_opens_at: '2026-06-30' },
      suggestions: [
        { id: 101, title: 'Hollow Knight', status: 'approved' },
        { id: 102, title: 'Pending Game', status: 'pending' },
      ],
      tallies: {},
      automationEvents: [{ eventType: 'suggestions_opened', payload: { messageId: 'suggestions-message-1' } }],
    },
    recordResults: [{ ok: true, duplicate: false, id: 1 }],
  });
  const discord = makeDiscord({ skipped: false, posted: true, status: 200, messageId: 'voting-message-1' });
  const deletes = makeDeleteDiscord();
  const { logger } = makeLogger();

  const result = await runScheduler({
    env: ENV,
    today: '2026-06-30',
    deps: { client, postDiscord: discord.fn, deleteDiscordMessage: deletes.fn, writeHandoff: async () => 'unused.md', logger },
  });

  assert.equal(result.action, 'open_voting');
  assert.equal(result.discordPosted, true);
  assert.deepEqual(client.calls.patchRound[0], { id: 19, body: { phase: 'voting' } });
  assert.equal(client.calls.recordAutomationEvent[0].eventType, 'voting_opened');
  assert.deepEqual(client.calls.recordAutomationEvent[0].payload, {
    today: '2026-06-30',
    messageId: 'voting-message-1',
    status: 200,
  });
  assert.equal(discord.calls.length, 1);
  assert.equal(discord.calls[0].options.wait, true);
  assert.match(discord.calls[0].content, /Voting Has Begun/);
  assert.match(discord.calls[0].content, /Hollow Knight/);
  assert.doesNotMatch(discord.calls[0].content, /Pending Game/);
  assert.deepEqual(deletes.calls, [{ url: 'https://discord.example/webhook', messageId: 'suggestions-message-1' }]);
  // patch happens before the announcement
  assert.equal(client.calls.patchRound.length, 1);
});

test('open_voting deletes a just-posted message when event recording reports a duplicate', async () => {
  const client = makeClient({
    current: { round: { id: 19, phase: 'suggesting', voting_opens_at: '2026-06-30' }, suggestions: [], tallies: {}, automationEvents: [] },
    recordResults: [{ ok: true, duplicate: true, id: null }],
  });
  const discord = makeDiscord({ skipped: false, posted: true, status: 200, messageId: 'orphan-voting-message' });
  const deletes = makeDeleteDiscord();
  const { logger } = makeLogger();

  const result = await runScheduler({
    env: ENV,
    today: '2026-06-30',
    deps: { client, postDiscord: discord.fn, deleteDiscordMessage: deletes.fn, writeHandoff: async () => 'unused.md', logger },
  });

  assert.equal(result.duplicate, true);
  assert.equal(result.discordPosted, true);
  assert.equal(discord.calls.length, 1, 'the duplicate is only known after posting and recording');
  assert.deepEqual(deletes.calls, [{ url: 'https://discord.example/webhook', messageId: 'orphan-voting-message' }]);
});

test('reveal_winner reveals, alerts admins, and writes a handoff in the normal unpromoted flow', async () => {
  const client = makeClient({
    current: votingPayload({ automationEvents: [{ eventType: 'voting_opened', payload: { messageId: 'voting-message-1' } }] }),
    adminSequence: [revealedAdminPayload()],
    recordResults: [
      { ok: true, duplicate: false, id: 1 }, // winner_revealed
      { ok: true, duplicate: false, id: 2 }, // handoff_generated
    ],
  });
  const discord = makeDiscord();
  const handoff = makeWriteHandoff();
  const { logger } = makeLogger();

  const result = await runScheduler({
    env: ENV,
    today: '2026-07-10',
    deps: { client, postDiscord: discord.fn, writeHandoff: handoff.fn, logger },
  });

  assert.equal(result.action, 'reveal_winner');
  assert.equal(result.winnerSuggestionId, 101);
  assert.equal(result.promoted, false);
  assert.equal(result.handoffPath, 'automation-output/meeting-19-winner.md');

  assert.deepEqual(client.calls.patchRound[0], { id: 19, body: { phase: 'revealed', winnerSuggestionId: 101 } });
  assert.equal(client.calls.selectWinner.length, 0, 'an unpromoted, not-ready card is never auto-promoted');
  assert.equal(handoff.calls.length, 1);
  assert.equal(discord.calls.length, 1, 'posts only the private setup alert');
  assert.equal(discord.calls[0].url, 'https://discord.example/alerts');
  assert.match(discord.calls[0].content, /Winner announcement is waiting/);

  const eventTypes = client.calls.recordAutomationEvent.map((c) => c.eventType);
  assert.deepEqual(eventTypes, ['winner_revealed', 'winner_setup_needed_alerted', 'handoff_generated']);
});

test('reveal_winner re-confirms and skips the handoff when the card is already publish-ready', async () => {
  const client = makeClient({
    current: votingPayload({ automationEvents: [{ eventType: 'voting_opened', payload: { messageId: 'voting-message-1' } }] }),
    // First refetch shows a promoted, publish-ready card; after re-confirm it stays ready.
    adminSequence: [promotedAdminPayload(), promotedAdminPayload()],
    recordResults: [{ ok: true, duplicate: false, id: 1 }],
  });
  const discord = makeDiscord();
  const deletes = makeDeleteDiscord();
  const handoff = makeWriteHandoff();
  const { logger } = makeLogger();

  const result = await runScheduler({
    env: ENV,
    today: '2026-07-10',
    deps: { client, postDiscord: discord.fn, deleteDiscordMessage: deletes.fn, writeHandoff: handoff.fn, logger },
  });

  assert.equal(result.promoted, true);
  assert.equal(result.handoffPath, null);
  assert.deepEqual(client.calls.selectWinner[0], { id: 19, suggestionId: 101, options: undefined });
  assert.equal(handoff.calls.length, 0, 'no handoff when the card is publish-ready');
  assert.equal(discord.calls.length, 1);
  assert.equal(discord.calls[0].url, 'https://discord.example/webhook');
  assert.match(discord.calls[0].content, /Sign up here/);
  assert.deepEqual(deletes.calls, [{ url: 'https://discord.example/webhook', messageId: 'voting-message-1' }]);
  assert.deepEqual(client.calls.recordAutomationEvent.map((c) => c.eventType), ['winner_revealed', 'winner_announcement_posted']);
});

test('reveal_winner promotes an unselected winner when the suggestion has all frontpage fields', async () => {
  const client = makeClient({
    current: votingPayload({ automationEvents: [{ eventType: 'voting_opened', payload: { messageId: 'voting-message-1' } }] }),
    adminSequence: [
      revealedAdminPayload({
        suggestions: READY_SUGGESTIONS,
      }),
      promotedAdminPayload(),
    ],
    recordResults: [{ ok: true, duplicate: false, id: 1 }],
  });
  const discord = makeDiscord();
  const deletes = makeDeleteDiscord();
  const handoff = makeWriteHandoff();
  const { logger } = makeLogger();

  const result = await runScheduler({
    env: ENV,
    today: '2026-07-10',
    deps: { client, postDiscord: discord.fn, deleteDiscordMessage: deletes.fn, writeHandoff: handoff.fn, logger },
  });

  assert.equal(result.promoted, true);
  assert.equal(result.handoffPath, null);
  assert.deepEqual(client.calls.selectWinner[0], { id: 19, suggestionId: 101, options: undefined });
  assert.equal(handoff.calls.length, 0, 'no handoff when the winning suggestion can publish cleanly');
  assert.equal(discord.calls.length, 1);
  assert.equal(discord.calls[0].url, 'https://discord.example/webhook');
  assert.deepEqual(deletes.calls, [{ url: 'https://discord.example/webhook', messageId: 'voting-message-1' }]);
  assert.deepEqual(client.calls.recordAutomationEvent.map((c) => c.eventType), ['winner_revealed', 'winner_announcement_posted']);
});

test('reveal_winner does not re-confirm a selected game missing HowLongToBeat data', async () => {
  const selectedGame = {
    ...promotedAdminPayload().selectedGame,
    playtimeHours: '',
    hltbUrl: '',
  };
  const client = makeClient({
    current: votingPayload({ automationEvents: [{ eventType: 'voting_opened', payload: { messageId: 'voting-message-1' } }] }),
    adminSequence: [
      promotedAdminPayload({
        selectedGame,
        publishReadiness: { ready: true, missing: [] },
        announcementReadiness: { ready: false, missing: ['playtime hours', 'HowLongToBeat URL'] },
      }),
    ],
    recordResults: [
      { ok: true, duplicate: false, id: 1 },
      { ok: true, duplicate: false, id: 2 },
      { ok: true, duplicate: false, id: 3 },
    ],
  });
  const discord = makeDiscord();
  const deletes = makeDeleteDiscord();
  const handoff = makeWriteHandoff();
  const { logger } = makeLogger();

  const result = await runScheduler({
    env: ENV,
    today: '2026-07-10',
    deps: { client, postDiscord: discord.fn, deleteDiscordMessage: deletes.fn, writeHandoff: handoff.fn, logger },
  });

  assert.equal(result.promoted, false);
  assert.equal(client.calls.selectWinner.length, 0, 'missing HLTB data blocks automatic frontpage promotion');
  assert.equal(handoff.calls.length, 1);
  assert.match(handoff.calls[0].markdown, /playtime hours/);
  assert.match(handoff.calls[0].markdown, /HowLongToBeat URL/);
});

test('blocked states alert the private channel once and record the alert', async () => {
  const client = makeClient({ current: votingPayload({ rcvResult: TIED_RCV_RESULT }) });
  const discord = makeDiscord();
  const { logger, messages } = makeLogger();

  const result = await runScheduler({
    env: ENV,
    today: '2026-07-10',
    deps: { client, postDiscord: discord.fn, writeHandoff: async () => 'unused.md', logger },
  });

  assert.equal(result.action, 'blocked');
  assert.equal(result.blocker, 'tie');
  assert.equal(result.alertPosted, true);
  assert.equal(client.calls.patchRound.length, 0);
  assert.equal(discord.calls.length, 1);
  assert.equal(discord.calls[0].url, 'https://discord.example/alerts');
  assert.equal(client.calls.recordAutomationEvent[0].eventType, 'blocked_alerted');
  assert.deepEqual(client.calls.recordAutomationEvent[0].payload, { today: '2026-07-10', blocker: 'tie', status: 204 });
  assert.match(messages.warn.join('\n'), /needs attention/);
});

test('blocked states stay quiet after blocked_alerted is recorded', async () => {
  const client = makeClient({
    current: votingPayload({
      rcvResult: TIED_RCV_RESULT,
      automationEvents: [{ eventType: 'blocked_alerted', payload: { blocker: 'tie' } }],
    }),
  });
  const discord = makeDiscord();
  const { logger } = makeLogger();

  const result = await runScheduler({
    env: ENV,
    today: '2026-07-10',
    deps: { client, postDiscord: discord.fn, writeHandoff: async () => 'unused.md', logger },
  });

  assert.equal(result.action, 'blocked');
  assert.equal(result.duplicate, true);
  assert.equal(result.alertPosted, false);
  assert.equal(discord.calls.length, 0);
  assert.equal(client.calls.recordAutomationEvent.length, 0);
});

test('a record failure after a successful phase patch is logged loudly and re-thrown', async () => {
  const client = makeClient({
    current: { round: { id: 19, phase: 'suggesting', voting_opens_at: '2026-06-30' }, suggestions: [], tallies: {}, automationEvents: [] },
    recordResults: [new Error('D1 unavailable')],
  });
  const discord = makeDiscord({ skipped: false, posted: true, status: 200, messageId: 'orphan-voting-message' });
  const deletes = makeDeleteDiscord();
  const { logger, messages } = makeLogger();

  await assert.rejects(
    () => runScheduler({ env: ENV, today: '2026-06-30', deps: { client, postDiscord: discord.fn, deleteDiscordMessage: deletes.fn, writeHandoff: async () => 'unused.md', logger } }),
    /D1 unavailable/
  );

  assert.equal(client.calls.patchRound.length, 1, 'phase was patched before the record failed');
  assert.equal(discord.calls.length, 1, 'message id comes from the post before recording');
  assert.deepEqual(deletes.calls, [{ url: 'https://discord.example/webhook', messageId: 'orphan-voting-message' }]);
  assert.match(messages.error.join('\n'), /posted "voting_opened" Discord message but recording/);
});

test('a missing webhook skips the announcement without failing the run', async () => {
  const client = makeClient({
    current: { round: { id: 19, phase: 'suggesting', meeting_date: '2026-09-15', voting_opens_at: '2026-06-30' }, suggestions: [], tallies: {}, automationEvents: [] },
    recordResults: [{ ok: true, duplicate: false, id: 1 }],
  });
  // Real postDiscord returns { skipped: true } for an empty url.
  const { logger, messages } = makeLogger();

  const result = await runScheduler({
    env: { VOTING_BASE_URL: ENV.VOTING_BASE_URL, VOTING_ADMIN_TOKEN: ENV.VOTING_ADMIN_TOKEN },
    today: '2026-06-30',
    deps: { client, writeHandoff: async () => 'unused.md', logger },
  });

  assert.equal(result.action, 'open_voting');
  assert.equal(result.discordPosted, false);
  assert.match(messages.info.join('\n'), /no DISCORD_VOTING_WEBHOOK_URL/i);
});
