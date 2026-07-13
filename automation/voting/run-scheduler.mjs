// Runner for the voting scheduler, executed by two independent hosts: the
// Cloudflare cron Worker (automation/cron-worker/worker.mjs, the primary clock)
// and GitHub Actions via cli.mjs (the backstop clock, see
// .github/workflows/voting-automation.yml). It wires the pure decision logic in
// scheduler.mjs to the side-effecting modules (api-client, discord, handoff) and
// is the only place that performs phase patches, Discord posts, promotion, and
// handoff writes. It must stay free of node: imports so wrangler can bundle it.
//
// Idempotency model: phase transitions patch the round first, then post Discord
// and record an automation event through the admin API. `recordAutomationEvent`
// returns { duplicate } using a UNIQUE (round_id, event_type) constraint. For
// rolling public announcements, Discord is posted with wait=true so the returned
// message id can be stored in the event payload and later deleted. The phase
// change is the primary re-entry guard, because decideRoundActions branches on
// phase and never re-opens or re-reveals a round that already moved on. Blocked
// states (tie / no votes) post one private alert, guarded by blocked_alerted.

import { createApiClient } from './api-client.mjs';
import { ACTIONS, decideRoundActions } from './scheduler.mjs';
import {
  blockedMessage,
  deleteDiscordMessage,
  postDiscord,
  resultsBreakdownMessage,
  suggestionsOpenedMessage,
  suggestionsReminderMessage,
  votingOpenedMessage,
  votingReminderMessage,
  winnerAnnouncementFromPayload,
  winnerSetupNeededMessage,
} from './discord.mjs';
import { buildHandoffMarkdown, winnerPublicationPlan } from './handoff.mjs';
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
  const discordGeneralWebhookUrl = String(env.DISCORD_GENERAL_WEBHOOK_URL || '').trim();

  const missing = [];
  if (!baseUrl) missing.push('VOTING_BASE_URL');
  if (!adminToken) missing.push('VOTING_ADMIN_TOKEN');
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  return { baseUrl, adminToken, discordWebhookUrl, discordAlertsWebhookUrl, discordGeneralWebhookUrl };
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

async function cleanupPostedMessage(ctx, { roundId, messageId, reason, webhookUrl = ctx.webhookUrl }) {
  if (!messageId) return { skipped: true, deleted: false };
  const result = await ctx.deleteDiscordMessageFn(webhookUrl, messageId);
  if (result.deleted) {
    ctx.logger.info(`Round ${roundId}: deleted Discord message ${messageId}${reason ? ` (${reason})` : ''}.`);
  } else if (!result.skipped) {
    ctx.logger.warn(
      `Round ${roundId}: could not delete Discord message ${messageId}${reason ? ` (${reason})` : ''}; status ${result.status}.`
    );
  }
  return result;
}

