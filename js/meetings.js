// js/meetings.js - shared renderers for the database-backed homepage.
//
// The builder functions are pure: they take a public meeting object (the shape
// returned by GET /api/meetings/public) plus a language and return HTML strings.
// They are unit-tested in node. The browser bootstrap at the bottom is guarded
// so importing this module in node does not touch the DOM.
//
// Markup intentionally mirrors the static event/history cards so existing CSS,
// calendar, countdown, history accordion, platform icon, and sale-badge logic
// keep working without changes.

const DA_MONTHS = [
  'januar', 'februar', 'marts', 'april', 'maj', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'december',
];
const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PLATFORM_ICONS = {
  windows: 'gs-icon-windows',
  win: 'gs-icon-windows',
  mac: 'gs-icon-apple',
  macos: 'gs-icon-apple',
  osx: 'gs-icon-apple',
  apple: 'gs-icon-apple',
  linux: 'gs-icon-linux',
};

const STRINGS = {
  da: {
    meetingNum: (n) => n + '. møde',
    dateLabel: 'Dato',
    timeLabel: 'Tid',
    venueLabel: 'Sted',
    available: 'Tilgængelig på',
    and: ' og ',
    coverAlt: (title) => title + ' cover',
    playtime: (hours) => '⏱ ~' + hours + ' t.',
    hltbAria: (title) => 'Se spilletid for ' + title + ' på HowLongToBeat',
    eventDetails: 'Eventdetaljer',
    addToCalendar: 'Tilføj til kalender',
    googleCalendar: 'Google Kalender',
    outlook: 'Outlook',
    calTitle: (n, title) => 'Gamestormers #' + n + ' – ' + title,
    calBody: (n, title, discord) =>
      'Spilklubmøde #' + n + ' hos Aarhus Gamestormers. Månedens spil er ' + title +
      ' – spil det hjemme og mød op til diskussion. Tilmeld dig via Discord: ' + discord,
  },
  en: {
    meetingNum: (n) => 'Meeting ' + n,
    dateLabel: 'Date',
    timeLabel: 'Time',
    venueLabel: 'Venue',
    available: 'Available on',
    and: ' and ',
    coverAlt: (title) => title + ' cover',
    playtime: (hours) => '⏱ ~' + hours + ' hrs.',
    hltbAria: (title) => 'View playtime for ' + title + ' on HowLongToBeat',
    eventDetails: 'Event details',
    addToCalendar: 'Add to calendar',
    googleCalendar: 'Google Calendar',
    outlook: 'Outlook',
    calTitle: (n, title) => 'Gamestormers #' + n + ' – ' + title,
    calBody: (n, title, discord) =>
      'Game club meeting #' + n + ' at Aarhus Gamestormers. This month\'s game is ' + title +
      ' – play it at home and come join the discussion. Sign up via Discord: ' + discord,
  },
};

function strings(lang) {
  return lang === 'en' ? STRINGS.en : STRINGS.da;
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// application/x-www-form-urlencoded style (spaces as +), matching the static links.
function encodeParam(value) {
  return encodeURIComponent(String(value == null ? '' : value)).replace(/%20/g, '+');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// "2026-07-06T16:30:00Z" -> "20260706T163000Z"
function toCompactUtc(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function zoneParts(iso, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const part of fmt.formatToParts(new Date(iso))) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return parts;
}

// Local "HH:MM" for the given instant in the meeting timezone.
function timeInZone(iso, timeZone) {
  const p = zoneParts(iso, timeZone);
  return p.hour + ':' + p.minute;
}

// "+02:00" style offset for the given instant in the meeting timezone.
function offsetInZone(iso, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' });
  const part = fmt.formatToParts(new Date(iso)).find((p) => p.type === 'timeZoneName');
  const match = part && part.value.match(/GMT([+-]\d{2}:?\d{2})?/);
  if (!match || !match[1]) return '+00:00';
  let offset = match[1];
  if (offset.indexOf(':') === -1) offset = offset.slice(0, 3) + ':' + offset.slice(3);
  return offset;
}

// "2026-07-06T18:30:00+02:00" for the Outlook deep link.
function localIso(iso, timeZone) {
  const p = zoneParts(iso, timeZone);
  return (
    p.year + '-' + p.month + '-' + p.day + 'T' +
    p.hour + ':' + p.minute + ':' + p.second +
    offsetInZone(iso, timeZone)
  );
}

function dateDisplay(meetingDate, lang) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(meetingDate || ''));
  if (!match) return escapeHtml(meetingDate);
  const day = Number(match[3]);
  const monthIndex = Number(match[2]) - 1;
  if (lang === 'en') return day + ' ' + EN_MONTHS[monthIndex];
  return day + '. ' + DA_MONTHS[monthIndex];
}

