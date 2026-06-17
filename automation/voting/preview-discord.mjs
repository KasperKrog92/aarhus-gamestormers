// Manual Discord preview for the voting scheduler messages. Posts sample
// announcements to a webhook so you can see exactly how they render in a test
// channel, without touching any round state, D1, or the live admin API.
//
// This is a dev helper only. The scheduler and the GitHub Actions workflow never
// run it. Keep your webhook URL out of git: pass it through the environment.
//
// Usage (PowerShell):
//   $env:DISCORD_VOTING_WEBHOOK_URL = "https://discord.com/api/webhooks/..."
//   node automation/voting/preview-discord.mjs
//
// Usage (bash):
//   DISCORD_VOTING_WEBHOOK_URL="https://discord.com/api/webhooks/..." \
//     node automation/voting/preview-discord.mjs
//
// Optional: set VOTING_BASE_URL to change the /vote link (defaults to the live site).

import {
  blockedMessage,
  postDiscord,
  votingOpenedMessage,
  winnerRevealedMessage,
} from './discord.mjs';

const webhookUrl = String(process.env.DISCORD_VOTING_WEBHOOK_URL || '').trim();
if (!webhookUrl) {
  console.error('Set DISCORD_VOTING_WEBHOOK_URL to your test channel webhook first.');
  process.exit(1);
}
const baseUrl = String(process.env.VOTING_BASE_URL || 'https://www.gamestormers.dk').trim();

// Sample data, shaped like a real admin round row and a scheduler winner.
const round = { id: 19, meeting_date: '2026-09-15' };
const winner = { id: 101, title: 'Hollow Knight', votes: 7 };

const samples = [
  ['voting_opened', votingOpenedMessage({ round, baseUrl })],
  ['winner_revealed', winnerRevealedMessage({ round, winner, baseUrl })],
  // The runner only LOGS blocked states (tie / no votes), it does not post them,
  // so the hourly schedule never spams the channel. Shown here only so you can
  // see the format if you ever wire up manual alerting.
  [
    'blocked (preview only, not auto-posted)',
    blockedMessage({
      round,
      decision: { blocker: 'tie', reason: 'a 4-vote tie for first place (Celeste, Outer Wilds)' },
    }),
  ],
];

for (const [label, content] of samples) {
  const result = await postDiscord(webhookUrl, content);
  if (result.posted) {
    console.log(`Posted ${label} (status ${result.status}).`);
  } else {
    console.warn(`Failed to post ${label}: status ${result.status ?? 'n/a'}.`);
  }
}
