// One-off migration helper: parse the hardcoded event/history cards in
// index.html (da) and en/index.html (en) and emit backfill-meetings.sql, which
// seeds the D1 `games`, `meetings`, and `meeting_copy` tables so the
// database-backed homepage reproduces the static cards.
//
// Run: node scripts/build-backfill-sql.mjs
//
// What is exact vs. approximate:
// - Upcoming meetings (those with an event card) get exact start/end UTC and the
//   real meeting date straight from the card's calendar data.
// - Past meetings (history cards only) have no date in the HTML, so this script
//   synthesizes a plausible "first Monday of the month" date counting backwards
//   from the earliest upcoming meeting. These placeholder dates only affect
//   ordering and the upcoming/history split; the history card itself renders no
//   date. The maintainer can correct them later via the admin UI.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { meetingUtcRange } from '../functions/_lib/schedule.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMEZONE = 'Europe/Copenhagen';
const VENUE_NAME = 'Folkehuset Møllestien';
const VENUE_ADDRESS = 'Grønnegade 10, 8000 Aarhus C';
const DISCORD_INVITE = 'https://discord.gg/N2h6DJxVDF';
const DEFAULT_START = '18:30';
const DEFAULT_END = '21:00';

function decodeEntities(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

// Extract the balanced <div>...</div> starting at `start` by counting div depth,
// so a card never bleeds into the markup that follows it.
function extractBalancedDiv(html, start) {
  const tagRe = /<\/?div\b[^>]*>/g;
  tagRe.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(html))) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, tagRe.lastIndex);
  }
  return html.slice(start);
}

function matchAllCards(html, openPattern) {
  const re = new RegExp(openPattern, 'g');
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    out.push(extractBalancedDiv(html, m.index));
    re.lastIndex = m.index + 1;
  }
  return out;
}

function platformsFromIcons(block) {
  const platforms = [];
  if (/#gs-icon-windows/.test(block)) platforms.push('Windows');
  if (/#gs-icon-apple/.test(block)) platforms.push('macOS');
  if (/#gs-icon-linux/.test(block)) platforms.push('Linux');
  return platforms;
}

function genresFrom(block) {
  const genres = [];
  for (const m of block.matchAll(/<span class="history-genre">([\s\S]*?)<\/span>/g)) {
    genres.push(stripTags(m[1]));
  }
  return genres;
}

function steamFrom(block) {
  const m = block.match(/href="(https:\/\/store\.steampowered\.com\/app\/(\d+)[^"]*)"/);
  return m ? { storeUrl: m[1], appId: m[2] } : { storeUrl: null, appId: null };
}

function gogFrom(block) {
  const m = block.match(/href="(https:\/\/www\.gog\.com\/[^"]*)"/);
  return m ? m[1] : null;
}

function imageFrom(block) {
  const m = block.match(/src="(https:\/\/cdn\.akamai\.steamstatic\.com\/steam\/apps\/\d+\/header\.jpg)"/);
  return m ? m[1] : null;
}

function compactToIso(compact) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(compact || ''));
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

// First Monday of the month that is `monthsBack` months before `from`.
function firstMonday(fromYear, fromMonth0, monthsBack) {
  const idx = fromYear * 12 + fromMonth0 - monthsBack;
  const year = Math.floor(idx / 12);
  const month0 = idx - year * 12;
  const first = new Date(Date.UTC(year, month0, 1));
  const offset = (8 - first.getUTCDay()) % 7; // 0=Sun..1=Mon
  const day = 1 + ((offset + 6) % 7); // shift so Monday lands first
  const date = new Date(Date.UTC(year, month0, day));
  return date.toISOString().slice(0, 10);
}