function discordShort(invite) {
  return String(invite || '').replace(/^https?:\/\//, '');
}

function joinList(items, conjunction) {
  const list = (items || []).filter(Boolean);
  if (list.length <= 1) return list.join('');
  return list.slice(0, -1).join(', ') + conjunction + list[list.length - 1];
}

// The club always meets at the same venue, so the map link is a fixed short URL.
const VENUE_MAP_URL = 'https://maps.app.goo.gl/8fqwBqEZA7x3TUgR6';

function platformIcons(platforms, lang) {
  const list = (platforms || []).filter(Boolean);
  if (!list.length) return '';
  const t = strings(lang);
  const icons = list
    .map((platform) => {
      const key = String(platform).toLowerCase().replace(/[^a-z]/g, '');
      let id = PLATFORM_ICONS[key];
      if (!id && key.indexOf('mac') === 0) id = 'gs-icon-apple';
      if (!id && key.indexOf('win') === 0) id = 'gs-icon-windows';
      return id ? '<svg class="platform-icon" aria-hidden="true"><use href="#' + id + '"/></svg>' : '';
    })
    .filter(Boolean)
    .join('\n                  ');
  const aria = t.available + ' ' + joinList(list, t.and);
  return (
    '<span class="platform-icons" role="img" aria-label="' + escapeHtml(aria) + '">' +
    icons +
    '</span>'
  );
}

function storeLinks(game) {
  let links = '';
  if (game.storeUrl) {
    links +=
      '<a href="' + escapeHtml(game.storeUrl) + '" target="_blank" rel="noopener noreferrer">Steam</a>';
  }
  if (game.gogUrl) {
    links +=
      '<a href="' + escapeHtml(game.gogUrl) + '"' +
      (game.gogId ? ' data-gog-id="' + escapeHtml(game.gogId) + '"' : '') +
      ' target="_blank" rel="noopener noreferrer">GOG</a>';
  }
  return links;
}

function genreSpans(genres) {
  return (genres || [])
    .filter(Boolean)
    .map((genre) => '<span class="history-genre">' + escapeHtml(genre) + '</span>')
    .join('');
}

function playtimeLink(game, lang) {
  if (game.playtimeHours == null || !game.hltbUrl) return '';
  const t = strings(lang);
  return (
    '<a class="event-playtime" href="' + escapeHtml(game.hltbUrl) +
    '" target="_blank" rel="noopener noreferrer" aria-label="' +
    escapeHtml(t.hltbAria(game.title)) + '">' +
    escapeHtml(t.playtime(game.playtimeHours)) + '</a>'
  );
}

function paragraphs(text) {
  if (!text) return '';
  return String(text)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => '<p>' + escapeHtml(part) + '</p>')
    .join('');
}

function meetingCopy(meeting, lang) {
  const copy = (meeting.copy && meeting.copy[lang]) || {};
  return copy;
}

const CAL_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
const CAL_CHEVRON =
  '<svg class="cal-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

