// Discord webhook messages for the voting scheduler. The builders are pure
// (they return a content string) so they are easy to test; postDiscord wraps a
// content string in the webhook payload and sends it.
//
// House style (see the Discord-announcement templates): a leading `#` header for
// the title, masked links with the URL wrapped in <...> so Discord suppresses
// the auto-preview card, English /en/ link targets, the round's storm code shown
// as inline code, and plain hyphens (no em dashes). Masked links render in
// webhook/bot messages even though normal user messages cannot use them.
//
// allowed_mentions parse [] means a game title containing @everyone or a role
// mention can never actually ping the channel. These phase/winner announcements
// use their own webhook (DISCORD_VOTING_WEBHOOK_URL), kept separate from the
// new-suggestion notifications and the sale-alert webhook.

const DISCORD_CONTENT_LIMIT = 2000;

// The club always meets at the same venue, so the map link is a fixed short URL
// (the same one the website links the venue name to).
const VENUE_MAP_URL = 'https://maps.app.goo.gl/8fqwBqEZA7x3TUgR6';

// Standard club meeting window in Copenhagen local time. Used as a fallback when
// a caller passes a meeting object without explicit times.
const DEFAULT_START_TIME = '18:30';
const DEFAULT_END_TIME = '21:00';

function trimTrailingSlashes(value) {
  return String(value || '').replace(/\/+$/, '');
}

// English page targets: the club's Discord is English, so the announcements link
// to the /en/ pages even though the site default is Danish at the root.
function voteUrl(baseUrl) {
  return `${trimTrailingSlashes(baseUrl)}/en/vote`;
}

function frontUrl(baseUrl) {
  return `${trimTrailingSlashes(baseUrl)}/en/`;
}

