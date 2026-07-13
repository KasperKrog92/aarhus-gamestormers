// Cloudflare Worker clock for the voting scheduler. This is the PRIMARY clock:
// Cloudflare cron triggers fire within about a minute of schedule, unlike
// GitHub Actions cron, which routinely starts hours late (the July 2026 missed
// announcement). The GitHub workflow stays as the backstop clock; both hosts
// execute the same runScheduler module against the live admin API, and the
// automation_events idempotency log makes overlapping passes safe.
//
// Triggers (see wrangler.jsonc): 07:00 and 08:00 UTC cover 09:00 in Denmark
// across DST, 12:30 UTC is the same-day backstop. The gate below no-ops any
// trigger that lands before 09:00 Europe/Copenhagen, so every trigger is safe
// whenever it fires. An authenticated POST (Bearer CRON_TOKEN) runs one pass
// immediately, bypassing the gate like workflow_dispatch does.
//
// Deploy with `npm run deploy:cron`. Secrets on the Worker: VOTING_ADMIN_TOKEN,
// DISCORD_VOTING_WEBHOOK_URL, DISCORD_VOTING_ALERTS_WEBHOOK_URL, CRON_TOKEN,
// HEALTHCHECKS_PING_URL (optional). VOTING_BASE_URL is a plain var.

import { runScheduler } from '../voting/run-scheduler.mjs';
import { postDiscordFile } from '../voting/discord.mjs';
import { pingHealthcheck } from '../voting/healthcheck.mjs';

const SCHEDULER_TZ = 'Europe/Copenhagen';
const SCHEDULER_HOUR = 9;

// Hour of day (0-23) in Copenhagen for a given Date.
export function copenhagenHour(date) {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: SCHEDULER_TZ,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(date)
  );
}

// The daily pass runs at or after 09:00 local, never before. "At or after"
// rather than an exact hour: a late trigger must still run (the exact-hour
// version of this gate is what silently skipped the GitHub runs in July 2026).
export function shouldRunAt(date) {
  return copenhagenHour(date) >= SCHEDULER_HOUR;
}

// Handoff delivery for this host: post the Markdown as a file attachment to the
// private alerts webhook. The returned string is recorded in the
// handoff_generated event payload where the Node CLI records a file path.
export function createDiscordHandoffWriter(env, { postFile = postDiscordFile } = {}) {
  return async function writeHandoff(markdown, { roundId } = {}) {
    const filename = `meeting-${roundId ?? 'unknown'}-winner.md`;
    const result = await postFile(env.DISCORD_VOTING_ALERTS_WEBHOOK_URL, {
      content: `📋 Winner handoff for meeting #${roundId ?? '?'} (see attached brief)`,
      filename,
      fileContent: markdown,
    });
    if (result.skipped) return `undelivered-no-alerts-webhook:${filename}`;
    if (!result.posted) return `discord-post-failed-${result.status}:${filename}`;
    return `discord-alerts-attachment:${filename}`;
  };
}

// Constant-time Bearer-token check, mirroring functions/_lib/auth.js: hash both
// sides to fixed-length digests so neither length nor a partial match leaks
// through response timing.
export async function tokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(provided))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(expected))),
  ]);
  const bytesA = new Uint8Array(a);
  const bytesB = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i += 1) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

// One scheduler pass with this host's handoff writer, then the dead-man ping.
// The ping only fires after a successful pass (noop and blocked count as
// success; they mean the scheduler looked and decided), so a genuinely failing
// day sends no ping and healthchecks raises the alarm.
export async function runPass(env, { deps = {}, ping = pingHealthcheck } = {}) {
  const result = await runScheduler({
    env,
    deps: { writeHandoff: createDiscordHandoffWriter(env), ...deps },
  });
  const pingResult = await ping(env.HEALTHCHECKS_PING_URL);
  return {
    ...result,
    healthcheckPing: pingResult.skipped ? 'skipped' : pingResult.ok ? 'ok' : 'failed',
  };
}

export async function handleScheduled(controller, env, { run = runPass, now } = {}) {
  const firedAt = now || new Date(controller && controller.scheduledTime ? controller.scheduledTime : Date.now());
  if (!shouldRunAt(firedAt)) {
    console.log(`Skipping voting scheduler: before 0${SCHEDULER_HOUR}:00 in ${SCHEDULER_TZ}.`);
    return null;
  }
  const result = await run(env);
  console.log(`Scheduler finished: ${JSON.stringify(result)}`);
  return result;
}

// POST / with Bearer CRON_TOKEN runs one pass immediately (no hour gate), like
// workflow_dispatch. Everything else 404s so the Worker exposes no surface to
// probes. CRON_TOKEN unset disables the HTTP trigger entirely.
export async function handleFetch(request, env, { run = runPass } = {}) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/') {
    return new Response('Not found', { status: 404 });
  }
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (!(await tokenMatches(token, env.CRON_TOKEN))) {
    return new Response('Unauthorized', { status: 401 });
  }
  const result = await run(env);
  return Response.json(result);
}

export default {
  async scheduled(controller, env) {
    await handleScheduled(controller, env);
  },
  async fetch(request, env) {
    return handleFetch(request, env);
  },
};
