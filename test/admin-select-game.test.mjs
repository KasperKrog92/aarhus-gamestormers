import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/api/admin/[[route]].js';

// Minimal D1 fake. Reads come from the fixed `state`; writes are recorded so
// tests can assert what the handler tried to persist. INSERT INTO games without
// an ON CONFLICT clause is a brand-new row and reports a last_row_id.
function makeDb(state) {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async run() {
          statements.push({ sql, args: this.args });
          if (sql.includes('INSERT INTO games') && !sql.includes('ON CONFLICT')) {
            return { success: true, meta: { last_row_id: 7 } };
          }
          if (sql.includes('INSERT INTO automation_events')) {
            return { success: true, meta: { last_row_id: 99 } };
          }
          return { success: true, meta: {} };
        },
        async first() {
          if (sql.includes('FROM rounds WHERE id')) return state.round || null;
          if (sql.includes('FROM meetings WHERE id')) return state.meeting || null;
          if (sql.includes('FROM suggestions WHERE id')) return state.suggestion || null;
          if (sql.includes('FROM games WHERE id')) return state.game || null;
          return null;
        },
        async all() {
          if (sql.startsWith('PRAGMA table_info(rounds)')) {
            return {
              results: [
                { name: 'meeting_date' },
                { name: 'suggestions_open_months_before' },
                { name: 'voting_opens_months_before' },
                { name: 'voting_closes_months_before' },
                { name: 'suggestions_open_at' },
                { name: 'voting_opens_at' },
              ],
            };
          }
          if (sql.includes('FROM meeting_copy')) return { results: state.copy || [] };
          if (sql.includes('FROM automation_events')) return { results: state.automationEvents || [] };
          return { results: [] };
        },
      };
    },
    async batch(stmts) {
      const results = [];
      for (const stmt of stmts) results.push(await stmt.run());
      return results;
    },
  };
}

function adminRequest(url, method, body) {
  return new Request(url, {
    method,
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('selecting a suggestion promotes it, attaches the game, confirms the winner, and reveals the round', async () => {
  const db = makeDb({
    round: { id: 19, phase: 'voting', winner_suggestion_id: null },
    meeting: { id: 19, selected_game_id: null, status: 'voting', venue_name: 'Folkehuset' },
    suggestion: {
      id: 5,
      round_id: 19,
      steam_appid: '400',
      title: 'Portal',
      header_image: 'https://img/portal.jpg',
      store_url: 'https://store.steampowered.com/app/400',
      genres: 'Puzzle',
      platforms: 'Windows, macOS',
      playtime_hours: 4,
      hltb_url: 'https://howlongtobeat.com/game/723',
      description_da: 'da',
      description_en: 'en',
    },
  });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/round/19/select', 'POST', { suggestionId: 5 }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['round', '19', 'select'] },
  });

  assert.equal(response.status, 200);
  const out = await response.json();
  assert.equal(out.ok, true);
  assert.equal(out.gameId, 7);

  const gameInsert = db.statements.find((s) => s.sql.includes('INSERT INTO games') && !s.sql.includes('ON CONFLICT'));
  assert.ok(gameInsert, 'creates a new game row');
  assert.equal(gameInsert.args[1], 'Portal'); // title is the second bound column (steam_appid, title, ...)
  assert.equal(gameInsert.args[10], 'https://howlongtobeat.com/game/723');

  const attach = db.statements.find((s) => s.sql.includes('UPDATE meetings') && s.sql.includes('selected_game_id'));
  assert.ok(attach, 'attaches the game to the meeting');
  assert.deepEqual(attach.args, [7, 5, 19]);

  const roundUpdate = db.statements.find((s) => s.sql.includes('UPDATE rounds SET'));
  assert.ok(roundUpdate, 'confirms the winner and reveals');
  assert.deepEqual(roundUpdate.args, [5, 'revealed', 19]);

  const statusUpdate = db.statements.find((s) => s.sql.includes('UPDATE meetings SET status'));
  assert.ok(statusUpdate, 'syncs the public meeting status');
  assert.deepEqual(statusUpdate.args, ['revealed', 19]);
});

test('selecting keeps an already-closed round closed', async () => {
  const db = makeDb({
    round: { id: 19, phase: 'closed', winner_suggestion_id: 5 },
    meeting: { id: 19, selected_game_id: 7, status: 'completed', venue_name: 'Folkehuset' },
    suggestion: { id: 5, round_id: 19, title: 'Portal' },
    game: { id: 7, title: 'Portal' },
  });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/round/19/select', 'POST', { suggestionId: 5 }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['round', '19', 'select'] },
  });

  assert.equal(response.status, 200);
  const roundUpdate = db.statements.find((s) => s.sql.includes('UPDATE rounds SET'));
  assert.deepEqual(roundUpdate.args, [5, 19], 'only winner is set, phase untouched');
  const statusUpdate = db.statements.find((s) => s.sql.includes('UPDATE meetings SET status'));
  assert.deepEqual(statusUpdate.args, ['completed', 19]);

  // Re-promotion reuses the existing game row instead of inserting a new one.
  const reuse = db.statements.find((s) => s.sql.includes('INSERT INTO games') && s.sql.includes('ON CONFLICT'));
  assert.ok(reuse, 'upserts the existing game by id');
  assert.equal(reuse.args[0], 7);
});

