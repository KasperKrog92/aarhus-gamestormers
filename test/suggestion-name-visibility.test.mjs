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

function fakeDb(ownerId = 'member-1') {
  const state = {
    suggestion: {
      id: 7,
      title: 'Outer Wilds',
      status: 'approved',
      suggested_by: 'Kasper',
      discord_user_id: ownerId,
      show_suggester_name: 1,
    },
  };

  function statement(sql, args = []) {
    return {
      bind(...nextArgs) {
        return statement(sql, nextArgs);
      },
      async all() {
        if (sql.startsWith('PRAGMA table_info(suggestions)')) {
          return { results: [{ name: 'discord_user_id' }, { name: 'show_suggester_name' }] };
        }
        if (sql.startsWith('PRAGMA table_info(votes)')) return { results: [{ name: 'discord_user_id' }] };
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
        if (sql.startsWith('SELECT id FROM suggestions')) {
          return Number(args[0]) === state.suggestion.id && args[1] === state.suggestion.discord_user_id
            ? { id: state.suggestion.id }
            : null;
        }
        if (sql.includes('SELECT id, title, status')) {
          return Number(args[0]) === state.suggestion.id && args[1] === state.suggestion.discord_user_id
            ? { ...state.suggestion }
            : null;
        }
        return null;
      },
      async run() {
        if (sql.startsWith('UPDATE suggestions SET show_suggester_name')) {
          state.suggestion.show_suggester_name = args[0];
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
