// Discord webhook messages for the voting scheduler. The builders are pure
// (they return a content string) so they are easy to test; postDiscord wraps a
// content string in the webhook payload and sends it.
//
// allowed_mentions parse [] means a game title containing @everyone or a role
// mention can never actually ping the channel. These phase/winner announcements
// use their own webhook (DISCORD_VOTING_WEBHOOK_URL), kept separate from the
// new-suggestion notifications and the sale-alert webhook.

const DISCORD_CONTENT_LIMIT = 2000;

function trimTrailingSlashes(value) {
  return String(value || '').replace(/\/+$/, '');
}

function voteUrl(baseUrl) {
  return `${trimTrailingSlashes(baseUrl)}/vote`;
}

// "15 September 2026" from a YYYY-MM-DD string; '' when missing/invalid.
function formatMeetingDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

// Accepts the raw admin round row (meeting_date) or a camelCase shape.
function meetingLabel(round) {
  const number = round && round.id != null ? `meeting #${round.id}` : 'our next meeting';
  const date = formatMeetingDate(round && (round.meeting_date || round.meetingDate));
  return date ? `${number} on ${date}` : number;
}

export function votingOpenedMessage({ round, baseUrl }) {
  return [
    `🗳️ Voting is now open for ${meetingLabel(round)}!`,
    `Cast your vote here: ${voteUrl(baseUrl)}`,
  ].join('\n');
}

export function winnerRevealedMessage({ round, winner, baseUrl }) {
  const title = (winner && winner.title) || 'the winning game';
  return [
    `🏆 The winner for ${meetingLabel(round)} is **${title}**!`,
    `See the full results: ${voteUrl(baseUrl)}`,
  ].join('\n');
}

// Maintainer-facing heads-up for a blocked decision (tie or no votes). Reuses
// the scheduler's already-descriptive reason, which names the tied suggestions.
export function blockedMessage({ round, decision }) {
  const reason = (decision && decision.reason) || 'A voting round needs manual review.';
  return `⚠️ Voting automation needs attention for ${meetingLabel(round)}: ${reason}`;
}

export function toWebhookPayload(content) {
  return {
    content: String(content || '').slice(0, DISCORD_CONTENT_LIMIT),
    allowed_mentions: { parse: [] },
  };
}

// POST a content string to a Discord webhook. A missing url or content is a
// no-op (returns { skipped: true }) so the runner works without the secret.
// Non-ok responses are reported via `posted`/`status` rather than thrown: a
// failed announcement should not undo a phase change the runner already made.
export async function postDiscord(url, content, { fetch = globalThis.fetch } = {}) {
  if (!url || !content) return { skipped: true, posted: false };
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(toWebhookPayload(content)),
  });
  return { skipped: false, posted: Boolean(response.ok), status: response.status };
}