test('selecting rejects a suggestion from a different round', async () => {
  const db = makeDb({
    round: { id: 19, phase: 'voting' },
    meeting: { id: 19, selected_game_id: null, venue_name: 'Folkehuset' },
    suggestion: { id: 5, round_id: 18, title: 'Portal' },
  });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/round/19/select', 'POST', { suggestionId: 5 }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['round', '19', 'select'] },
  });

  assert.equal(response.status, 400);
});

test('selecting fails when the round has no public meeting record', async () => {
  const db = makeDb({
    round: { id: 19, phase: 'voting' },
    meeting: null,
    suggestion: { id: 5, round_id: 19, title: 'Portal' },
  });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/round/19/select', 'POST', { suggestionId: 5 }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['round', '19', 'select'] },
  });

  assert.equal(response.status, 409);
});

test('patching a meeting merges game edits and upserts localized copy', async () => {
  const db = makeDb({
    meeting: { id: 19, selected_game_id: 7, status: 'revealed', venue_name: 'Folkehuset' },
    game: {
      id: 7,
      steam_appid: '400',
      title: 'Portal',
      header_image: 'https://img/portal.jpg',
      store_url: 'https://store.steampowered.com/app/400',
      gog_url: null,
      gog_id: null,
      genres: 'Puzzle',
      platforms: 'Windows',
      price: null,
      playtime_hours: 4,
      hltb_url: null,
      description_da: 'da',
      description_en: 'en',
    },
    copy: [],
  });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/meeting/19', 'PATCH', {
      gogUrl: 'https://gog.com/game/portal',
      gogId: '123',
      hltbUrl: 'https://howlongtobeat.com/game/400',
      playtimeHours: '12',
      genres: 'Puzzle, Platformer',
      platforms: 'Windows, macOS',
      eventDescriptionDa: 'Dansk eventtekst',
      eventDescriptionEn: 'English event copy',
    }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['meeting', '19'] },
  });

  assert.equal(response.status, 200);
  const out = await response.json();
  assert.equal(out.ok, true);
  assert.ok(out.publishReadiness && typeof out.publishReadiness.ready === 'boolean');

  const gameUpsert = db.statements.find((s) => s.sql.includes('INSERT INTO games') && s.sql.includes('ON CONFLICT(id)'));
  assert.ok(gameUpsert, 'updates the existing game by id');
  // bind order: id, steam_appid, title, header_image, store_url, gog_url, gog_id,
  // genres, platforms, price, playtime_hours, hltb_url, description_da, description_en
  assert.equal(gameUpsert.args[0], 7);
  assert.equal(gameUpsert.args[2], 'Portal'); // title preserved
  assert.equal(gameUpsert.args[5], 'https://gog.com/game/portal');
  assert.equal(gameUpsert.args[6], '123');
  assert.equal(gameUpsert.args[7], 'Puzzle, Platformer');
  assert.equal(gameUpsert.args[8], 'Windows, macOS');
  assert.equal(gameUpsert.args[10], 12);
  assert.equal(gameUpsert.args[11], 'https://howlongtobeat.com/game/400');

  const copyDa = db.statements.find((s) => s.sql.includes('INSERT INTO meeting_copy') && s.args[1] === 'da');
  assert.ok(copyDa);
  assert.equal(copyDa.args[2], 'Dansk eventtekst');
  const copyEn = db.statements.find((s) => s.sql.includes('INSERT INTO meeting_copy') && s.args[1] === 'en');
  assert.ok(copyEn);
  assert.equal(copyEn.args[2], 'English event copy');
});

