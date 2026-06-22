// Runner for the voting scheduler, executed by GitHub Actions (see
// .github/workflows/voting-automation.yml). It wires the pure decision logic in
// scheduler.mjs to the side-effecting modules (api-client, discord, handoff) and
// is the only place that performs phase patches, Discord posts, promotion, and
// handoff writes.
//
// Idempotency model: phase transitions patch the round first, then post Discord
// and record an automation event through the admin API. `recordAutomationEvent`
// returns { duplicate } using a UNIQUE (round_id, event_type) constraint. For
// rolling public announcements, Discord is posted with wait=true so the returned
// message id can be stored in the event payload and later deleted. The phase
// change is the primary re-entry guard, because decideRoundActions branches on
// phase and never re-opens or re-reveals a round that already moved on. Blocked
// states (tie / no votes) post one private alert, guarded by blocked_alerted.

import { pathToFileURL } from 'node:url';

import { createApiClient } from './api-client.mjs';
import { ACTIONS, decideRoundActions } from './scheduler.mjs';
import {
  blockedMessage,
  deleteDiscordMessage,
  postDiscord,
  suggestionsOpenedMessage,
  votingOpenedMessage,
  winnerAnnouncementFromPayload,
  winnerSetupNeededMessage,
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
  const discordAlertsWebhookUrl = String(env.DISCORD_VOTING_ALERTS_WEBHOOK_URL || '').trim();

  const missing = [];
  if (!baseUrl) missing.push('VOTING_BASE_URL');
  if (!adminToken) missing.push('VOTING_ADMIN_TOKEN');
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  return { baseUrl, adminToken, discordWebhookUrl, discordAlertsWebhookUrl };
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
// next scheduled run is a no-op, but the maintainer should know the event log and a
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

async function announce(
  { postDiscordFn, logger, webhookUrl },
  {
    roundId,
    eventType,
    content,
    url = webhookUrl,
    label = 'Discord',
    webhookName = 'DISCORD_VOTING_WEBHOOK_URL',
    wait = false,
  }
) {
  const result = await postDiscordFn(url, content, { wait });
  if (result.skipped) {
    logger.info(`Round ${roundId}: no ${webhookName} set, skipped ${eventType} announcement.`);
  } else if (result.posted) {
    logger.info(`Round ${roundId}: posted ${eventType} announcement to ${label} (status ${result.status}).`);
  } else {
    logger.warn(`Round ${roundId}: ${label} ${eventType} announcement returned status ${result.status}.`);
  }
  return result;
}

function automationEventPayload(events, eventType) {
  const event = (events || []).find((entry) => entry && entry.eventType === eventType);
  return event && event.payload && typeof event.payload === 'object' ? event.payload : null;
}

function messageIdForEvent(events, eventType) {
  const payload = automationEventPayload(events, eventType);
  return payload && payload.messageId ? String(payload.messageId) : null;
}

async function cleanupPostedMessage(ctx, { roundId, messageId, reason }) {
  if (!messageId) return { skipped: true, deleted: false };
  const result = await ctx.deleteDiscordMessageFn(ctx.webhookUrl, messageId);
  if (result.deleted) {
    ctx.logger.info(`Round ${roundId}: deleted Discord message ${messageId}${reason ? ` (${reason})` : ''}.`);
  } else if (!result.skipped) {
    ctx.logger.warn(
      `Round ${roundId}: could not delete Discord message ${messageId}${reason ? ` (${reason})` : ''}; status ${result.status}.`
    );
  }
  return result;
}

async function recordEventAfterDiscord(ctx, { roundId, eventType, payload, postedMessageId }) {
  try {
    const record = await ctx.client.recordAutomationEvent({ roundId, eventType, payload });
    if (record.duplicate) {
      await cleanupPostedMessage(ctx, {
        roundId,
        messageId: postedMessageId,
        reason: `duplicate ${eventType} event`,
      });
    }
    return record;
  } catch (err) {
    await cleanupPostedMessage(ctx, {
      roundId,
      messageId: postedMessageId,
      reason: `failed ${eventType} event record`,
    });
    ctx.logger.error(
      `Round ${roundId}: posted "${eventType}" Discord message but recording the automation event failed: ${err.message}.`
    );
    throw err;
  }
}

function approvedGameTitles(suggestions) {
  return (suggestions || [])
    .filter((s) => s && (!s.status || s.status === 'approved') && s.title)
    .map((s) => s.title);
}

function hasEvent(events, eventType) {
  return (events || []).some((event) => event && event.eventType === eventType);
}

async function handleAnnounceSuggestions(ctx, { round }) {
  const roundId = round.id;
  const discord = await announce(ctx, {
    roundId,
    eventType: 'suggestions_opened',
    content: suggestionsOpenedMessage({ round, baseUrl: ctx.baseUrl }),
    wait: true,
  });
  const record = await recordEventAfterDiscord(ctx, {
    roundId,
    eventType: 'suggestions_opened',
    payload: { today: ctx.today, messageId: discord.messageId || null, status: discord.status || null },
    postedMessageId: discord.messageId,
  });
  if (record.duplicate) ctx.logger.info(`Round ${roundId}: suggestions_opened already recorded; cleaned up duplicate post if needed.`);

  return { action: ACTIONS.ANNOUNCE_SUGGESTIONS, roundId, duplicate: Boolean(record.duplicate), discordPosted: Boolean(discord.posted) };
}

async function postWinnerAnnouncement(ctx, { roundPayload, source }) {
  const roundId = roundPayload.round.id;
  if (hasEvent(roundPayload.automationEvents, 'winner_announcement_posted')) {
    ctx.logger.info(`Round ${roundId}: winner announcement already posted, skipping.`);
    return { skipped: false, posted: false, duplicate: true };
  }

  const discord = await announce(ctx, {
    roundId,
    eventType: 'winner_announcement_posted',
    content: winnerAnnouncementFromPayload(roundPayload, { baseUrl: ctx.baseUrl }),
  });
  if (discord.posted) {
    await ctx.client.recordAutomationEvent({
      roundId,
      eventType: 'winner_announcement_posted',
      payload: { today: ctx.today, source, status: discord.status },
    });
  }
  return discord;
}

async function alertWinnerSetupNeeded(ctx, { roundPayload }) {
  const roundId = roundPayload.round.id;
  const readiness = roundPayload.announcementReadiness || roundPayload.publishReadiness || { missing: [] };
  if (!ctx.alertsWebhookUrl) {
    ctx.logger.info(`Round ${roundId}: no DISCORD_VOTING_ALERTS_WEBHOOK_URL set, skipped winner setup alert.`);
    return { skipped: true, posted: false };
  }
  const record = await ctx.client.recordAutomationEvent({
    roundId,
    eventType: 'winner_setup_needed_alerted',
    payload: { today: ctx.today, missing: readiness.missing || [] },
  });
  if (record.duplicate) {
    ctx.logger.info(`Round ${roundId}: winner setup alert already recorded, skipping.`);
    return { skipped: false, posted: false, duplicate: true };
  }
  return await announce(ctx, {
    roundId,
    eventType: 'winner_setup_needed_alerted',
    content: winnerSetupNeededMessage({
      round: roundPayload.round,
      missing: readiness.missing || [],
      baseUrl: ctx.baseUrl,
    }),
    url: ctx.alertsWebhookUrl,
    label: 'Discord alerts',
    webhookName: 'DISCORD_VOTING_ALERTS_WEBHOOK_URL',
  });
}

async function handleOpenVoting(ctx, { round }) {
  const { logger, baseUrl } = ctx;
  const roundId = round.id;

  await ctx.client.patchRound(roundId, { phase: 'voting' });
  logger.info(`Patched round ${roundId}: ${JSON.stringify({ phase: 'voting' })}.`);

  const discord = await announce(ctx, {
    roundId,
    eventType: 'voting_opened',
    content: votingOpenedMessage({ round, baseUrl, games: approvedGameTitles(ctx.suggestions) }),
    wait: true,
  });
  await cleanupPostedMessage(ctx, {
    roundId,
    messageId: messageIdForEvent(ctx.automationEvents, 'suggestions_opened'),
    reason: 'voting opened',
  });
  const record = await recordEventAfterDiscord(ctx, {
    roundId,
    eventType: 'voting_opened',
    payload: { today: ctx.today, messageId: discord.messageId || null, status: discord.status || null },
    postedMessageId: discord.messageId,
  });
  if (record.duplicate) logger.info(`Round ${roundId}: voting_opened already recorded; cleaned up duplicate post if needed.`);

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
  if (record.duplicate) logger.info(`Round ${roundId}: winner_revealed already recorded.`);

  // Refetch so the publication planner sees the just-recorded winner and any
  // existing selected-game state.
  let latest = await client.getAdminRound(roundId);
  let plan = winnerPublicationPlan({ roundPayload: latest, winnerSuggestionId });
  logger.info(`Round ${roundId}: publication plan: ${plan.reason}`);

  let promoted = false;
  if (plan.mayPromote) {
    // Safe publication: either re-confirm an already-selected publish-ready
    // winner, or promote a winning suggestion whose copied fields already make a
    // complete frontpage card.
    await client.selectWinner(roundId, winnerSuggestionId);
    promoted = true;
    logger.info(`Round ${roundId}: promoted the publish-ready selected game.`);
    latest = await client.getAdminRound(roundId);
    plan = winnerPublicationPlan({ roundPayload: latest, winnerSuggestionId });
  }

  if (!record.duplicate) {
    const readiness = latest.announcementReadiness || latest.publishReadiness || { ready: false, missing: [] };
    if (readiness.ready) {
      discord = await postWinnerAnnouncement(ctx, { roundPayload: latest, source: 'scheduler' });
      if (discord.posted) {
        await cleanupPostedMessage(ctx, {
          roundId,
          messageId: messageIdForEvent(payload.automationEvents, 'voting_opened'),
          reason: 'winner announcement posted',
        });
      }
    } else {
      await alertWinnerSetupNeeded(ctx, { roundPayload: latest });
    }
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

async function handleBlocked(ctx, { round, decision }) {
  const roundId = decision.roundId;
  const content = blockedMessage({ round, decision });
  ctx.logger.warn(content);

  if (hasEvent(ctx.automationEvents, 'blocked_alerted')) {
    ctx.logger.info(`Round ${roundId}: blocked_alerted already recorded, skipping private alert.`);
    return { action: ACTIONS.BLOCKED, roundId, blocker: decision.blocker, reason: decision.reason, alertPosted: false, duplicate: true };
  }
  if (!ctx.alertsWebhookUrl) {
    ctx.logger.info(`Round ${roundId}: no DISCORD_VOTING_ALERTS_WEBHOOK_URL set, skipped blocked alert.`);
    return { action: ACTIONS.BLOCKED, roundId, blocker: decision.blocker, reason: decision.reason, alertPosted: false };
  }

  const discord = await announce(ctx, {
    roundId,
    eventType: 'blocked_alerted',
    content,
    url: ctx.alertsWebhookUrl,
    label: 'Discord alerts',
    webhookName: 'DISCORD_VOTING_ALERTS_WEBHOOK_URL',
  });
  if (discord.posted) {
    const record = await ctx.client.recordAutomationEvent({
      roundId,
      eventType: 'blocked_alerted',
      payload: { today: ctx.today, blocker: decision.blocker, status: discord.status || null },
    });
    if (record.duplicate) ctx.logger.info(`Round ${roundId}: blocked_alerted was already recorded.`);
  }

  return {
    action: ACTIONS.BLOCKED,
    roundId,
    blocker: decision.blocker,
    reason: decision.reason,
    alertPosted: Boolean(discord.posted),
  };
}

// Run one scheduler pass. Side-effecting dependencies are injectable so the flow
// can be tested without real network or filesystem access:
//   deps.client        api client (defaults to a real createApiClient)
//   deps.postDiscord   Discord poster (defaults to the real postDiscord)
//   deps.deleteDiscordMessage best-effort Discord message cleanup
//   deps.writeHandoff  handoff writer (defaults to the real writeHandoff)
//   deps.logger        { info, warn, error } (defaults to console)
// `today` defaults to the real current date (YYYY-MM-DD).
export async function runScheduler({ env = process.env, today, deps = {} } = {}) {
  const config = readEnv(env);
  const logger = deps.logger || defaultLogger();
  const client = deps.client || createApiClient({ baseUrl: config.baseUrl, adminToken: config.adminToken });
  const postDiscordFn = deps.postDiscord || postDiscord;
  const deleteDiscordMessageFn = deps.deleteDiscordMessage || deleteDiscordMessage;
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
    rcvResult: payload.rcvResult,
    automationEvents: payload.automationEvents,
  });
  logger.info(`Round ${decision.roundId}: decided "${decision.action}". ${decision.reason}`);

  const ctx = {
    client,
    logger,
    postDiscordFn,
    writeHandoffFn,
    deleteDiscordMessageFn,
    baseUrl: config.baseUrl,
    webhookUrl: config.discordWebhookUrl,
    alertsWebhookUrl: config.discordAlertsWebhookUrl,
    today: day,
    suggestions: payload.suggestions || [],
    automationEvents: payload.automationEvents || [],
  };

  if (decision.action === ACTIONS.ANNOUNCE_SUGGESTIONS) {
    return await handleAnnounceSuggestions(ctx, { round });
  }
  if (decision.action === ACTIONS.OPEN_VOTING) {
    return await handleOpenVoting(ctx, { round });
  }
  if (decision.action === ACTIONS.REVEAL_WINNER) {
    return await handleRevealWinner(ctx, { payload, decision });
  }
  if (decision.action === ACTIONS.BLOCKED) {
    return await handleBlocked(ctx, { round, decision });
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
