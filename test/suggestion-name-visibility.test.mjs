import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureSuggestionVisibilityColumn, toCard, toOwnedSuggestion } from '../functions/_lib/db.js';
import { showNameValue } from '../functions/api/suggest.js';
import { onRequestPatch } from '../functions/api/suggestions/[id].js';

test('public suggestion cards respect explicit name visibility and preserve legacy behaviour', () => {
  const base = { id: 7, title: 'Outer Wilds', suggested_by: 'Kasper' };

  assert.equal(toCard({ ...base, discord_user_id: '123' }).suggestedBy, null);
  assert.equal(toCard({ ...base, discord_user_id: null }).suggestedBy, 'Kasper');
  assert.equal(toCard({ ...base, discord_user_id: '123', show_suggester_name: 1 }).suggestedBy, 'Kasper');
  assert.equal(toCard({ ...base, discord_user_id: '123', show_suggester_name: 0 }).suggestedBy, null);
});

test('new suggestions show the name by default and allow an explicit opt-out', () => {
  assert.equal(showNameValue({}), 1);
  assert.equal(showNameValue({ showName: true }), 1);
  assert.equal(showNameValue({ showName: false }), 0);
});

test('owned suggestion shape exposes the preference but not the Discord id', () => {
  const owned = toOwnedSuggestion({
    id: 7,
    title: 'Outer Wilds',
    status: 'approved',
    suggested_by: 'Kasper',
    discord_user_id: '123',
    show_suggester_name: 1,
  });

  assert.deepEqual(owned, {
    id: 7,
    title: 'Outer Wilds',
    status: 'approved',
    suggestedBy: 'Kasper',
    showName: true,
    pitch: null,
  });
  assert.equal(Object.hasOwn(owned, 'discordId'), false);
});

test('lazy migration adds a nullable visibility column for existing databases', async () => {
  const statements = [];
  const db = {
    prepare(sql) {
      statements.push(sql);
      return {
        async all() { return { results: [{ name: 'id' }] }; },
        async run() { return { success: true }; },
      };
    },
  };

  await ensureSuggestionVisibilityColumn(db);

  assert.equal(
    statements.includes(
      'ALTER TABLE suggestions ADD COLUMN show_suggester_name INTEGER CHECK (show_suggester_name IN (0, 1))'
    ),
    true
  );
});

// A round whose suggestions are open: suggesting phase, suggestions_open_at in
// the past so roundScheduleState reports suggestionsAreOpen.
function openRound() {
  return {
    id: 19,
    phase: 'suggesting',
    suggestions_open_at: '2000-01-01',
    voting_opens_at: '2999-01-01',
    voting_closes_at: '2999-02-01',
  };
}

// Suggestions no longer open: the round has moved on to voting.
function votingRound() {
  return {
    id: 19,
    phase: 'voting',
    suggestions_open_at: '2000-01-01',
    voting_opens_at: '2000-02-01',
    voting_closes_at: '2999-02-01',
  };
}

function fakeDb(ownerId = 'member-1', round = openRound()) {
  const state = {
    round,
    suggestion: {
      id: 7,
      round_id: round ? round.id : 19,
      title: 'Outer Wilds',
      status: 'approved',
      suggested_by: 'Kasper',
      discord_user_id: ownerId,
      show_suggester_name: 1,
      pitch: 'Old pitch',
    },
  };

  function statement(sql, args = []) {
    return {
      bind(...nextArgs) {
        return statement(sql, nextArgs);
      },
      async all() {
        if (sql.startsWith('PRAGMA table_info(suggestions)')) {
          return { results: [{ name: 'discord_user_id' }, { name: 'show_suggester_name' }, { name: 'pitch' }] };
        }
        if (sql.startsWith('PRAGMA table_info(votes)')) return { results: [{ name: 'discord_user_id' }] };
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
        return { results: [] };
      },
      async first() {
        if (sql.includes('FROM auth_sessions')) {
          return {
            discord_id: 'member-1',
            username: 'Kasper',
            avatar: null,
            is_gamestormers_member: 1,
            expires_at: '2099-01-01T00:00:00Z',
          };
        }
        if (sql.startsWith('SELECT id, round_id FROM suggestions')) {
          return Number(args[0]) === state.suggestion.id && args[1] === state.suggestion.discord_user_id
            ? { id: state.suggestion.id, round_id: state.suggestion.round_id }
            : null;
        }
        if (sql.startsWith('SELECT * FROM rounds')) {
          return state.round ? { ...state.round } : null;
        }
        if (sql.includes('SELECT id, title, status')) {
          return Number(args[0]) === state.suggestion.id && args[1] === state.suggestion.discord_user_id
            ? { ...state.suggestion }
            : null;
        }
        return null;
      },
      async run() {
        if (sql.startsWith('UPDATE suggestions SET')) {
          const cols = [];
          if (sql.includes('show_suggester_name = ?')) cols.push('show_suggester_name');
          if (sql.includes('pitch = ?')) cols.push('pitch');
          cols.forEach((col, i) => { state.suggestion[col] = args[i]; });
        }
        return { success: true, meta: {} };
      },
    };
  }

  return { state, prepare: statement };
}

function patchRequest(showName) {
  return new Request('https://example.com/api/suggestions/7', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: 'gs_session=test-session' },
    body: JSON.stringify({ showName }),
  });
}

test('only the authenticated suggestion owner can change name visibility', async () => {
  const db = fakeDb();
  const response = await onRequestPatch({
    request: patchRequest(false),
    env: { DB: db, SESSION_SECRET: 'test-secret' },
    params: { id: '7' },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.suggestion.showName, false);
  assert.equal(db.state.suggestion.show_suggester_name, 0);

  const otherDb = fakeDb('different-member');
  const denied = await onRequestPatch({
    request: patchRequest(true),
    env: { DB: otherDb, SESSION_SECRET: 'test-secret' },
    params: { id: '7' },
  });

  assert.equal(denied.status, 404);
  assert.equal(otherDb.state.suggestion.show_suggester_name, 1);
});

function patchPitchRequest(pitch) {
  return new Request('https://example.com/api/suggestions/7', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: 'gs_session=test-session' },
    body: JSON.stringify({ pitch }),
  });
}

test('the owner can edit their pitch while suggestions are open', async () => {
  const db = fakeDb('member-1', openRound());
  const response = await onRequestPatch({
    request: patchPitchRequest('A fresh pitch'),
    env: { DB: db, SESSION_SECRET: 'test-secret' },
    params: { id: '7' },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.suggestion.pitch, 'A fresh pitch');
  assert.equal(db.state.suggestion.pitch, 'A fresh pitch');
});

test('pitch edits are rejected once suggestions are no longer open', async () => {
  const db = fakeDb('member-1', votingRound());
  const response = await onRequestPatch({
    request: patchPitchRequest('Too late'),
    env: { DB: db, SESSION_SECRET: 'test-secret' },
    params: { id: '7' },
  });

  assert.equal(response.status, 409);
  assert.equal(db.state.suggestion.pitch, 'Old pitch');
});