test('patching game fields fails when no game has been selected', async () => {
  const db = makeDb({
    meeting: { id: 19, selected_game_id: null, venue_name: 'Folkehuset' },
  });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/meeting/19', 'PATCH', { genres: 'Puzzle' }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['meeting', '19'] },
  });

  assert.equal(response.status, 409);
});

test('patching a suggestion can save HowLongToBeat metadata', async () => {
  const db = makeDb({
    suggestion: { id: 5, round_id: 19, title: 'Portal' },
  });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/suggestion/5', 'PATCH', {
      hltbUrl: 'https://howlongtobeat.com/game/723',
      playtimeHours: '4',
    }),
    env: { DB: db, ADMIN_TOKEN: 'test' },
    params: { route: ['suggestion', '5'] },
  });

  assert.equal(response.status, 200);
  const update = db.statements.find((s) => s.sql.includes('UPDATE suggestions SET'));
  assert.ok(update, 'updates the suggestion row');
  assert.match(update.sql, /hltb_url = \?/);
  assert.match(update.sql, /playtime_hours = \?/);
  assert.deepEqual(update.args, ['https://howlongtobeat.com/game/723', 4, 5]);
});

test('announcing the winner posts Discord and records the announcement event', async () => {
  const fetchCalls = [];
  const db = makeDb({
    round: { id: 19, phase: 'revealed', winner_suggestion_id: 5, meeting_date: '2026-09-15' },
    meeting: {
      id: 19,
      meeting_date: '2026-09-15',
      starts_at_utc: '2026-09-15T16:30:00Z',
      ends_at_utc: '2026-09-15T19:00:00Z',
      timezone: 'Europe/Copenhagen',
      venue_name: 'Folkehuset Møllestien',
      venue_address: 'Grønnegade 10, 8000 Aarhus C',
      discord_event_url: 'https://discord.com/events/111/222',
      selected_game_id: 7,
      status: 'revealed',
    },
    game: {
      id: 7,
      title: 'Portal',
      header_image: 'https://img/portal.jpg',
      store_url: 'https://store.steampowered.com/app/400',
      genres: 'Puzzle',
      platforms: 'Windows',
      playtime_hours: 4,
      hltb_url: 'https://howlongtobeat.com/game/723',
      description_da: 'da',
      description_en: 'en',
    },
    copy: [
      { lang: 'da', event_description: 'Dansk eventtekst', history_description: '' },
      { lang: 'en', event_description: 'English event copy', history_description: '' },
    ],
    automationEvents: [
      {
        id: 1,
        round_id: 19,
        event_type: 'voting_opened',
        payload_json: '{"messageId":"voting-message-1"}',
        created_at: '2026-07-01 09:00:00',
      },
    ],
  });

  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/round/19/announce-winner', 'POST', {}),
    env: {
      DB: db,
      ADMIN_TOKEN: 'test',
      VOTING_BASE_URL: 'https://www.gamestormers.dk',
      DISCORD_VOTING_WEBHOOK_URL: 'https://discord.example/webhook',
      fetch: async (url, init) => {
        fetchCalls.push({ url, init });
        return { ok: true, status: 204 };
      },
    },
    params: { route: ['round', '19', 'announce-winner'] },
  });

  assert.equal(response.status, 200);
  assert.equal(fetchCalls[0].url, 'https://discord.example/webhook');
  assert.match(JSON.parse(fetchCalls[0].init.body).content, /Portal/);
  assert.equal(fetchCalls[1].url, 'https://discord.example/webhook/messages/voting-message-1');
  assert.equal(fetchCalls[1].init.method, 'DELETE');

  const insert = db.statements.find((s) => s.sql.includes('INSERT INTO automation_events'));
  assert.deepEqual(insert.args, [19, 'winner_announcement_posted', '{"source":"admin","status":204}']);
});

