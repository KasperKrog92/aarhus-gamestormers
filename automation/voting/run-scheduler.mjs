// Runner for the voting scheduler, executed by GitHub Actions (see
// .github/workflows/voting-automation.yml). It wires the pure decision logic in
// scheduler.mjs to the side-effecting modules (api-client, discord, handoff) and
// is the only place that performs phase patches, Discord posts, promotion, and
// handoff writes.
//
// Idempotency model: every transition first patches the round phase, then records
// an automation event through the admin API. `recordAutomationEvent` returns
// { duplicate } using a UNIQUE (round_id, event_type) constraint, so the event
// acts as a test-and-set lock: only the run that first records it posts the
// matching Discord announcement. The phase change is a second guard, because
// decideRoundActions branches on phase and never re-opens or re-reveals a round
// that already moved on. Blocked states (tie / no votes) only log and exit 0 so
// the hourly schedule never turns into red-run or Discord noise.

import { pathToFileURL } from 'node:url';

import { createApiClient } from './api-client.mjs';
import { ACTIONS, decideRoundActions } from './scheduler.mjs';
import {
  blockedMessage,
  postDiscord,
  votingOpenedMessage,
  winnerRevealedMessage,
} from './discord.mjs';
import { buildHandoffMarkdown, winnerPublicationPlan, writeHandoff } from './handoff.mjs';
import { todayDateOnly } from '../../functions/_lib/schedule.js';

// Read and validate the runner environment. VOTING_BASE_URL and
// VOTING_ADMIN_TOKEN are required; DISCORD_VOTING_WEBHOOK_URL is optional (an
// empty webhook simply skips announcements). Throws with a clear, aggregated
// message so a misconfigured workflow fails fast and obviously.
export function readEnv(env = process.env) {
  const baseUrl = String(env.VOTING_BASE_URL || '').trim();
  const adminToken = String(env.VOTING_ADMIN_TOKEN || '').trim();
  const discordWebhookUrl = String(env.DISCORD_VOTING_WEBHOOK_URL || '').trim();

  const missing = [];
  if (!baseUrl) missing.push('VOTING_BASE_URL');
  if (!adminToken) missing.push('VOTING_ADMIN_TOKEN');
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  return { baseUrl, adminToken, discordWebhookUrl };
}

function defaultLogger() {
  return {
    info: (msg) => console.log(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg),
  };
}

// Patch the phase, then record the transition event as a lock. Returns the
// record result ({ duplicate, id }). A failure to record after a successful
// phase patch is logged loudly and re-thrown: the phase already advanced, so the
// next hourly run is a no-op, but the maintainer should know the event log and a
// possible Discord post were skipped.
async function patchPhaseAndRecord({ client, logger }, { roundId, patch, eventType, payload }) {
  await client.patchRound(roundId, patch);
  logger.info(`Patched round ${roundId}: ${JSON.stringify(patch)}.`);
  try {
    return await client.recordAutomationEvent({ roundId, eventType, payload });
  } catch (err) {
    logger.error(
      `Round ${roundId}: phase patch succeeded but recording "${eventType}" failed: ${err.message}. ` +
        'A Discord announcement may not have been sent; check the round manually.'
    );
    throw err;
  }
}

async function announce({ postDiscordFn, logger, webhookUrl }, { roundId, eventType, content }) {
  const result = await postDiscordFn(webhookUrl, content);
  if (result.skipped) {
    logger.info(`Round ${roundId}: no DISCORD_VOTING_WEBHOOK_URL set, skipped ${eventType} announcement.`);
  } else if (result.posted) {
    logger.info(`Round ${roundId}: posted ${eventType} announcement to Discord (status ${result.status}).`);
  } else {
    logger.warn(`Round ${roundId}: Discord ${eventType} announcement returned status ${result.status}.`);
  }
  return result;
}

async function handleOpenVoting(ctx, { round }) {
  const { logger, baseUrl } = ctx;
  const roundId = round.id;

  const record = await patchPhaseAndRecord(ctx, {
    roundId,
    patch: { phase: 'voting' },
    eventType: 'voting_opened',
    payload: { today: ctx.today },
  });

  let discord = { skipped: true, posted: false };
  if (record.duplicate) {
    logger.info(`Round ${roundId}: voting_opened already recorded, skipping announcement.`);
  } else {
    discord = await announce(ctx, {
      roundId,
      eventType: 'voting_opened',
      content: votingOpenedMessage({ round, baseUrl }),
    });
  }

  return { action: ACTIONS.OPEN_VOTING, roundId, duplicate: Boolean(record.duplicate), discordPosted: Boolean(discord.posted) };
}

