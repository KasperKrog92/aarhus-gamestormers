import assert from 'node:assert/strict';
import test from 'node:test';

import {
  copenhagenHour,
  createDiscordHandoffWriter,
  handleFetch,
  handleScheduled,
  runPass,
  shouldRunAt,
  tokenMatches,
} from './worker.mjs';

// --- Copenhagen gate ---------------------------------------------------------

test('shouldRunAt flips at 09:00 Copenhagen during summer time (UTC+2)', () => {
  assert.equal(shouldRunAt(new Date('2026-07-14T06:59:00Z')), false); // 08:59 local
  assert.equal(shouldRunAt(new Date('2026-07-14T07:00:00Z')), true); // 09:00 local
  assert.equal(shouldRunAt(new Date('2026-07-14T10:30:00Z')), true); // 12:30 local, delayed trigger still runs
});

test('shouldRunAt flips at 09:00 Copenhagen during winter time (UTC+1)', () => {
  assert.equal(shouldRunAt(new Date('2026-01-14T07:30:00Z')), false); // 08:30 local
  assert.equal(shouldRunAt(new Date('2026-01-14T08:00:00Z')), true); // 09:00 local
});

test('copenhagenHour handles the midnight wrap (no 24 from hourCycle)', () => {
  assert.equal(copenhagenHour(new Date('2026-07-14T22:00:00Z')), 0); // 00:00 next local day
  assert.equal(shouldRunAt(new Date('2026-07-14T22:00:00Z')), false);
});

// --- Discord handoff writer --------------------------------------------------

test('createDiscordHandoffWriter posts the markdown as an alerts attachment', async () => {
  const calls = [];
  const writer = createDiscordHandoffWriter(
    { DISCORD_VOTING_ALERTS_WEBHOOK_URL: 'https://discord.test/webhook' },
    {
      postFile: async (url, payload) => {
        calls.push({ url, payload });
        return { skipped: false, posted: true, status: 200 };
      },
    }
  );
  const path = await writer('# brief', { roundId: 21 });
  assert.equal(path, 'discord-alerts-attachment:meeting-21-winner.md');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://discord.test/webhook');
  assert.equal(calls[0].payload.filename, 'meeting-21-winner.md');
  assert.equal(calls[0].payload.fileContent, '# brief');
});

test('createDiscordHandoffWriter reports a missing alerts webhook without throwing', async () => {
  const writer = createDiscordHandoffWriter(
    {},
    { postFile: async () => ({ skipped: true, posted: false }) }
  );
  const path = await writer('# brief', { roundId: 21 });
  assert.equal(path, 'undelivered-no-alerts-webhook:meeting-21-winner.md');
});

// --- Token check -------------------------------------------------------------

test('tokenMatches accepts only the exact configured token', async () => {
  assert.equal(await tokenMatches('secret', 'secret'), true);
  assert.equal(await tokenMatches('wrong', 'secret'), false);
  assert.equal(await tokenMatches('', 'secret'), false);
  assert.equal(await tokenMatches('secret', ''), false);
  assert.equal(await tokenMatches('', ''), false);
});

// --- runPass -----------------------------------------------------------------

function passEnv(extra = {}) {
  return {
    VOTING_BASE_URL: 'https://example.test',
    VOTING_ADMIN_TOKEN: 'admin-token',
    ...extra,
  };
}

// A pass whose decision is noop: current round already announced, nothing due.
// Tests must pin runPass's `today` inside the quiet stretch of this fixture's
// window (after the opening announcement, before the 2026-07-16 halfway
// reminder); an unpinned pass reads the real clock and the decision stops
// being noop as real time crosses the fixture's reminder and phase dates.
const NOOP_TODAY = '2026-07-13';