test('announcing the winner also posts the results breakdown link to general chat', async () => {
  const fetchCalls = [];
  const makeAnnounceDb = (automationEvents) => makeDb({
    round: { id: 19, phase: 'revealed', winner_suggestion_id: 5, meeting_date: '2026-09-15' },
    meeting: {
      id: 19,
      meeting_date: '2026-09-15',
      starts_at_utc: '2026-09-15T16:30:00Z',
      ends_at_utc: '2026-09-15T19:00:00Z',
      timezone: 'Europe/Copenhagen',
      venue_name: 'Folkehuset Møllestien',
      venue_address: 'Grønnegade 10, 8000 Aarhus C',
      discord_event_url: 'https://discord.com/events/111/222',
      selected_game_id: 7,
      status: 'revealed',
    },
    game: {
      id: 7,
      title: 'Portal',
      header_image: 'https://img/portal.jpg',
      store_url: 'https://store.steampowered.com/app/400',
      genres: 'Puzzle',
      platforms: 'Windows',
      playtime_hours: 4,
      hltb_url: 'https://howlongtobeat.com/game/723',
      description_da: 'da',
      description_en: 'en',
    },
    copy: [
      { lang: 'da', event_description: 'Dansk eventtekst', history_description: '' },
      { lang: 'en', event_description: 'English event copy', history_description: '' },
    ],
    automationEvents,
  });
  const env = (db) => ({
    DB: db,
    ADMIN_TOKEN: 'test',
    VOTING_BASE_URL: 'https://www.gamestormers.dk',
    DISCORD_VOTING_WEBHOOK_URL: 'https://discord.example/webhook',
    DISCORD_GENERAL_WEBHOOK_URL: 'https://discord.example/general',
    fetch: async (url, init) => {
      fetchCalls.push({ url, init });
      return { ok: true, status: 204 };
    },
  });

  const db = makeAnnounceDb([]);
  const response = await onRequest({
    request: adminRequest('https://example.com/api/admin/round/19/announce-winner', 'POST', {}),
    env: env(db),
    params: { route: ['round', '19', 'announce-winner'] },
  });

  assert.equal(response.status, 200);
  const general = fetchCalls.find((call) => call.url === 'https://discord.example/general');
  assert.ok(general, 'posts the breakdown link to the general webhook');
  const content = JSON.parse(general.init.body).content;
  assert.match(content, /winner for meeting #19/i);
  assert.match(content, /\[the vote page\]\(<https:\/\/www\.gamestormers\.dk\/en\/vote>\)/);

  const inserts = db.statements.filter((s) => s.sql.includes('INSERT INTO automation_events'));
  assert.deepEqual(inserts.map((s) => s.args[1]).sort(), ['results_link_posted', 'winner_announcement_posted']);

  // Idempotent: with results_link_posted already recorded, no second general post.
  fetchCalls.length = 0;
  const db2 = makeAnnounceDb([
    { id: 2, round_id: 19, event_type: 'results_link_posted', payload_json: null, created_at: '2026-07-10 09:00:00' },
  ]);
  const response2 = await onRequest({
    request: adminRequest('https://example.com/api/admin/round/19/announce-winner', 'POST', {}),
    env: env(db2),
    params: { route: ['round', '19', 'announce-winner'] },
  });
  assert.equal(response2.status, 200);
  assert.ok(!fetchCalls.some((call) => call.url === 'https://discord.example/general'));
});
