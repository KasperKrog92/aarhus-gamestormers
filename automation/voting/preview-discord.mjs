// Manual Discord preview for the voting scheduler messages. With a webhook set it
// posts sample announcements to a test channel so you can see exactly how they
// render; without one it prints the rendered text to stdout (a dry run). Either
// way it never touches any round state, D1, or the live admin API.
//
// This is a dev helper only. The scheduler and the GitHub Actions workflow never
// run it. Keep your webhook URL out of git: pass it through the environment.
//
// Post to a test channel (PowerShell):
//   $env:DISCORD_VOTING_WEBHOOK_URL = "https://discord.com/api/webhooks/..."
//   node automation/voting/preview-discord.mjs
//
// Post to a test channel (bash):
//   DISCORD_VOTING_WEBHOOK_URL="https://discord.com/api/webhooks/..." \
//     node automation/voting/preview-discord.mjs
//
// Dry run (just print the rendered messages, no webhook needed):
//   node automation/voting/preview-discord.mjs
//
// Optional: set VOTING_BASE_URL to change the /en/ link targets (defaults to the
// live site).

import {
  blockedMessage,
  postDiscord,
  suggestionsOpenedMessage,
  votingOpenedMessage,
  winnerRevealedMessage,
} from './discord.mjs';

const webhookUrl = String(process.env.DISCORD_VOTING_WEBHOOK_URL || '').trim();
const baseUrl = String(process.env.VOTING_BASE_URL || 'https://www.gamestormers.dk').trim();

// Sample data, shaped like a real admin round row, the approved suggestions, and
// the winning game plus the meeting details a maintainer adds during setup.
const round = {
  id: 19,
  meeting_date: '2026-09-15',
  voting_opens_at: '2026-07-20',
  voting_closes_at: '2026-07-27',
  storm_code: 'storm19',
};
const games = ['Hollow Knight', 'Celeste', 'Outer Wilds'];
const winner = {
  id: 101,
  title: 'Hollow Knight',
  votes: 7,
  description: 'A hand-drawn metroidvania about exploring a vast, ruined kingdom of insects and heroes.',
  steamUrl: 'https://store.steampowered.com/app/367520/Hollow_Knight/',
  hltbUrl: 'https://howlongtobeat.com/game/26606',
};
const meeting = {
  startTime: '18:30',
  endTime: '21:00',
  venueName: 'Folkehuset Møllestien',
  venueAddress: 'Grønnegade 10, 8000 Aarhus C',
};
// A maintainer pastes this in after creating the Discord scheduled event.
const eventUrl = 'https://discord.com/events/123456789012345678/987654321098765432';

const samples = [
  ['suggestions_opened', suggestionsOpenedMessage({ round, baseUrl })],
  ['voting_opened', votingOpenedMessage({ round, baseUrl, games })],
  ['winner_revealed', winnerRevealedMessage({ round, winner, meeting, eventUrl, baseUrl })],
  // The runner only LOGS blocked states (tie / no votes); it does not post them,
  // so the schedule never spams the channel. Shown here only so you can see the
  // format if you ever wire up the private alerts channel.
  [
    'blocked (preview only, not auto-posted)',
    blockedMessage({
      round,
      decision: { blocker: 'tie', reason: 'a 4-vote tie for first place (Celeste, Outer Wilds)' },
    }),
  ],
];

if (!webhookUrl) {
  console.log('No DISCORD_VOTING_WEBHOOK_URL set; printing a dry run instead of posting.\n');
  for (const [label, content] of samples) {
    console.log(`===== ${label} =====`);
    console.log(content);
    console.log('');
  }
  process.exit(0);
}

for (const [label, content] of samples) {
  const result = await postDiscord(webhookUrl, content);
  if (result.posted) {
    console.log(`Posted ${label} (status ${result.status}).`);
  } else {
    console.warn(`Failed to post ${label}: status ${result.status ?? 'n/a'}.`);
  }
}
