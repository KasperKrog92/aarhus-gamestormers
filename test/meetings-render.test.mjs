import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEventCard,
  buildHistoryCard,
  buildEventCards,
  buildHistoryCards,
  escapeHtml,
} from '../js/meetings.js';

function meeting(overrides = {}) {
  return {
    id: 17,
    meetingDate: '2026-07-06',
    startsAtUtc: '2026-07-06T16:30:00Z',
    endsAtUtc: '2026-07-06T19:00:00Z',
    timezone: 'Europe/Copenhagen',
    venue: { name: 'Folkehuset Møllestien', address: 'Grønnegade 10, 8000 Aarhus C' },
    discordInvite: 'https://discord.gg/N2h6DJxVDF',
    status: 'revealed',
    game: {
      id: 5,
      steamAppId: '1569580',
      title: 'Blue Prince',
      image: 'https://cdn.akamai.steamstatic.com/steam/apps/1569580/header.jpg',
      storeUrl: 'https://store.steampowered.com/app/1569580/Blue_Prince/',
      gogUrl: 'https://www.gog.com/game/blue_prince',
      gogId: 'blue_prince',
      genres: ['Puzzle', 'Roguelite'],
      platforms: ['Windows', 'macOS'],
      price: '29,99 EUR',
      playtimeHours: 18,
      hltbUrl: 'https://howlongtobeat.com/game/136426',
      descriptionDa: 'Dansk spilbeskrivelse.',
      descriptionEn: 'English game description.',
    },
    copy: {
      da: { eventDescription: 'Dansk eventtekst.\n\nAndet afsnit.', historyDescription: 'Dansk historik.' },
      en: { eventDescription: 'English event copy.', historyDescription: 'English history copy.' },
    },
    calendar: { uid: 'gamestormers-17@gamestormers.dk', filename: 'gamestormers-17.ics' },
    ...overrides,
  };
}

test('escapeHtml neutralizes markup-significant characters', () => {
  assert.equal(escapeHtml('a & b < c > "d" \'e\''), 'a &amp; b &lt; c &gt; &quot;d&quot; &#39;e&#39;');
});

test('buildEventCard emits the event-card class contract and data attributes', () => {
  const html = buildEventCard(meeting(), 'da');

  assert.match(html, /class="event-card"/);
  assert.match(html, /class="event-cover"/);
  assert.match(html, /class="event-num">17\. møde</);
  assert.match(html, /class="event-store-links"/);
  assert.match(html, /class="event-title">Blue Prince</);
  assert.match(html, /class="event-playtime"[^>]*howlongtobeat\.com\/game\/136426/);
  assert.match(html, /⏱ ~18 t\./);
  // sale-badge selectors depend on these exact hooks
  assert.match(html, /href="https:\/\/store\.steampowered\.com\/app\/1569580\/Blue_Prince\/"/);
  assert.match(html, /data-gog-id="blue_prince"/);
  // platform icons reuse the existing SVG symbols
  assert.match(html, /<use href="#gs-icon-windows"\/>/);
  assert.match(html, /<use href="#gs-icon-apple"\/>/);
  // calendar contract
  assert.match(html, /class="cal-option cal-ics"/);
  assert.match(html, /data-start="20260706T163000Z"/);
  assert.match(html, /data-end="20260706T190000Z"/);
  assert.match(html, /data-uid="gamestormers-17@gamestormers\.dk"/);
  assert.match(html, /data-filename="gamestormers-17\.ics"/);
  assert.match(html, /calendar\.google\.com/);
  assert.match(html, /outlook\.live\.com/);
  // date and time rendered from DB dates (Copenhagen summer = +02:00 -> 18:30-21:00)
  assert.match(html, /event-detail-value">6\. juli</);
  assert.match(html, /event-detail-time">18:30-~21:00</);
  // localized event copy split into paragraphs
  assert.match(html, /<p>Dansk eventtekst\.<\/p><p>Andet afsnit\.<\/p>/);
});

test('buildEventCard localizes meeting number, labels, and copy in English', () => {
  const html = buildEventCard(meeting(), 'en');

  assert.match(html, /class="event-num">Meeting 17</);
  assert.match(html, /event-detail-label">Date</);
  assert.match(html, /event-detail-label">Venue</);
  assert.match(html, /⏱ ~18 hrs\./);
  assert.match(html, /event-detail-value">6 July</);
  assert.match(html, /<p>English event copy\.<\/p>/);
  assert.match(html, /id="cal-menu-gs17-en"/);
  assert.match(html, /Game club meeting #17/);
});

test('buildHistoryCard emits the history-card class contract', () => {
  const html = buildHistoryCard(meeting({ id: 3 }), 'da');

  assert.match(html, /class="history-card"/);
  assert.match(html, /class="history-banner"/);
  assert.match(html, /class="history-num">03</);
  assert.match(html, /class="history-card-top history-toggle"/);
  assert.match(html, /class="history-name">Blue Prince</);
  assert.match(html, /class="history-expand"/);
  assert.match(html, /class="history-desc">Dansk historik\.</);
  assert.match(html, /class="history-link">Steam<\/a>/);
  assert.match(html, /class="history-link">GOG<\/a>/);
});

test('builders join multiple cards and skip meetings without a selected game', () => {
  const events = buildEventCards([meeting(), { id: 18, game: null }], 'da');
  assert.equal((events.match(/class="event-card"/g) || []).length, 1);

  const history = buildHistoryCards([meeting({ id: 1 }), meeting({ id: 2 })], 'da');
  assert.equal((history.match(/class="history-card"/g) || []).length, 2);
});

test('builders escape untrusted game content', () => {
  const evil = meeting({ game: { ...meeting().game, title: 'Quote " & <tag>' } });
  const html = buildEventCard(evil, 'da');
  assert.match(html, /class="event-title">Quote &quot; &amp; &lt;tag&gt;</);
  assert.doesNotMatch(html, /<tag>/);
});