// Masked link with the auto-preview card suppressed (the <...> around the URL).
function link(text, url) {
  return `[${text}](<${url}>)`;
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

// "Monday" from a YYYY-MM-DD string; '' when missing/invalid.
function weekday(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(date);
}

// Accepts the raw admin round row (snake_case) or a camelCase shape.
function meetingNumber(round) {
  return round && round.id != null ? round.id : null;
}

function meetingDateOf(round) {
  return round && (round.meeting_date || round.meetingDate);
}

function stormCodeOf(round) {
  return round && (round.storm_code || round.stormCode);
}

// Joins message blocks with a blank line between them, dropping empty blocks so
// optional sections collapse cleanly. Each block may itself be multi-line.
function joinBlocks(blocks) {
  return blocks.filter((block) => block && String(block).trim()).join('\n\n');
}

function fitListBlock({ header, items, reserveBlocks }) {
  const cleanItems = (items || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (!cleanItems.length) return '';

  const reserve = joinBlocks(reserveBlocks);
  const joinWithBlock = (block) => joinBlocks([...reserveBlocks.slice(0, 2), block, ...reserveBlocks.slice(2)]);
  const budget = DISCORD_CONTENT_LIMIT - reserve.length - 2;
  if (budget <= header.length) return '';

  const lines = [header];
  for (let i = 0; i < cleanItems.length; i += 1) {
    const remaining = cleanItems.length - i;
    const moreLine = remaining > 1 ? `- And ${remaining - 1} more...` : '';
    const nextLine = `- ${cleanItems[i]}`;
    const candidateLines = [...lines, nextLine];
    if (moreLine) candidateLines.push(moreLine);
    const candidate = candidateLines.join('\n');
    if (joinWithBlock(candidate).length > DISCORD_CONTENT_LIMIT) {
      if (moreLine && joinWithBlock([...lines, `- And ${remaining} more...`].join('\n')).length <= DISCORD_CONTENT_LIMIT) {
        lines.push(`- And ${remaining} more...`);
      }
      return lines.length > 1 ? lines.join('\n') : '';
    }
    lines.push(nextLine);
  }

  return lines.join('\n');
}

// "meeting #19 on 15 September 2026" / "meeting #19" / "our next meeting".
function meetingLabel(round) {
  const n = meetingNumber(round);
  const number = n != null ? `meeting #${n}` : 'our next meeting';
  const date = formatMeetingDate(meetingDateOf(round));
  return date ? `${number} on ${date}` : number;
}

// Suggestions are open: invite pitches and hand out the meeting code. Posted when
// a round reaches suggestions_open_at.
export function suggestionsOpenedMessage({ round, baseUrl }) {
  const n = meetingNumber(round);
  const date = formatMeetingDate(meetingDateOf(round));
  const opensAt = formatMeetingDate(round && (round.voting_opens_at || round.votingOpensAt));
  const code = stormCodeOf(round);
  const onDate = date ? ` on **${date}**` : '';

  const title = n != null
    ? `# 🎮 Game Suggestions Open - Club Meeting #${n}`
    : '# 🎮 Game Suggestions Open';

  const intro = n != null
    ? `It's time to suggest games for our next meeting, Aarhus Gamestormers #${n}${onDate} 👾`
    : `It's time to suggest games for our next meeting${onDate} 👾`;

  const guidelines = [
    'A few things to keep in mind:',
    '- The game should be available on PC',
    '- Aim for something finishable in around 10 hours or less',
    '- Longer or "never-ending" games are welcome too, just say so in your pitch',
    `- Check the ${link('frontpage', frontUrl(baseUrl))} for past games and what's coming up`,
    '- If the game is on Steam, add a Steam link and your suggestion fills in the title, image, genres, and description automatically',
  ].join('\n');

  const suggestBlock = [
    'Suggest your games here:',
    `🔗 ${link('the vote page', voteUrl(baseUrl))}`,
    code ? `Meeting code: \`${code}\`` : '',
  ].filter(Boolean).join('\n');

  const closing = opensAt
    ? `Voting opens on **${opensAt}**. Looking forward to seeing what you come up with!`
    : 'Looking forward to seeing what you come up with!';

  return joinBlocks([title, intro, guidelines, suggestBlock, closing]);
}

// Voting is open: list the lineup and repeat the code. `games` is an array of
// approved suggestion titles; when omitted the lineup section is dropped.
export function votingOpenedMessage({ round, baseUrl, games = [] }) {
  const n = meetingNumber(round);
  const date = formatMeetingDate(meetingDateOf(round));
  const closesAt = formatMeetingDate(round && (round.voting_closes_at || round.votingClosesAt));
  const code = stormCodeOf(round);
  const onDate = date ? ` on **${date}**` : '';

  const title = n != null
    ? `# 🗳️ Voting Has Begun - Club Meeting #${n}`
    : '# 🗳️ Voting Has Begun';

  const intro = n != null
    ? `The suggestion phase is over, and voting is now open for the Meeting #${n} game${onDate} 🎮`
    : `The suggestion phase is over, and voting is now open${onDate} 🎮`;

  const voteBlock = [
    'Cast your votes here:',
    `🔗 ${link('the vote page', voteUrl(baseUrl))}`,
  ].join('\n');

  const codeLine = code
    ? `You can vote for as many games as you like. The voting code is \`${code}\`.`
    : 'You can vote for as many games as you like.';

  const closing = closesAt
    ? `Voting closes on **${closesAt}**. After that the winner will be revealed 🥁`
    : 'The winner will be revealed once voting closes 🥁';

  const reserveBlocks = [title, intro, voteBlock, codeLine, closing];
  const lineup = fitListBlock({
    header: "Here's the lineup this time:",
    items: games,
    reserveBlocks,
  });

  return joinBlocks([title, intro, lineup, voteBlock, codeLine, closing]);
}

// Winner / meeting announcement. Richer than the other two because it doubles as
// the event sign-up post. Per the agreed flow this is posted after meeting setup
// (Discord event created, HowLongToBeat link added), so the optional fields are
// expected to be present then; each one still degrades gracefully when missing.
//
//   round    { id, meeting_date }
//   winner   { title, description, steamUrl|storeUrl, hltbUrl }
//   meeting  { startTime, endTime, venueName, venueAddress, venueMapUrl } (optional)
//   eventUrl Discord scheduled-event link, pasted by the maintainer (optional)
export function winnerRevealedMessage({ round, winner, meeting, eventUrl, baseUrl } = {}) {
  const n = meetingNumber(round);
  const title = (winner && winner.title) || 'the winning game';
  const description = winner && (winner.description || winner.descriptionEn);
  const steamUrl = winner && (winner.steamUrl || winner.storeUrl);
  const hltbUrl = winner && winner.hltbUrl;

  const date = formatMeetingDate(meetingDateOf(round) || (meeting && meeting.meetingDate));
  const day = weekday(meetingDateOf(round) || (meeting && meeting.meetingDate));

  const headerNum = n != null ? `Club Meeting #${n}` : 'Club Meeting';
  const titleLine = `# 🏆 ${headerNum} - ${title}`;
  const revealLine = `After the votes have been counted, the winner for ${headerNum} is...`;

  const gameBlock = [`### 🎮 ${title}`, description ? String(description) : '']
    .filter(Boolean)
    .join('\n');

  const dateLine = date ? `📅 ${day ? `${day}, ` : ''}${date}` : '';
  let timeLine = '';
  let venueLine = '';
  if (meeting) {
    const start = meeting.startTime || DEFAULT_START_TIME;
    const end = meeting.endTime || DEFAULT_END_TIME;
    timeLine = `⏰ ${start} to ~${end}`;
    const venueLabel = [meeting.venueName, meeting.venueAddress].filter(Boolean).join(', ');
    if (venueLabel) {
      venueLine = `📍 ${link(venueLabel, meeting.venueMapUrl || VENUE_MAP_URL)}`;
    }
  }
  const details = [dateLine, timeLine, venueLine].filter(Boolean).join('\n');

  const signUp = eventUrl ? `Sign up here: ${link('Discord event', eventUrl)}` : '';

  const agenda =
    "As always, we'll start with a quick check-in, dive into the game discussion, " +
    '(maybe) have a quiz, and wrap up with a space to share upcoming events or ideas.';

  const usefulLinks = (steamUrl || hltbUrl)
    ? [
        'Useful links:',
        steamUrl ? `🔗 ${link('Steam', steamUrl)}` : '',
        hltbUrl ? `🔗 ${link('HowLongToBeat', hltbUrl)}` : '',
      ].filter(Boolean).join('\n')
    : '';

  const closing = 'Looking forward to seeing everyone there ✨';

  return joinBlocks([titleLine, revealLine, gameBlock, details, signUp, agenda, usefulLinks, closing]);
}

export function winnerAnnouncementFromPayload(payload, { baseUrl } = {}) {
  const game = payload && payload.selectedGame;
  const copy = payload && payload.meetingCopy;
  const meeting = payload && payload.meeting;
  const winner = game
    ? {
        title: game.title,
        description:
          (copy && copy.en && copy.en.eventDescription) ||
          game.descriptionEn ||
          game.descriptionDa,
        steamUrl: game.storeUrl,
        hltbUrl: game.hltbUrl,
      }
    : null;

  return winnerRevealedMessage({
    round: payload && payload.round,
    winner,
    meeting,
    eventUrl: meeting && meeting.discordEventUrl,
    baseUrl,
  });
}

export function winnerSetupNeededMessage({ round, missing = [], baseUrl }) {
  const details = missing.length ? `Missing: ${missing.join(', ')}.` : 'Missing setup details.';
  const adminUrl = `${trimTrailingSlashes(baseUrl)}/vote-admin/`;
  return joinBlocks([
    `⚠️ Winner announcement is waiting for ${meetingLabel(round)}`,
    details,
    `Fill the missing fields, create the Discord event, then post the reveal from vote-admin: ${adminUrl}`,
  ]);
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
