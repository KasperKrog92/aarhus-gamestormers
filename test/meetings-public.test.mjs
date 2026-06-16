import assert from 'node:assert/strict';
import test from 'node:test';

import { getPublicMeetings, toPublicMeeting } from '../functions/_lib/db.js';

function meetingRow(overrides = {}) {
  return {
    id: 22,
    meeting_date: '2026-09-15',
    starts_at_utc: '2026-09-15T16:30:00Z',
    ends_at_utc: '2026-09-15T19:00:00Z',
    timezone: 'Europe/Copenhagen',
    venue_name: 'Aarhus Board Game Cafe',
    venue_address: 'Fredensgade 38, 8000 Aarhus C',
    discord_invite: 'https://discord.gg/example',
    status: 'revealed',
    selected_suggestion_id: 101,
    game_id: 7,
    steam_appid: '12345',
    game_title: 'Puzzle Storm',
    header_image: 'https://cdn.example/header.jpg',
    store_url: 'https://store.steampowered.com/app/12345/Puzzle_Storm/',
    gog_url: 'https://www.gog.com/en/game/puzzle_storm',
    gog_id: 'puzzle_storm',
    genres: 'Puzzle, Adventure',
    platforms: 'Windows, macOS',
    price: '9,99 EUR',
    playtime_hours: 8,
    hltb_url: 'https://howlongtobeat.com/game/example',
    description_da: 'Dansk beskrivelse.',
    description_en: 'English description.',
    event_description_da: 'Dansk eventtekst.',
    history_description_da: 'Dansk historiktekst.',
    event_description_en: 'English event copy.',
    history_description_en: 'English history copy.',
    ...overrides,
  };
}

function fakeD1(rows) {
  return {
    prepare(sql) {
      return {
        bind() {
          return this;
        },
        async run() {
          return { success: true, meta: {} };
        },
        async all() {
          if (!sql.includes('FROM meetings')) return { results: [] };
          return { results: rows };
        },
      };
    },
  };
}

test('toPublicMeeting shapes selected game data without leaking suggestion internals', () => {
  const meeting = toPublicMeeting(meetingRow());

  assert.equal(meeting.id, 22);
  assert.equal(meeting.game.title, 'Puzzle Storm');
  assert.deepEqual(meeting.game.genres, ['Puzzle', 'Adventure']);
  assert.deepEqual(meeting.game.platforms, ['Windows', 'macOS']);
  assert.equal(meeting.game.gogId, 'puzzle_storm');
  assert.equal(meeting.copy.da.eventDescription, 'Dansk eventtekst.');
  assert.equal(meeting.calendar.uid, 'gamestormers-22@gamestormers.dk');
  assert.equal(Object.hasOwn(meeting, 'selectedSuggestionId'), false);
  assert.equal(Object.hasOwn(meeting, 'stormCode'), false);
});

test('getPublicMeetings groups upcoming, history, and planned meetings', async () => {
  const rows = [
    meetingRow({
      id: 20,
      meeting_date: '2026-04-21',
      starts_at_utc: '2026-04-21T16:30:00Z',
      ends_at_utc: '2026-04-21T19:00:00Z',
      game_title: 'Past Game',
    }),
    meetingRow({
      id: 21,
      meeting_date: '2026-08-18',
      starts_at_utc: '2026-08-18T16:30:00Z',
      ends_at_utc: '2026-08-18T19:00:00Z',
      game_title: 'Upcoming Game',
    }),
    meetingRow({
      id: 22,
      meeting_date: '2026-09-15',
      starts_at_utc: '2026-09-15T16:30:00Z',
      ends_at_utc: '2026-09-15T19:00:00Z',
      status: 'planned',
      selected_suggestion_id: null,
      game_id: null,
      game_title: null,
    }),
  ];

  const publicMeetings = await getPublicMeetings(fakeD1(rows), new Date('2026-06-16T12:00:00Z'));

  assert.deepEqual(publicMeetings.history.map((m) => m.id), [20]);
  assert.deepEqual(publicMeetings.upcoming.map((m) => m.id), [21]);
  assert.deepEqual(publicMeetings.planned.map((m) => m.id), [22]);
  assert.equal(publicMeetings.planned[0].game, undefined);
  assert.equal(Object.hasOwn(publicMeetings.planned[0], 'selectedSuggestionId'), false);
});