async function recordEventAfterDiscord(ctx, { roundId, eventType, payload, postedMessageId, webhookUrl }) {
  try {
    const record = await ctx.client.recordAutomationEvent({ roundId, eventType, payload });
    if (record.duplicate) {
      await cleanupPostedMessage(ctx, {
        roundId,
        messageId: postedMessageId,
        reason: `duplicate ${eventType} event`,
        webhookUrl,
      });
    }
    return record;
  } catch (err) {
    await cleanupPostedMessage(ctx, {
      roundId,
      messageId: postedMessageId,
      reason: `failed ${eventType} event record`,
      webhookUrl,
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
  // A real post attempt that Discord rejected (non-ok status) must not be
  // recorded, or the announcement is locked out forever; the next pass retries.
  // A skipped post (no webhook configured) still records, matching the
  // documented degrade-quietly behaviour.
  if (!discord.posted && !discord.skipped) {
    ctx.logger.warn(`Round ${roundId}: suggestions_opened announcement returned status ${discord.status}; not recording so the next pass retries.`);
    return { action: ACTIONS.ANNOUNCE_SUGGESTIONS, roundId, duplicate: false, discordPosted: false };
  }
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
  if (hasEvent(roundPayload.automationEvents, 'winner_setup_needed_alerted')) {
    ctx.logger.info(`Round ${roundId}: winner setup alert already recorded, skipping.`);
    return { skipped: false, posted: false, duplicate: true };
  }
  // Post first, record only on success (same ordering as the blocked alert):
  // recording an alert that never reached Discord would silence the
  // maintainer's only nudge to finish winner setup.
  const discord = await announce(ctx, {
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
  if (discord.posted) {
    const record = await ctx.client.recordAutomationEvent({
      roundId,
      eventType: 'winner_setup_needed_alerted',
      payload: { today: ctx.today, missing: readiness.missing || [] },
    });
    if (record.duplicate) ctx.logger.info(`Round ${roundId}: winner_setup_needed_alerted was already recorded.`);
  } else {
    ctx.logger.warn(`Round ${roundId}: winner setup alert returned status ${discord.status}; not recording so a later pass can retry.`);
  }
  return discord;
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
  // Do not record a failed post: the phase has already advanced, and the
  // decision logic re-emits open_voting while voting_opened is missing, so the
  // next pass re-announces instead of losing the announcement forever. The old
  // suggestions message is only cleaned up once the new post succeeded.
  if (!discord.posted && !discord.skipped) {
    logger.warn(`Round ${roundId}: voting_opened announcement returned status ${discord.status}; not recording so the next pass re-announces.`);
    return { action: ACTIONS.OPEN_VOTING, roundId, duplicate: false, discordPosted: false };
  }
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

// Post a general-chat reminder (suggestion/voting window, halfway or last day)
// and record its idempotency event. Same rolling-post safety as the phase
// announcements: post with wait so a duplicate or failed event record can
// delete the just-posted message, but reminders are never deleted otherwise
// (general chat keeps its history).
async function handleReminder(ctx, { round, decision }) {
  const roundId = decision.roundId;
  const content = decision.action === ACTIONS.REMIND_SUGGESTIONS
    ? suggestionsReminderMessage({
        round,
        baseUrl: ctx.baseUrl,
        reminder: decision.reminder,
        gamesCount: approvedGameTitles(ctx.suggestions).length,
      })
    : votingReminderMessage({
        round,
        baseUrl: ctx.baseUrl,
        reminder: decision.reminder,
        ballotCount: ctx.ballotCount,
      });

  const discord = await announce(ctx, {
    roundId,
    eventType: decision.eventType,
    content,
    url: ctx.generalWebhookUrl,
    label: 'Discord general chat',
    webhookName: 'DISCORD_GENERAL_WEBHOOK_URL',
    wait: true,
  });
  // Same retry rule as the phase announcements: a rejected post is not
  // recorded, so the next pass retries (a halfway reminder simply lapses once
  // the last day arrives). A skipped post still records.
  if (!discord.posted && !discord.skipped) {
    ctx.logger.warn(`Round ${roundId}: ${decision.eventType} reminder returned status ${discord.status}; not recording so the next pass retries.`);
    return { action: decision.action, roundId, reminder: decision.reminder, duplicate: false, discordPosted: false };
  }
  const record = await recordEventAfterDiscord(ctx, {
    roundId,
    eventType: decision.eventType,
    payload: { today: ctx.today, reminder: decision.reminder, messageId: discord.messageId || null, status: discord.status || null },
    postedMessageId: discord.messageId,
    webhookUrl: ctx.generalWebhookUrl,
  });
  if (record.duplicate) ctx.logger.info(`Round ${roundId}: ${decision.eventType} already recorded; cleaned up duplicate post if needed.`);

  return {
    action: decision.action,
    roundId,
    reminder: decision.reminder,
    duplicate: Boolean(record.duplicate),
    discordPosted: Boolean(discord.posted),
  };
}

// General-chat pointer to the vote page's ranked-choice breakdown, posted
// alongside the final winner announcement. Record-first: the event is the lock
// (also shared with the admin "Post Discord reveal" path, which posts the same
// link), and a post failure after recording is logged, not retried.
async function postResultsBreakdown(ctx, { roundPayload }) {
  const roundId = roundPayload.round.id;
  if (!ctx.generalWebhookUrl) {
    ctx.logger.info(`Round ${roundId}: no DISCORD_GENERAL_WEBHOOK_URL set, skipped results breakdown link.`);
    return { skipped: true, posted: false };
  }
  if (hasEvent(roundPayload.automationEvents, 'results_link_posted')) {
    ctx.logger.info(`Round ${roundId}: results breakdown link already posted, skipping.`);
    return { skipped: false, posted: false, duplicate: true };
  }
  const record = await ctx.client.recordAutomationEvent({
    roundId,
    eventType: 'results_link_posted',
    payload: { today: ctx.today, source: 'scheduler' },
  });
  if (record.duplicate) {
    ctx.logger.info(`Round ${roundId}: results_link_posted already recorded, skipping.`);
    return { skipped: false, posted: false, duplicate: true };
  }
  return await announce(ctx, {
    roundId,
    eventType: 'results_link_posted',
    content: resultsBreakdownMessage({ round: roundPayload.round, baseUrl: ctx.baseUrl }),
    url: ctx.generalWebhookUrl,
    label: 'Discord general chat',
    webhookName: 'DISCORD_GENERAL_WEBHOOK_URL',
  });
}

// Post-reveal side effects shared by the initial reveal pass and the
// resume_reveal recovery pass: refetch, plan, promote when safe, announce or
// alert, and write the handoff. Every step is guarded by its own automation
// event, so re-running after a mid-flight failure is safe. `announce` is false
// on a duplicate reveal (a concurrent pass owns the announcement);
// `previousEvents` supplies the stored voting_opened message id for cleanup.
async function completeRevealSideEffects(ctx, { roundId, winnerSuggestionId, previousEvents, announce: shouldAnnounce = true }) {
  const { client, logger, baseUrl } = ctx;
  let discord = { skipped: true, posted: false };

  // Refetch so the publication planner sees the recorded winner and any
  // existing selected-game state.
  let latest = await client.getAdminRound(roundId);
  let plan = winnerPublicationPlan({ roundPayload: latest, winnerSuggestionId });
  logger.info(`Round ${roundId}: publication plan: ${plan.reason}`);

  let promoted = false;
  if (plan.mayPromote && winnerSuggestionId != null) {
    // Safe publication: either re-confirm an already-selected publish-ready
    // winner, or promote a winning suggestion whose copied fields already make a
    // complete frontpage card.
    await client.selectWinner(roundId, winnerSuggestionId);
    promoted = true;
    logger.info(`Round ${roundId}: promoted the publish-ready selected game.`);
    latest = await client.getAdminRound(roundId);
    plan = winnerPublicationPlan({ roundPayload: latest, winnerSuggestionId });
  }

  if (shouldAnnounce) {
    const readiness = latest.announcementReadiness || latest.publishReadiness || { ready: false, missing: [] };
    if (readiness.ready) {
      discord = await postWinnerAnnouncement(ctx, { roundPayload: latest, source: 'scheduler' });
      if (discord.posted) {
        await cleanupPostedMessage(ctx, {
          roundId,
          messageId: messageIdForEvent(previousEvents, 'voting_opened'),
          reason: 'winner announcement posted',
        });
        await postResultsBreakdown(ctx, { roundPayload: latest });
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

  return { discord, promoted, handoffPath };
}

async function handleRevealWinner(ctx, { payload, decision }) {
  const { logger } = ctx;
  const roundId = decision.roundId;
  const winnerSuggestionId = decision.winnerSuggestionId;

  const record = await patchPhaseAndRecord(ctx, {
    roundId,
    patch: { phase: 'revealed', winnerSuggestionId },
    eventType: 'winner_revealed',
    payload: { today: ctx.today, winnerSuggestionId },
  });
  if (record.duplicate) logger.info(`Round ${roundId}: winner_revealed already recorded.`);

  const outcome = await completeRevealSideEffects(ctx, {
    roundId,
    winnerSuggestionId,
    previousEvents: payload.automationEvents,
    announce: !record.duplicate,
  });

  return {
    action: ACTIONS.REVEAL_WINNER,
    roundId,
    winnerSuggestionId,
    duplicate: Boolean(record.duplicate),
    discordPosted: Boolean(outcome.discord.posted),
    promoted: outcome.promoted,
    handoffPath: outcome.handoffPath,
  };
}

// Recovery for a reveal whose pass died before recording any follow-up: the
// round is revealed and winner_revealed is recorded, but neither the public
// announcement, the setup alert, nor the handoff ever got recorded (e.g. the
// admin API or Discord failed mid-reveal). Re-run the post-reveal side effects.
async function handleResumeReveal(ctx, { decision }) {
  const roundId = decision.roundId;
  ctx.logger.warn(`Round ${roundId}: resuming post-reveal steps; no follow-up event was recorded after winner_revealed.`);
  const outcome = await completeRevealSideEffects(ctx, {
    roundId,
    winnerSuggestionId: decision.winnerSuggestionId,
    previousEvents: ctx.automationEvents,
    announce: true,
  });
  return {
    action: ACTIONS.RESUME_REVEAL,
    roundId,
    winnerSuggestionId: decision.winnerSuggestionId,
    duplicate: false,
    discordPosted: Boolean(outcome.discord.posted),
    promoted: outcome.promoted,
    handoffPath: outcome.handoffPath,
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
//   deps.writeHandoff  handoff writer, REQUIRED: delivery is host-specific
//                      (file for the Node CLI, Discord attachment for the Worker)
//   deps.logger        { info, warn, error } (defaults to console)
// `today` defaults to the real current date (YYYY-MM-DD).
export async function runScheduler({ env, today, deps = {} } = {}) {
  const config = readEnv(env ?? (typeof process !== 'undefined' ? process.env : {}));
  if (typeof deps.writeHandoff !== 'function') {
    throw new Error('runScheduler requires deps.writeHandoff (host-specific handoff delivery).');
  }
  const logger = deps.logger || defaultLogger();
  const client = deps.client || createApiClient({ baseUrl: config.baseUrl, adminToken: config.adminToken });
  const postDiscordFn = deps.postDiscord || postDiscord;
  const deleteDiscordMessageFn = deps.deleteDiscordMessage || deleteDiscordMessage;
  const writeHandoffFn = deps.writeHandoff;
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
    generalWebhookUrl: config.discordGeneralWebhookUrl,
    today: day,
    suggestions: payload.suggestions || [],
    automationEvents: payload.automationEvents || [],
    ballotCount: Array.isArray(payload.ballots) ? payload.ballots.length : null,
  };

  if (decision.action === ACTIONS.ANNOUNCE_SUGGESTIONS) {
    return await handleAnnounceSuggestions(ctx, { round });
  }
  if (decision.action === ACTIONS.OPEN_VOTING) {
    return await handleOpenVoting(ctx, { round });
  }
  if (decision.action === ACTIONS.REMIND_SUGGESTIONS || decision.action === ACTIONS.REMIND_VOTING) {
    return await handleReminder(ctx, { round, decision });
  }
  if (decision.action === ACTIONS.REVEAL_WINNER) {
    return await handleRevealWinner(ctx, { payload, decision });
  }
  if (decision.action === ACTIONS.RESUME_REVEAL) {
    return await handleResumeReveal(ctx, { decision });
  }
  if (decision.action === ACTIONS.BLOCKED) {
    return await handleBlocked(ctx, { round, decision });
  }

  return { action: ACTIONS.NOOP, roundId: decision.roundId, reason: decision.reason };
}