function parseEventCards(html) {
  const cards = matchAllCards(html, '<div class="event-card">');
  const out = {};
  for (const block of cards) {
    const idMatch = block.match(/class="event-num">(?:Meeting\s*)?(\d+)/);
    if (!idMatch) continue;
    const id = Number(idMatch[1]);
    const title = stripTags((block.match(/<h3 class="event-title">([\s\S]*?)<\/h3>/) || [])[1] || '');
    const steam = steamFrom(block.match(/<div class="event-store-links">[\s\S]*?<\/div>/)?.[0] || block);
    const start = compactToIso((block.match(/data-start="([^"]+)"/) || [])[1]);
    const end = compactToIso((block.match(/data-end="([^"]+)"/) || [])[1]);
    const playtimeMatch = block.match(/~\s*(\d+)\s*(?:t\.|hrs\.)/);
    const hltbMatch = block.match(/class="event-playtime" href="([^"]+)"/);
    const descMatch = block.match(/<div class="event-desc">([\s\S]*?)<\/div>/);
    const paragraphs = descMatch
      ? [...descMatch[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => stripTags(m[1])).filter(Boolean)
      : [];
    out[id] = {
      id,
      title,
      image: imageFrom(block),
      storeUrl: steam.storeUrl,
      steamAppId: steam.appId,
      gogUrl: gogFrom(block),
      genres: genresFrom(block.match(/<div class="history-genre-row">[\s\S]*?<\/div>/)?.[0] || ''),
      platforms: platformsFromIcons(block),
      playtimeHours: playtimeMatch ? Number(playtimeMatch[1]) : null,
      hltbUrl: hltbMatch ? hltbMatch[1] : null,
      startsAtUtc: start,
      endsAtUtc: end,
      meetingDate: start ? start.slice(0, 10) : null,
      eventDescription: paragraphs.join('\n\n'),
    };
  }
  return out;
}

function parseHistoryCards(html) {
  const cards = matchAllCards(html, '<div class="history-card"');
  const out = {};
  for (const block of cards) {
    const idMatch = block.match(/class="history-num">(\d+)/);
    if (!idMatch) continue;
    const id = Number(idMatch[1]);
    const steam = steamFrom(block);
    out[id] = {
      id,
      title: stripTags((block.match(/<span class="history-name">([\s\S]*?)<\/span>/) || [])[1] || ''),
      image: imageFrom(block),
      storeUrl: steam.storeUrl,
      steamAppId: steam.appId,
      gogUrl: gogFrom(block),
      genres: genresFrom(block.match(/<div class="history-genre-row">[\s\S]*?<\/div>/)?.[0] || ''),
      revealUtc: compactToIso((block.match(/data-reveal="([^"]+)"/) || [])[1]),
      historyDescription: stripTags((block.match(/<p class="history-desc">([\s\S]*?)<\/p>/) || [])[1] || ''),
    };
  }
  return out;
}

function sql(value) {
  if (value == null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function num(value) {
  return value == null || value === '' ? 'NULL' : Number(value);
}

async function main() {
  const da = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const en = await readFile(path.join(ROOT, 'en/index.html'), 'utf8');

  const eventsDa = parseEventCards(da);
  const eventsEn = parseEventCards(en);
  const historyDa = parseHistoryCards(da);
  const historyEn = parseHistoryCards(en);

  const ids = [...new Set([...Object.keys(historyDa), ...Object.keys(eventsDa)].map(Number))].sort(
    (a, b) => a - b
  );

  // Anchor placeholder dates on the earliest upcoming meeting.
  const upcomingIds = Object.keys(eventsDa).map(Number).sort((a, b) => a - b);
  const anchorId = upcomingIds[0];
  const anchorDate = eventsDa[anchorId].meetingDate; // YYYY-MM-DD
  const [anchorYear, anchorMonth] = anchorDate.split('-').map(Number);

  const meetings = [];
  for (const id of ids) {
    const ev = eventsDa[id];
    const evEn = eventsEn[id];
    const hd = historyDa[id];
    const he = historyEn[id];
    const isUpcoming = Boolean(ev);

    const game = {
      id,
      steamAppId: (ev && ev.steamAppId) || (hd && hd.steamAppId) || null,
      title: (ev && ev.title) || (hd && hd.title) || '',
      image: (ev && ev.image) || (hd && hd.image) || null,
      storeUrl: (ev && ev.storeUrl) || (hd && hd.storeUrl) || null,
      gogUrl: (ev && ev.gogUrl) || (hd && hd.gogUrl) || null,
      gogId: null,
      genres: ((ev && ev.genres.length ? ev.genres : hd && hd.genres) || []).join(', '),
      platforms: ((ev && ev.platforms) || []).join(', '),
      price: null,
      playtimeHours: ev ? ev.playtimeHours : null,
      hltbUrl: ev ? ev.hltbUrl : null,
      // games.description_* stays null: localized copy lives in meeting_copy.
      descriptionDa: null,
      descriptionEn: null,
    };

    let startsAtUtc;
    let endsAtUtc;
    let meetingDate;
    if (isUpcoming) {
      startsAtUtc = ev.startsAtUtc;
      endsAtUtc = ev.endsAtUtc;
      meetingDate = ev.meetingDate;
    } else {
      meetingDate = firstMonday(anchorYear, anchorMonth - 1, anchorId - id);
      const range = meetingUtcRange(meetingDate, DEFAULT_START, DEFAULT_END, TIMEZONE);
      startsAtUtc = range.startsAtUtc;
      endsAtUtc = range.endsAtUtc;
    }

    meetings.push({
      game,
      meeting: {
        id,
        meetingDate,
        startsAtUtc,
        endsAtUtc,
        status: isUpcoming ? 'revealed' : 'completed',
      },
      copy: {
        da: {
          eventDescription: ev ? ev.eventDescription : '',
          historyDescription: hd ? hd.historyDescription : '',
        },
        en: {
          eventDescription: evEn ? evEn.eventDescription : '',
          historyDescription: he ? he.historyDescription : '',
        },
      },
    });
  }

  const lines = [];
  lines.push('-- Backfill of hardcoded homepage meetings into D1.');
  lines.push('-- Generated by scripts/build-backfill-sql.mjs. Do not edit by hand;');
  lines.push('-- re-run the generator instead. Safe to re-run (INSERT OR REPLACE).');
  lines.push('-- Past meeting dates are APPROXIMATE (first Monday of the month,');
  lines.push('-- counted back from the first upcoming meeting); correct via admin if needed.');
  lines.push('');
  lines.push('BEGIN TRANSACTION;');
  lines.push('');
  for (const { game, meeting, copy } of meetings) {
    lines.push(`-- Meeting ${meeting.id}: ${game.title}`);
    lines.push(
      'INSERT OR REPLACE INTO games (id, steam_appid, title, header_image, store_url, gog_url, gog_id, genres, platforms, price, playtime_hours, hltb_url, description_da, description_en) VALUES (' +
        [
          game.id,
          sql(game.steamAppId),
          sql(game.title),
          sql(game.image),
          sql(game.storeUrl),
          sql(game.gogUrl),
          sql(game.gogId),
          sql(game.genres),
          sql(game.platforms),
          sql(game.price),
          num(game.playtimeHours),
          sql(game.hltbUrl),
          sql(game.descriptionDa),
          sql(game.descriptionEn),
        ].join(', ') +
        ');'
    );
    lines.push(
      'INSERT OR REPLACE INTO meetings (id, meeting_date, starts_at_utc, ends_at_utc, timezone, venue_name, venue_address, discord_invite, status, selected_game_id) VALUES (' +
        [
          meeting.id,
          sql(meeting.meetingDate),
          sql(meeting.startsAtUtc),
          sql(meeting.endsAtUtc),
          sql(TIMEZONE),
          sql(VENUE_NAME),
          sql(VENUE_ADDRESS),
          sql(DISCORD_INVITE),
          sql(meeting.status),
          meeting.id,
        ].join(', ') +
        ');'
    );
    for (const lang of ['da', 'en']) {
      lines.push(
        'INSERT OR REPLACE INTO meeting_copy (meeting_id, lang, event_description, history_description) VALUES (' +
          [meeting.id, sql(lang), sql(copy[lang].eventDescription), sql(copy[lang].historyDescription)].join(', ') +
          ');'
      );
    }
    lines.push('');
  }
  lines.push('COMMIT;');
  lines.push('');

  const outPath = path.join(ROOT, 'backfill-meetings.sql');
  await writeFile(outPath, lines.join('\n'));
  console.log(`Wrote ${meetings.length} meetings to ${path.relative(ROOT, outPath)}`);
}

main();