function calendarBlock(meeting, lang) {
  const t = strings(lang);
  const tz = meeting.timezone || 'Europe/Copenhagen';
  const n = meeting.id;
  const title = meeting.game.title;
  const startCompact = toCompactUtc(meeting.startsAtUtc);
  const endCompact = toCompactUtc(meeting.endsAtUtc);
  const calTitle = t.calTitle(n, title);
  const calBody = t.calBody(n, title, discordShort(meeting.discordInvite));
  const location = (meeting.venue && meeting.venue.name ? meeting.venue.name : '') + ', Aarhus';
  const calId = 'cal-menu-gs' + n + (lang === 'en' ? '-en' : '');

  const googleUrl =
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    '&text=' + encodeParam(calTitle) +
    '&dates=' + startCompact + '%2F' + endCompact +
    '&details=' + encodeParam(calBody) +
    '&location=' + encodeParam(location);

  const outlookUrl =
    'https://outlook.live.com/calendar/0/deeplink/compose?subject=' + encodeParam(calTitle) +
    '&startdt=' + encodeParam(localIso(meeting.startsAtUtc, tz)) +
    '&enddt=' + encodeParam(localIso(meeting.endsAtUtc, tz)) +
    '&location=' + encodeParam(location) +
    '&body=' + encodeParam(calBody);

  return (
    '<div class="cal-wrap">' +
    '<button class="cal-btn" type="button" aria-expanded="false" aria-controls="' + calId + '">' +
    CAL_ICON + t.addToCalendar + CAL_CHEVRON +
    '</button>' +
    '<ul class="cal-dropdown" id="' + calId + '">' +
    '<li><a class="cal-option" href="' + escapeHtml(googleUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(t.googleCalendar) + '</a></li>' +
    '<li><a class="cal-option cal-ics" href="#"' +
    ' data-uid="' + escapeHtml(meeting.calendar.uid) + '"' +
    ' data-start="' + startCompact + '"' +
    ' data-end="' + endCompact + '"' +
    ' data-title="' + escapeHtml(calTitle) + '"' +
    ' data-location="' + escapeHtml(location) + '"' +
    ' data-description="' + escapeHtml(calBody) + '"' +
    ' data-filename="' + escapeHtml(meeting.calendar.filename) + '">Apple / ICS</a></li>' +
    '<li><a class="cal-option" href="' + escapeHtml(outlookUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(t.outlook) + '</a></li>' +
    '</ul>' +
    '</div>'
  );
}

export function buildEventCard(meeting, lang) {
  if (!meeting || !meeting.game) return '';
  const t = strings(lang);
  const game = meeting.game;
  const copy = meetingCopy(meeting, lang);
  const description = copy.eventDescription || (lang === 'en' ? game.descriptionEn : game.descriptionDa);
  const timeRange =
    timeInZone(meeting.startsAtUtc, meeting.timezone || 'Europe/Copenhagen') +
    '-~' +
    timeInZone(meeting.endsAtUtc, meeting.timezone || 'Europe/Copenhagen');

  return (
    '<div class="event-card">' +
    '<img src="' + escapeHtml(game.image) + '" alt="' + escapeHtml(t.coverAlt(game.title)) + '" class="event-cover" width="460" height="215" decoding="async">' +
    '<div class="event-body">' +
    '<div class="event-meta">' +
    '<div class="event-badge"><span class="event-num">' + escapeHtml(t.meetingNum(meeting.id)) + '</span></div>' +
    '<div class="event-store-links">' + platformIcons(game.platforms, lang) + storeLinks(game) + '</div>' +
    '</div>' +
    '<h3 class="event-title">' + escapeHtml(game.title) + '</h3>' +
    '<div class="history-genre-row">' + genreSpans(game.genres) + playtimeLink(game, lang) + '</div>' +
    '<div class="event-details" aria-label="' + escapeHtml(t.eventDetails) + '">' +
    '<div class="event-detail"><span class="event-detail-label">' + escapeHtml(t.dateLabel) + '</span>' +
    '<span class="event-detail-value">' + dateDisplay(meeting.meetingDate, lang) + '</span></div>' +
    '<div class="event-detail"><span class="event-detail-label">' + escapeHtml(t.timeLabel) + '</span>' +
    '<span class="event-detail-value event-detail-time">' + escapeHtml(timeRange) + '</span></div>' +
    '<div class="event-detail event-detail-wide"><span class="event-detail-label">' + escapeHtml(t.venueLabel) + '</span>' +
    '<a class="event-detail-value event-venue-link" href="' + VENUE_MAP_URL + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(meeting.venue && meeting.venue.name) + '</a></div>' +
    '</div>' +
    '<div class="event-desc">' + paragraphs(description) + '</div>' +
    calendarBlock(meeting, lang) +
    '</div>' +
    '</div>'
  );
}

export function buildHistoryCard(meeting, lang) {
  if (!meeting || !meeting.game) return '';
  const game = meeting.game;
  const copy = meetingCopy(meeting, lang);
  const description =
    copy.historyDescription ||
    copy.eventDescription ||
    (lang === 'en' ? game.descriptionEn : game.descriptionDa);
  const num = String(meeting.id).padStart(2, '0');
  const links =
    (game.storeUrl
      ? '<a href="' + escapeHtml(game.storeUrl) + '" target="_blank" rel="noopener" class="history-link">Steam</a>'
      : '') +
    (game.gogUrl
      ? '<a href="' + escapeHtml(game.gogUrl) + '" target="_blank" rel="noopener" class="history-link">GOG</a>'
      : '');

  return (
    '<div class="history-card">' +
    '<div class="history-card-banner">' +
    '<img src="' + escapeHtml(game.image) + '" alt="' + escapeHtml(game.title) + '" class="history-banner" width="460" height="215" loading="lazy" decoding="async">' +
    '<span class="history-num">' + escapeHtml(num) + '</span>' +
    '</div>' +
    '<button class="history-card-top history-toggle" type="button" aria-expanded="false">' +
    '<span class="history-name">' + escapeHtml(game.title) + '</span>' +
    '<span class="history-chevron">▼</span>' +
    '</button>' +
    '<div class="history-expand"><div class="history-expand-inner">' +
    '<div class="history-genre-row">' + genreSpans(game.genres) + '</div>' +
    (description ? '<p class="history-desc">' + escapeHtml(description) + '</p>' : '') +
    '<div class="history-links">' + links + '</div>' +
    '</div></div>' +
    '</div>'
  );
}

// ── JSON-LD (schema.org Event) ──────────────────────────────────────────────
// First-pass SEO: built from the same public meeting data and injected client
// side once meetings load. The static <script type="application/ld+json"> stays
// as the no-JS source until the D1 backfill lands (see plan Task 10).

const JSONLD_BASE = 'https://www.gamestormers.dk';
const ORG_ID = JSONLD_BASE + '/#organization';

// Split "Grønnegade 10, 8000 Aarhus C" into schema.org PostalAddress fields.
// Falls back to the whole string as streetAddress when it does not match.
function parseAddress(address) {
  const value = String(address || '').trim();
  if (!value) return null;
  const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
  const street = parts[0] || value;
  const rest = parts.slice(1).join(', ');
  const match = /^(\S+)\s+(.+)$/.exec(rest);
  const postal = { '@type': 'PostalAddress', streetAddress: street };
  if (match) {
    postal.postalCode = match[1];
    postal.addressLocality = match[2];
  } else if (rest) {
    postal.addressLocality = rest;
  }
  postal.addressCountry = 'DK';
  return postal;
}

export function buildEventJsonLd(meeting, lang) {
  if (!meeting || !meeting.game) return null;
  const game = meeting.game;
  const tz = meeting.timezone || 'Europe/Copenhagen';
  const copy = meetingCopy(meeting, lang);
  const description =
    copy.eventDescription || (lang === 'en' ? game.descriptionEn : game.descriptionDa) || '';
  const eventsUrl = JSONLD_BASE + (lang === 'en' ? '/en/#events' : '/#events');
  const node = {
    '@type': 'Event',
    '@id': JSONLD_BASE + '/#event-' + meeting.id + '-' + meeting.meetingDate,
    name: 'Aarhus Gamestormers: ' + game.title,
    description: description,
    startDate: localIso(meeting.startsAtUtc, tz),
    endDate: localIso(meeting.endsAtUtc, tz),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    image: game.image || undefined,
    url: eventsUrl,
    location: {
      '@type': 'Place',
      name: (meeting.venue && meeting.venue.name) || '',
    },
    organizer: { '@id': ORG_ID },
  };
  const address = parseAddress(meeting.venue && meeting.venue.address);
  if (address) node.location.address = address;
  return node;
}

export function buildEventsJsonLd(meetings, lang) {
  return (meetings || [])
    .map((meeting) => buildEventJsonLd(meeting, lang))
    .filter(Boolean);
}

// Rewrites the page's JSON-LD @graph: keep every non-Event node (the
// Organization) and replace the Event nodes with ones generated from D1.
export function mergeEventsIntoGraph(graph, events) {
  const kept = (Array.isArray(graph) ? graph : []).filter(
    (node) => !node || node['@type'] !== 'Event'
  );
  return kept.concat(events);
}

export function buildEventCards(meetings, lang) {
  return (meetings || []).map((meeting) => buildEventCard(meeting, lang)).join('');
}

export function buildHistoryCards(meetings, lang) {
  return (meetings || []).map((meeting) => buildHistoryCard(meeting, lang)).join('');
}

function pageLang() {
  return document.documentElement.lang === 'en' ? 'en' : 'da';
}

// Replace the Event nodes in the page's JSON-LD with ones built from D1, leaving
// the Organization node untouched. No-op when the page has no JSON-LD block.
function injectEventsJsonLd(upcoming, lang) {
  const script = document.querySelector('script[type="application/ld+json"]');
  if (!script) return;
  let parsed;
  try {
    parsed = JSON.parse(script.textContent);
  } catch (err) {
    return;
  }
  if (!parsed || !Array.isArray(parsed['@graph'])) return;
  const events = buildEventsJsonLd(upcoming, lang);
  parsed['@graph'] = mergeEventsIntoGraph(parsed['@graph'], events);
  script.textContent = JSON.stringify(parsed, null, 2);
}

function renderMeetings(data) {
  const meetings = data && data.meetings;
  if (!meetings) return false;
  const lang = pageLang();
  let rendered = false;
  const hasSelectedMeetings =
    (Array.isArray(meetings.upcoming) && meetings.upcoming.length > 0) ||
    (Array.isArray(meetings.history) && meetings.history.length > 0);

  // Keep the static fallback only while D1 has no selected meeting content.
  // Once D1 is the active source, an empty upcoming/history group should clear
  // stale fallback cards instead of leaving old events visible.
  if (!hasSelectedMeetings) return false;

  const eventsGrid = document.querySelector('.events-grid');
  if (eventsGrid && Array.isArray(meetings.upcoming)) {
    eventsGrid.innerHTML = buildEventCards(meetings.upcoming, lang);
    injectEventsJsonLd(meetings.upcoming, lang);
    rendered = true;
  }

  const historyGrid = document.querySelector('.history-grid');
  if (historyGrid && Array.isArray(meetings.history)) {
    historyGrid.innerHTML = buildHistoryCards(meetings.history, lang);
    const sub = document.querySelector('.history-sub[data-count-template]');
    if (sub) sub.textContent = sub.dataset.countTemplate.replace(/\{n\}/g, meetings.history.length);
    rendered = true;
  }

  return rendered;
}

function initMeetings() {
  if (!window.fetch) return;
  if (!document.querySelector('.events-grid') && !document.querySelector('.history-grid')) return;

  fetch('/api/meetings/public', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error('No meeting data');
      return response.json();
    })
    .then((data) => {
      const rendered = renderMeetings(data);
      if (rendered && window.GS && typeof window.GS.refresh === 'function') {
        window.GS.refresh();
      }
    })
    .catch(() => {
      // Leave the static fallback markup in place.
    });
}

if (typeof document !== 'undefined') {
  initMeetings();
}