function noopDeps() {
  return {
    client: {
      getCurrentRound: async () => ({
        round: {
          id: 20,
          phase: 'suggesting',
          suggestions_open_at: '2026-07-12',
          voting_opens_at: '2026-07-21',
        },
        suggestions: [],
        rcvResult: null,
        automationEvents: [{ eventType: 'suggestions_opened' }],
      }),
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  };
}

test('runPass pings the healthcheck after a successful noop pass', async () => {
  const pings = [];
  const result = await runPass(passEnv({ HEALTHCHECKS_PING_URL: 'https://hc.test/ping' }), {
    deps: noopDeps(),
    today: NOOP_TODAY,
    ping: async (url) => {
      pings.push(url);
      return { skipped: false, ok: true, status: 200 };
    },
  });
  assert.equal(result.action, 'noop');
  assert.equal(result.healthcheckPing, 'ok');
  assert.deepEqual(pings, ['https://hc.test/ping']);
});

test('runPass reports a skipped ping when no healthcheck URL is set', async () => {
  const result = await runPass(passEnv(), {
    deps: noopDeps(),
    today: NOOP_TODAY,
    ping: async (url) => (url ? { skipped: false, ok: true } : { skipped: true, ok: false }),
  });
  assert.equal(result.healthcheckPing, 'skipped');
});

test('runPass does not ping when the scheduler pass throws', async () => {
  const pings = [];
  await assert.rejects(
    runPass(passEnv({ HEALTHCHECKS_PING_URL: 'https://hc.test/ping' }), {
      deps: {
        client: {
          getCurrentRound: async () => {
            throw new Error('admin API down');
          },
        },
        logger: { info: () => {}, warn: () => {}, error: () => {} },
      },
      ping: async (url) => {
        pings.push(url);
        return { skipped: false, ok: true };
      },
    }),
    /admin API down/
  );
  assert.deepEqual(pings, []);
});

// --- scheduled handler -------------------------------------------------------

test('handleScheduled skips before 09:00 Copenhagen and runs at or after it', async () => {
  let runs = 0;
  const run = async () => {
    runs += 1;
    return { action: 'noop' };
  };
  const early = await handleScheduled({ scheduledTime: Date.parse('2026-07-14T06:30:00Z') }, {}, { run });
  assert.equal(early, null);
  assert.equal(runs, 0);

  const onTime = await handleScheduled({ scheduledTime: Date.parse('2026-07-14T07:00:30Z') }, {}, { run });
  assert.deepEqual(onTime, { action: 'noop' });
  assert.equal(runs, 1);
});

// --- fetch handler -----------------------------------------------------------

function postRequest(token) {
  return new Request('https://cron.test/', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

test('handleFetch runs a pass for the configured bearer token', async () => {
  let runs = 0;
  const run = async () => {
    runs += 1;
    return { action: 'noop', healthcheckPing: 'skipped' };
  };
  const response = await handleFetch(postRequest('cron-secret'), { CRON_TOKEN: 'cron-secret' }, { run });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { action: 'noop', healthcheckPing: 'skipped' });
  assert.equal(runs, 1);
});

test('handleFetch rejects a wrong or missing token with 401', async () => {
  const run = async () => {
    throw new Error('must not run');
  };
  const env = { CRON_TOKEN: 'cron-secret' };
  assert.equal((await handleFetch(postRequest('wrong'), env, { run })).status, 401);
  assert.equal((await handleFetch(postRequest(''), env, { run })).status, 401);
});

test('handleFetch disables the HTTP trigger entirely when CRON_TOKEN is unset', async () => {
  const run = async () => {
    throw new Error('must not run');
  };
  const response = await handleFetch(postRequest('anything'), {}, { run });
  assert.equal(response.status, 401);
});

test('handleFetch 404s non-POST methods and other paths', async () => {
  const run = async () => {
    throw new Error('must not run');
  };
  const env = { CRON_TOKEN: 'cron-secret' };
  const get = await handleFetch(new Request('https://cron.test/'), env, { run });
  assert.equal(get.status, 404);
  const otherPath = await handleFetch(
    new Request('https://cron.test/admin', { method: 'POST', headers: { authorization: 'Bearer cron-secret' } }),
    env,
    { run }
  );
  assert.equal(otherPath.status, 404);
});