async function handleRevealWinner(ctx, { payload, decision }) {
  const { client, logger, baseUrl } = ctx;
  const round = payload.round;
  const roundId = decision.roundId;
  const winnerSuggestionId = decision.winnerSuggestionId;

  const record = await patchPhaseAndRecord(ctx, {
    roundId,
    patch: { phase: 'revealed', winnerSuggestionId },
    eventType: 'winner_revealed',
    payload: { today: ctx.today, winnerSuggestionId },
  });

  let discord = { skipped: true, posted: false };
  if (record.duplicate) {
    logger.info(`Round ${roundId}: winner_revealed already recorded, skipping announcement.`);
  } else {
    discord = await announce(ctx, {
      roundId,
      eventType: 'winner_revealed',
      content: winnerRevealedMessage({ round, winner: decision.winner, baseUrl }),
    });
  }

  // Refetch so the publication planner sees the just-recorded winner and any
  // existing selected-game state.
  let latest = await client.getAdminRound(roundId);
  let plan = winnerPublicationPlan({ roundPayload: latest, winnerSuggestionId });
  logger.info(`Round ${roundId}: publication plan: ${plan.reason}`);

  let promoted = false;
  if (plan.mayPromote) {
    // Safe idempotent re-confirm: the winner is already selected and the card is
    // publish-ready, so calling select again does not expose anything new.
    await client.selectWinner(roundId, winnerSuggestionId);
    promoted = true;
    logger.info(`Round ${roundId}: re-confirmed the already publish-ready selected game.`);
    latest = await client.getAdminRound(roundId);
    plan = winnerPublicationPlan({ roundPayload: latest, winnerSuggestionId });
  }

  let handoffPath = null;
  if (plan.needsHandoff) {
    const markdown = buildHandoffMarkdown({ roundPayload: latest, winnerSuggestionId, plan, baseUrl });
    handoffPath = await ctx.writeHandoffFn(markdown, { roundId });
    logger.info(`Round ${roundId}: wrote winner handoff to ${handoffPath}.`);
    const handoffRecord = await client.recordAutomationEvent({
      roundId,
      eventType: 'handoff_generated',
      payload: { path: handoffPath },
    });
    if (handoffRecord.duplicate) {
      logger.info(`Round ${roundId}: handoff_generated was already recorded.`);
    }
  } else {
    logger.info(`Round ${roundId}: meeting card is publish-ready, no handoff needed.`);
  }

  return {
    action: ACTIONS.REVEAL_WINNER,
    roundId,
    winnerSuggestionId,
    duplicate: Boolean(record.duplicate),
    discordPosted: Boolean(discord.posted),
    promoted,
    handoffPath,
  };
}

// Run one scheduler pass. Side-effecting dependencies are injectable so the flow
// can be tested without real network or filesystem access:
//   deps.client        api client (defaults to a real createApiClient)
//   deps.postDiscord   Discord poster (defaults to the real postDiscord)
//   deps.writeHandoff  handoff writer (defaults to the real writeHandoff)
//   deps.logger        { info, warn, error } (defaults to console)
// `today` defaults to the real current date (YYYY-MM-DD).
export async function runScheduler({ env = process.env, today, deps = {} } = {}) {
  const config = readEnv(env);
  const logger = deps.logger || defaultLogger();
  const client = deps.client || createApiClient({ baseUrl: config.baseUrl, adminToken: config.adminToken });
  const postDiscordFn = deps.postDiscord || postDiscord;
  const writeHandoffFn = deps.writeHandoff || writeHandoff;
  const day = today || todayDateOnly();

  const payload = await client.getCurrentRound();
  const round = payload && payload.round;
  if (!round) {
    logger.info('No current round to evaluate.');
    return { action: ACTIONS.NOOP, roundId: null, reason: 'No current round.' };
  }

  const decision = decideRoundActions({
    today: day,
    round,
    suggestions: payload.suggestions,
    tallies: payload.tallies,
    automationEvents: payload.automationEvents,
  });
  logger.info(`Round ${decision.roundId}: decided "${decision.action}". ${decision.reason}`);

  const ctx = {
    client,
    logger,
    postDiscordFn,
    writeHandoffFn,
    baseUrl: config.baseUrl,
    webhookUrl: config.discordWebhookUrl,
    today: day,
  };

  if (decision.action === ACTIONS.OPEN_VOTING) {
    return await handleOpenVoting(ctx, { round });
  }
  if (decision.action === ACTIONS.REVEAL_WINNER) {
    return await handleRevealWinner(ctx, { payload, decision });
  }
  if (decision.action === ACTIONS.BLOCKED) {
    // No idempotency key exists for blocked states (the event types are fixed),
    // so posting to Discord every hour would spam the channel. Log loudly and
    // exit 0 instead; the maintainer resolves the tie / no-votes manually.
    logger.warn(blockedMessage({ round, decision }));
    return { action: ACTIONS.BLOCKED, roundId: decision.roundId, blocker: decision.blocker, reason: decision.reason };
  }

  return { action: ACTIONS.NOOP, roundId: decision.roundId, reason: decision.reason };
}

// Execute when run directly (node automation/voting/run-scheduler.mjs). A thrown
// error exits non-zero so a genuine failure surfaces as a red workflow run;
// blocked/no-op states resolve normally and stay green.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runScheduler()
    .then((result) => {
      console.log(`Scheduler finished: ${JSON.stringify(result)}`);
    })
    .catch((err) => {
      console.error(`Scheduler failed: ${err.message}`);
      process.exitCode = 1;
    });
}
