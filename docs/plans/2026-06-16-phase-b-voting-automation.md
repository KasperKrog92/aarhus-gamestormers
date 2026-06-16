# Phase B Voting Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the second phase of the voting system: scheduled phase changes, Discord announcements, winner handoff output for the existing meeting workflow, and a read-only public archive.

**Architecture:** Use GitHub Actions as the scheduler/orchestrator, calling the existing Cloudflare Pages Functions admin API with `ADMIN_TOKEN`. Keep D1 as the source of truth, add small admin/public API endpoints for schedule metadata and archive reads, and generate handoff artifacts as committed files or draft PR content rather than mutating `index.html` automatically.

**Tech Stack:** Vanilla JS, Cloudflare Pages Functions, Cloudflare D1, GitHub Actions, Discord webhook, Node.js scripts using built-in `fetch`, `fs/promises`, and `node:test`.

---

## Scope

Phase B includes four deliverables:

1. Scheduled phase automation: open suggestions, open voting, reveal winner, close old rounds, and open the next round from configured meeting dates.
2. Discord notifications: post concise messages when suggestions open, voting opens, and a winner is revealed.
3. Content handoff: generate a maintainer-ready Markdown handoff for the winning game with event/history fields aligned with `MEETING_WORKFLOW.md`.
4. Archive: expose past revealed/closed rounds and final tallies on `vote.html` / `en/vote.html`.

Phase B does not auto-edit `index.html` or `en/index.html`. The maintainer still performs the final site-content update because HowLongToBeat playtime and localized descriptions remain human-reviewed.

## File Structure

- Create `automation/phase-b/config.json`: meeting schedule, phase offsets, default venue, default Discord invite, and default time window.
- Create `automation/phase-b/run-scheduler.mjs`: idempotent scheduler entry point for GitHub Actions.
- Create `automation/phase-b/api-client.mjs`: authenticated calls to the same-origin admin API.
- Create `automation/phase-b/discord.mjs`: Discord webhook message formatting and delivery.
- Create `automation/phase-b/handoff.mjs`: generate Markdown handoff content for a revealed winner.
- Create `automation/phase-b/time.mjs`: Copenhagen timezone and UTC date helpers.
- Create `automation/phase-b/*.test.mjs`: Node tests for scheduling decisions, Discord payloads, handoff generation, and API client behavior.
- Create `.github/workflows/voting-phase-b.yml`: scheduled and manual workflow.
- Modify `schema.sql`: add round schedule columns and a notification log table.
- Modify `functions/_lib/db.js`: add helpers for archive and automation metadata.
- Modify `functions/api/round/current.js`: keep current behavior unchanged, but make sure new round fields do not leak `storm_code`.
- Modify `functions/api/round/archive.js`: new public archive endpoint.
- Modify `functions/api/admin/[[route]].js`: accept schedule metadata and expose current round automation data to authenticated callers.
- Modify `js/vote.js`: render archive below the active round UI.
- Modify `vote.html` and `en/vote.html`: add an archive mount point if the existing `#vote-app` structure needs a stable target.
- Modify `css/style.css`: archive list/results styling using existing vote card patterns.
- Modify `docs/voting-system.md`: document Phase B scheduler, secrets, archive, and handoff process.
- Modify `README.md`: mention scheduled voting automation and required GitHub secrets.

## Required Secrets

Add these GitHub Actions secrets before enabling the workflow:

- `VOTING_ADMIN_TOKEN`: same value as Cloudflare Pages `ADMIN_TOKEN`.
- `VOTING_BASE_URL`: `https://www.gamestormers.dk`.
- `DISCORD_WEBHOOK_URL`: Discord webhook URL for announcements.

Keep these Cloudflare Pages secrets as they are:

- `ADMIN_TOKEN`
- `TURNSTILE_SECRET`

## Task 1: Add Schedule Storage To D1

**Files:**
- Modify: `schema.sql`
- Test: `test/schema.test.mjs`

- [ ] **Step 1: Write the failing schema test**

Create `test/schema.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('schema contains Phase B schedule and notification fields', async () => {
  const schema = await readFile('schema.sql', 'utf8');

  assert.match(schema, /suggestions_open_at\s+TEXT/);
  assert.match(schema, /voting_open_at\s+TEXT/);
  assert.match(schema, /reveal_at\s+TEXT/);
  assert.match(schema, /meeting_starts_at\s+TEXT/);
  assert.match(schema, /meeting_ends_at\s+TEXT/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS automation_events/);
  assert.match(schema, /UNIQUE\s*\(\s*round_id\s*,\s*event_type\s*\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test test/schema.test.mjs
```

Expected: FAIL because `schema.sql` does not contain the Phase B fields yet.

- [ ] **Step 3: Add nullable schedule columns and notification log table**

In `schema.sql`, extend `rounds` with nullable columns:

```sql
  suggestions_open_at  TEXT,                           -- ISO 8601 UTC
  voting_open_at       TEXT,                           -- ISO 8601 UTC
  reveal_at            TEXT,                           -- ISO 8601 UTC
  meeting_starts_at    TEXT,                           -- ISO 8601 UTC
  meeting_ends_at      TEXT,                           -- ISO 8601 UTC
  discord_message_url  TEXT,                           -- latest related Discord message, if available
```

Add after the `votes` table:

```sql
CREATE TABLE IF NOT EXISTS automation_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id     INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN ('suggestions_opened','voting_opened','winner_revealed','round_closed','handoff_generated')),
  payload_json TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (round_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_automation_events_round ON automation_events(round_id, event_type);
```

- [ ] **Step 4: Run schema locally**

Run:

```powershell
wrangler d1 execute gamestormers --local --file=./schema.sql
```

Expected: `commands executed successfully`.

- [ ] **Step 5: Verify the test passes**

Run:

```powershell
node --test test/schema.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add schema.sql test/schema.test.mjs
git commit -m "chore: add voting automation schema"
```

## Task 2: Add Automation API Helpers

**Files:**
- Modify: `functions/_lib/db.js`
- Test: `test/db-helpers.test.mjs`

- [ ] **Step 1: Write unit tests for pure helper behavior**

Create `test/db-helpers.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { isAutomationEventDuplicateError, toArchiveRound } from '../functions/_lib/db.js';

test('toArchiveRound returns public round archive shape', () => {
  const row = {
    id: 20,
    title: 'Meeting 20',
    phase: 'revealed',
    winner_suggestion_id: 7,
    voting_closes_at: '2026-08-01T18:00:00Z',
    meeting_starts_at: '2026-08-03T16:30:00Z',
    meeting_ends_at: '2026-08-03T19:00:00Z',
  };

  assert.deepEqual(toArchiveRound(row), {
    id: 20,
    title: 'Meeting 20',
    phase: 'revealed',
    winnerSuggestionId: 7,
    votingClosesAt: '2026-08-01T18:00:00Z',
    meetingStartsAt: '2026-08-03T16:30:00Z',
    meetingEndsAt: '2026-08-03T19:00:00Z',
  });
});

test('isAutomationEventDuplicateError recognizes D1 unique failures', () => {
  assert.equal(isAutomationEventDuplicateError(new Error('UNIQUE constraint failed: automation_events.round_id, automation_events.event_type')), true);
  assert.equal(isAutomationEventDuplicateError(new Error('network failed')), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test test/db-helpers.test.mjs
```

Expected: FAIL because the exported helpers do not exist.

- [ ] **Step 3: Add helper exports**

Append to `functions/_lib/db.js`:

```js
export function toArchiveRound(row) {
  return {
    id: row.id,
    title: row.title,
    phase: row.phase,
    winnerSuggestionId: row.winner_suggestion_id,
    votingClosesAt: row.voting_closes_at,
    meetingStartsAt: row.meeting_starts_at,
    meetingEndsAt: row.meeting_ends_at,
  };
}

export function isAutomationEventDuplicateError(error) {
  return String(error?.message || '').includes('UNIQUE constraint failed: automation_events.round_id, automation_events.event_type');
}

export async function getArchiveRounds(db, limit = 12) {
  const { results } = await db
    .prepare("SELECT * FROM rounds WHERE phase IN ('revealed','closed') ORDER BY id DESC LIMIT ?")
    .bind(limit)
    .all();
  return results || [];
}

export async function recordAutomationEvent(db, roundId, eventType, payload = {}) {
  return db
    .prepare('INSERT INTO automation_events (round_id, event_type, payload_json) VALUES (?, ?, ?)')
    .bind(roundId, eventType, JSON.stringify(payload))
    .run();
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```powershell
node --test test/db-helpers.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add functions/_lib/db.js test/db-helpers.test.mjs
git commit -m "chore: add voting automation db helpers"
```

## Task 3: Add Public Archive API

**Files:**
- Create: `functions/api/round/archive.js`
- Test: `test/archive-shaping.test.mjs`

- [ ] **Step 1: Write archive shaping tests**

Create `test/archive-shaping.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { shapeArchiveRound } from '../functions/api/round/archive.js';

test('shapeArchiveRound includes tallies only for public archive cards', () => {
  const round = {
    id: 21,
    title: 'Meeting 21',
    phase: 'closed',
    winner_suggestion_id: 44,
    voting_closes_at: '2026-09-01T18:00:00Z',
    meeting_starts_at: '2026-09-07T16:30:00Z',
    meeting_ends_at: '2026-09-07T19:00:00Z',
  };
  const suggestions = [
    { id: 44, title: 'Winner', status: 'approved', steam_appid: '123', header_image: 'img', store_url: 'url', genres: 'Puzzle', platforms: 'Windows', price: '', playtime_hours: 8, pitch: 'Pitch', suggested_by: 'Kasper' },
    { id: 45, title: 'Rejected', status: 'rejected', steam_appid: '456', header_image: 'img', store_url: 'url', genres: '', platforms: '', price: '', playtime_hours: null, pitch: '', suggested_by: '' },
  ];
  const tallies = { 44: 5, 45: 9 };

  const shaped = shapeArchiveRound(round, suggestions, tallies);

  assert.equal(shaped.round.id, 21);
  assert.equal(shaped.suggestions.length, 1);
  assert.equal(shaped.suggestions[0].title, 'Winner');
  assert.equal(shaped.suggestions[0].votes, 5);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test test/archive-shaping.test.mjs
```

Expected: FAIL because `functions/api/round/archive.js` does not exist.

- [ ] **Step 3: Create the archive endpoint**

Create `functions/api/round/archive.js`:

```js
import { json, fail } from '../../_lib/http.js';
import { getArchiveRounds, getSuggestions, getTallies, toArchiveRound, toCard } from '../../_lib/db.js';

export function shapeArchiveRound(round, suggestions, tallies) {
  return {
    round: toArchiveRound(round),
    suggestions: suggestions
      .filter((s) => s.status === 'approved')
      .map((s) => toCard(s, tallies[s.id] || 0)),
  };
}

export async function onRequestGet({ env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const rounds = await getArchiveRounds(db, 12);
  const archive = [];

  for (const round of rounds) {
    const suggestions = await getSuggestions(db, round.id);
    const tallies = await getTallies(db, round.id);
    archive.push(shapeArchiveRound(round, suggestions, tallies));
  }

  return json({ archive });
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
node --test test/archive-shaping.test.mjs test/db-helpers.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Manually verify local endpoint**

Run Pages locally:

```powershell
wrangler pages dev . --port 8787
```

In another terminal:

```powershell
Invoke-WebRequest http://127.0.0.1:8787/api/round/archive
```

Expected: JSON with an `archive` array.

- [ ] **Step 6: Commit**

```powershell
git add functions/api/round/archive.js test/archive-shaping.test.mjs
git commit -m "feat: add voting round archive api"
```

## Task 4: Extend Admin Round Metadata

**Files:**
- Modify: `functions/api/admin/[[route]].js`
- Test: `test/admin-round-fields.test.mjs`

- [ ] **Step 1: Write a static regression test for accepted fields**

Create `test/admin-round-fields.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin round API accepts Phase B schedule fields', async () => {
  const source = await readFile('functions/api/admin/[[route]].js', 'utf8');

  for (const field of ['suggestionsOpenAt', 'votingOpenAt', 'revealAt', 'meetingStartsAt', 'meetingEndsAt']) {
    assert.match(source, new RegExp(`body\\.${field}`), `${field} should be handled`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test test/admin-round-fields.test.mjs
```

Expected: FAIL because the fields are not handled.

- [ ] **Step 3: Add POST bindings for new round schedule fields**

In `adminOpenRound`, change the insert to include schedule fields:

```js
await db
  .prepare(
    `INSERT INTO rounds
       (id, title, storm_code, phase, voting_closes_at, suggestions_open_at, voting_open_at, reveal_at, meeting_starts_at, meeting_ends_at)
     VALUES (?, ?, ?, 'suggesting', ?, ?, ?, ?, ?, ?)`
  )
  .bind(
    id,
    clean(body.title, 120) || null,
    stormCode,
    clean(body.votingClosesAt, 40) || null,
    clean(body.suggestionsOpenAt, 40) || null,
    clean(body.votingOpenAt, 40) || null,
    clean(body.revealAt, 40) || null,
    clean(body.meetingStartsAt, 40) || null,
    clean(body.meetingEndsAt, 40) || null
  )
  .run();
```

- [ ] **Step 4: Add PATCH handling for schedule fields**

In `adminPatchRound`, after `votingClosesAt`:

```js
if (body.suggestionsOpenAt !== undefined) put('suggestions_open_at', clean(body.suggestionsOpenAt, 40) || null);
if (body.votingOpenAt !== undefined) put('voting_open_at', clean(body.votingOpenAt, 40) || null);
if (body.revealAt !== undefined) put('reveal_at', clean(body.revealAt, 40) || null);
if (body.meetingStartsAt !== undefined) put('meeting_starts_at', clean(body.meetingStartsAt, 40) || null);
if (body.meetingEndsAt !== undefined) put('meeting_ends_at', clean(body.meetingEndsAt, 40) || null);
```

- [ ] **Step 5: Run the test**

Run:

```powershell
node --test test/admin-round-fields.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add functions/api/admin/[[route]].js test/admin-round-fields.test.mjs
git commit -m "feat: support scheduled round metadata"
```

## Task 5: Add Scheduler Decision Logic

**Files:**
- Create: `automation/phase-b/time.mjs`
- Create: `automation/phase-b/scheduler.mjs`
- Create: `automation/phase-b/scheduler.test.mjs`

- [ ] **Step 1: Write scheduler tests**

Create `automation/phase-b/scheduler.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { decideRoundActions } from './scheduler.mjs';

const round = {
  id: 22,
  phase: 'suggesting',
  suggestions_open_at: '2026-08-24T08:00:00Z',
  voting_open_at: '2026-08-31T08:00:00Z',
  reveal_at: '2026-09-04T18:00:00Z',
  meeting_ends_at: '2026-09-07T19:00:00Z',
};

test('opens voting when voting time has passed', () => {
  assert.deepEqual(decideRoundActions({ now: '2026-08-31T08:00:01Z', round, events: [] }), [
    { type: 'open_voting', roundId: 22 },
  ]);
});

test('reveals winner when reveal time has passed and winner is known', () => {
  const revealedRound = { ...round, phase: 'voting', winner_suggestion_id: 99 };
  assert.deepEqual(decideRoundActions({ now: '2026-09-04T18:00:01Z', round: revealedRound, events: [] }), [
    { type: 'reveal_winner', roundId: 22, winnerSuggestionId: 99 },
  ]);
});

test('does not reveal without a winner', () => {
  const noWinner = { ...round, phase: 'voting', winner_suggestion_id: null };
  assert.deepEqual(decideRoundActions({ now: '2026-09-04T18:00:01Z', round: noWinner, events: [] }), []);
});

test('does not repeat an already recorded action', () => {
  assert.deepEqual(decideRoundActions({
    now: '2026-08-31T08:00:01Z',
    round,
    events: [{ event_type: 'voting_opened' }],
  }), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test automation/phase-b/scheduler.test.mjs
```

Expected: FAIL because the scheduler module does not exist.

- [ ] **Step 3: Implement pure scheduler logic**

Create `automation/phase-b/scheduler.mjs`:

```js
const EVENT_BY_ACTION = {
  open_suggestions: 'suggestions_opened',
  open_voting: 'voting_opened',
  reveal_winner: 'winner_revealed',
  close_round: 'round_closed',
};

function hasEvent(events, eventType) {
  return events.some((event) => event.event_type === eventType);
}

function timeHasPassed(now, iso) {
  return Boolean(iso) && new Date(now).getTime() >= new Date(iso).getTime();
}

export function decideRoundActions({ now, round, events }) {
  if (!round) return [];
  const actions = [];

  if (
    round.phase === 'suggesting' &&
    timeHasPassed(now, round.voting_open_at) &&
    !hasEvent(events, EVENT_BY_ACTION.open_voting)
  ) {
    actions.push({ type: 'open_voting', roundId: round.id });
  }

  if (
    round.phase === 'voting' &&
    round.winner_suggestion_id &&
    timeHasPassed(now, round.reveal_at) &&
    !hasEvent(events, EVENT_BY_ACTION.reveal_winner)
  ) {
    actions.push({ type: 'reveal_winner', roundId: round.id, winnerSuggestionId: round.winner_suggestion_id });
  }

  if (
    round.phase === 'revealed' &&
    timeHasPassed(now, round.meeting_ends_at) &&
    !hasEvent(events, EVENT_BY_ACTION.close_round)
  ) {
    actions.push({ type: 'close_round', roundId: round.id });
  }

  return actions;
}

export { EVENT_BY_ACTION };
```

Create `automation/phase-b/time.mjs`:

```js
export function nowIso() {
  return new Date().toISOString();
}

export function toUtcIsoFromCopenhagen(date, time, offsetHours) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const utc = Date.UTC(year, month - 1, day, hour - offsetHours, minute, 0);
  return new Date(utc).toISOString();
}
```

- [ ] **Step 4: Run scheduler tests**

Run:

```powershell
node --test automation/phase-b/scheduler.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add automation/phase-b/scheduler.mjs automation/phase-b/time.mjs automation/phase-b/scheduler.test.mjs
git commit -m "feat: add voting scheduler decisions"
```

## Task 6: Add Authenticated API Client

**Files:**
- Create: `automation/phase-b/api-client.mjs`
- Create: `automation/phase-b/api-client.test.mjs`

- [ ] **Step 1: Write API client tests**

Create `automation/phase-b/api-client.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiClient } from './api-client.mjs';

test('createApiClient sends bearer auth and JSON body', async () => {
  const calls = [];
  const client = createApiClient({
    baseUrl: 'https://www.gamestormers.dk',
    token: 'secret',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const result = await client.patchRound({ phase: 'voting' });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0].url, 'https://www.gamestormers.dk/api/admin/round');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret');
  assert.equal(calls[0].options.body, '{"phase":"voting"}');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test automation/phase-b/api-client.test.mjs
```

Expected: FAIL because the API client module does not exist.

- [ ] **Step 3: Implement API client**

Create `automation/phase-b/api-client.mjs`:

```js
async function requestJson({ fetchImpl, baseUrl, token, path, method = 'GET', body }) {
  const response = await fetchImpl(new URL(path, baseUrl).toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }
  return data;
}

export function createApiClient({ baseUrl, token, fetchImpl = fetch }) {
  return {
    getAdminRound() {
      return requestJson({ fetchImpl, baseUrl, token, path: '/api/admin/round' });
    },
    patchRound(body) {
      return requestJson({ fetchImpl, baseUrl, token, path: '/api/admin/round', method: 'PATCH', body });
    },
  };
}
```

- [ ] **Step 4: Run the API client test**

Run:

```powershell
node --test automation/phase-b/api-client.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add automation/phase-b/api-client.mjs automation/phase-b/api-client.test.mjs
git commit -m "feat: add voting automation api client"
```

## Task 7: Add Discord Notifications

**Files:**
- Create: `automation/phase-b/discord.mjs`
- Create: `automation/phase-b/discord.test.mjs`

- [ ] **Step 1: Write Discord payload tests**

Create `automation/phase-b/discord.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDiscordMessage } from './discord.mjs';

test('buildDiscordMessage formats voting opened message', () => {
  const message = buildDiscordMessage({
    type: 'open_voting',
    round: { id: 23, title: 'Meeting 23' },
    baseUrl: 'https://www.gamestormers.dk',
  });

  assert.equal(message.content, '**Voting is open for Meeting 23!**\nTick every game you would be happy to play: https://www.gamestormers.dk/vote');
});

test('buildDiscordMessage formats revealed winner message', () => {
  const message = buildDiscordMessage({
    type: 'reveal_winner',
    round: { id: 23, title: 'Meeting 23' },
    winner: { title: 'Outer Wilds' },
    baseUrl: 'https://www.gamestormers.dk',
  });

  assert.equal(message.content, '**Meeting 23 winner: Outer Wilds**\nResults are live: https://www.gamestormers.dk/vote');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test automation/phase-b/discord.test.mjs
```

Expected: FAIL because the Discord module does not exist.

- [ ] **Step 3: Implement Discord message builder and sender**

Create `automation/phase-b/discord.mjs`:

```js
export function buildDiscordMessage({ type, round, winner, baseUrl }) {
  const title = round.title || `Meeting ${round.id}`;
  if (type === 'open_voting') {
    return {
      content: `**Voting is open for ${title}!**\nTick every game you would be happy to play: ${baseUrl}/vote`,
    };
  }
  if (type === 'reveal_winner') {
    return {
      content: `**Meeting ${round.id} winner: ${winner.title}**\nResults are live: ${baseUrl}/vote`,
    };
  }
  if (type === 'close_round') {
    return {
      content: `**${title} is now archived.**\nThanks for voting and playing.`,
    };
  }
  return {
    content: `**Suggestions are open for ${title}!**\nSuggest games here: ${baseUrl}/vote`,
  };
}

export async function postDiscordMessage({ webhookUrl, message, fetchImpl = fetch }) {
  if (!webhookUrl) return { skipped: true };
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    throw new Error(`Discord webhook returned ${response.status}`);
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run Discord tests**

Run:

```powershell
node --test automation/phase-b/discord.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add automation/phase-b/discord.mjs automation/phase-b/discord.test.mjs
git commit -m "feat: add voting Discord notifications"
```

## Task 8: Add Handoff Generator

**Files:**
- Create: `automation/phase-b/handoff.mjs`
- Create: `automation/phase-b/handoff.test.mjs`
- Create directory at runtime: `docs/handoffs/`

- [ ] **Step 1: Write handoff tests**

Create `automation/phase-b/handoff.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWinnerHandoffMarkdown } from './handoff.mjs';

test('buildWinnerHandoffMarkdown includes meeting workflow fields', () => {
  const markdown = buildWinnerHandoffMarkdown({
    round: { id: 24, title: 'Meeting 24', meetingStartsAt: '2026-10-05T16:30:00Z', meetingEndsAt: '2026-10-05T19:00:00Z' },
    winner: {
      title: 'Stardew Valley',
      steamAppId: '413150',
      storeUrl: 'https://store.steampowered.com/app/413150/Stardew_Valley/',
      gogUrl: 'https://www.gog.com/game/stardew_valley',
      genres: ['Farming', 'RPG'],
      platforms: ['Windows', 'macOS'],
      playtimeHours: 52,
      pitch: 'Cozy farming.',
      suggestedBy: 'Codex',
      image: 'https://cdn.akamai.steamstatic.com/steam/apps/413150/header.jpg',
    },
  });

  assert.match(markdown, /# Meeting 24 Winner Handoff/);
  assert.match(markdown, /Stardew Valley/);
  assert.match(markdown, /Steam App ID: `413150`/);
  assert.match(markdown, /HowLongToBeat: maintainer must verify/);
  assert.match(markdown, /MEETING_WORKFLOW\.md/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test automation/phase-b/handoff.test.mjs
```

Expected: FAIL because the handoff module does not exist.

- [ ] **Step 3: Implement handoff markdown builder**

Create `automation/phase-b/handoff.mjs`:

```js
export function buildWinnerHandoffMarkdown({ round, winner }) {
  const meetingLabel = round.title || `Meeting ${round.id}`;
  return `# ${meetingLabel} Winner Handoff

Generated from the voting system. Follow \`MEETING_WORKFLOW.md\` before publishing.

## Winner

- Title: ${winner.title}
- Steam App ID: \`${winner.steamAppId || ''}\`
- Steam URL: ${winner.storeUrl || ''}
- GOG URL: ${winner.gogUrl || ''}
- Banner: ${winner.image || ''}
- Genres: ${(winner.genres || []).join(', ')}
- Platforms: ${(winner.platforms || []).join(', ')}
- Suggested by: ${winner.suggestedBy || ''}
- Pitch: ${winner.pitch || ''}
- HowLongToBeat: maintainer must verify the canonical link and hours before publishing.

## Meeting

- Meeting number: ${round.id}
- Starts UTC: ${round.meetingStartsAt || ''}
- Ends UTC: ${round.meetingEndsAt || ''}

## Publishing Notes

- Add the event card in \`index.html\` and \`en/index.html\`.
- Add the matching JSON-LD Event blocks.
- Add pre-published history cards with \`hidden data-reveal\`.
- Update \`sitemap.xml\`.
- Verify Danish and English copy manually.
`;
}
```

- [ ] **Step 4: Run handoff tests**

Run:

```powershell
node --test automation/phase-b/handoff.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add automation/phase-b/handoff.mjs automation/phase-b/handoff.test.mjs
git commit -m "feat: add winner handoff generator"
```

## Task 9: Wire Scheduler Runner

**Files:**
- Create: `automation/phase-b/run-scheduler.mjs`
- Test: `automation/phase-b/run-scheduler.test.mjs`

- [ ] **Step 1: Write runner tests**

Create `automation/phase-b/run-scheduler.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { requireEnv } from './run-scheduler.mjs';

test('requireEnv returns required values', () => {
  assert.deepEqual(requireEnv({ A: '1', B: '2' }, ['A', 'B']), { A: '1', B: '2' });
});

test('requireEnv throws for missing values', () => {
  assert.throws(() => requireEnv({ A: '1' }, ['A', 'B']), /Missing required env: B/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test automation/phase-b/run-scheduler.test.mjs
```

Expected: FAIL because the runner module does not exist.

- [ ] **Step 3: Implement runner skeleton**

Create `automation/phase-b/run-scheduler.mjs`:

```js
import { createApiClient } from './api-client.mjs';
import { buildDiscordMessage, postDiscordMessage } from './discord.mjs';
import { decideRoundActions } from './scheduler.mjs';
import { nowIso } from './time.mjs';

export function requireEnv(env, keys) {
  const values = {};
  for (const key of keys) {
    if (!env[key]) throw new Error(`Missing required env: ${key}`);
    values[key] = env[key];
  }
  return values;
}

async function main() {
  const env = requireEnv(process.env, ['VOTING_BASE_URL', 'VOTING_ADMIN_TOKEN']);
  const client = createApiClient({ baseUrl: env.VOTING_BASE_URL, token: env.VOTING_ADMIN_TOKEN });
  const state = await client.getAdminRound();
  const actions = decideRoundActions({
    now: nowIso(),
    round: state.round,
    events: state.automationEvents || [],
  });

  for (const action of actions) {
    if (action.type === 'open_voting') {
      await client.patchRound({ phase: 'voting' });
    }
    if (action.type === 'reveal_winner') {
      await client.patchRound({ phase: 'revealed', winnerSuggestionId: action.winnerSuggestionId });
    }
    if (action.type === 'close_round') {
      await client.patchRound({ phase: 'closed' });
    }

    const winner = state.suggestions?.find((suggestion) => suggestion.id === action.winnerSuggestionId);
    const message = buildDiscordMessage({ type: action.type, round: state.round, winner, baseUrl: env.VOTING_BASE_URL });
    await postDiscordMessage({ webhookUrl: process.env.DISCORD_WEBHOOK_URL, message });
  }
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run runner tests**

Run:

```powershell
node --test automation/phase-b/run-scheduler.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add automation/phase-b/run-scheduler.mjs automation/phase-b/run-scheduler.test.mjs
git commit -m "feat: wire voting scheduler runner"
```

## Task 10: Add GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/voting-phase-b.yml`

- [ ] **Step 1: Create the scheduled workflow**

Create `.github/workflows/voting-phase-b.yml`:

```yaml
name: Voting phase automation

on:
  workflow_dispatch:
  schedule:
    - cron: "17 * * * *"

permissions:
  contents: write
  pull-requests: write

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: 24

      - name: Run tests
        run: node --test

      - name: Run voting scheduler
        env:
          VOTING_BASE_URL: ${{ secrets.VOTING_BASE_URL }}
          VOTING_ADMIN_TOKEN: ${{ secrets.VOTING_ADMIN_TOKEN }}
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
        run: node automation/phase-b/run-scheduler.mjs
```

- [ ] **Step 2: Validate workflow YAML is tracked**

Run:

```powershell
git status --short .github/workflows/voting-phase-b.yml
```

Expected: file appears as added.

- [ ] **Step 3: Commit**

```powershell
git add .github/workflows/voting-phase-b.yml
git commit -m "ci: add voting phase automation workflow"
```

## Task 11: Render Archive On Vote Pages

**Files:**
- Modify: `js/vote.js`
- Modify: `css/style.css`
- Test: `test/vote-archive-render.test.mjs`

- [ ] **Step 1: Write render helper test**

Create `test/vote-archive-render.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('vote.js fetches and renders archive endpoint', async () => {
  const source = await readFile('js/vote.js', 'utf8');
  assert.match(source, /\/api\/round\/archive/);
  assert.match(source, /renderArchive/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test test/vote-archive-render.test.mjs
```

Expected: FAIL because archive rendering is not wired.

- [ ] **Step 3: Add archive strings**

In `js/vote.js`, add localized strings near the existing `STRINGS` object:

```js
archiveTitle: 'Tidligere afstemninger',
archiveEmpty: 'Der er ingen afsluttede afstemninger endnu.',
```

For English:

```js
archiveTitle: 'Past votes',
archiveEmpty: 'No completed votes yet.',
```

- [ ] **Step 4: Add archive fetch/render functions**

In `js/vote.js`, add:

```js
async function fetchArchive() {
  const res = await fetch('/api/round/archive', { headers: { accept: 'application/json' } });
  if (!res.ok) return { archive: [] };
  return res.json();
}

function renderArchive(app, strings, archive) {
  const section = document.createElement('section');
  section.className = 'vote-archive';

  const heading = document.createElement('h2');
  heading.textContent = strings.archiveTitle;
  section.append(heading);

  if (!archive.length) {
    const empty = document.createElement('p');
    empty.className = 'vote-muted';
    empty.textContent = strings.archiveEmpty;
    section.append(empty);
  } else {
    for (const item of archive) {
      const card = document.createElement('article');
      card.className = 'vote-archive-card';
      const title = document.createElement('h3');
      title.textContent = item.round.title || `Meeting ${item.round.id}`;
      card.append(title);
      for (const suggestion of item.suggestions) {
        const row = document.createElement('p');
        row.textContent = `${suggestion.title}: ${suggestion.votes}`;
        card.append(row);
      }
      section.append(card);
    }
  }

  app.append(section);
}
```

Call it after active-round rendering:

```js
const archiveData = await fetchArchive();
renderArchive(app, strings, archiveData.archive || []);
```

- [ ] **Step 5: Add archive CSS**

In `css/style.css`, add:

```css
.vote-archive {
  margin-top: 2rem;
}

.vote-archive-card {
  background: var(--white);
  border: 1px solid var(--cream-dark);
  border-radius: 8px;
  padding: 1rem;
  box-shadow: var(--shadow-sm);
}

.vote-archive-card + .vote-archive-card {
  margin-top: 1rem;
}
```

- [ ] **Step 6: Run render test**

Run:

```powershell
node --test test/vote-archive-render.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add js/vote.js css/style.css test/vote-archive-render.test.mjs
git commit -m "feat: render voting archive"
```

## Task 12: Documentation And Final Verification

**Files:**
- Modify: `docs/voting-system.md`
- Modify: `README.md`

- [ ] **Step 1: Update `docs/voting-system.md`**

Add a `Phase B automation` subsection:

```md
**Phase B automation**: GitHub Actions runs `automation/phase-b/run-scheduler.mjs` hourly. The runner calls the Pages admin API with `VOTING_ADMIN_TOKEN`, advances round phases from the schedule fields stored in D1, posts Discord announcements via `DISCORD_WEBHOOK_URL`, and generates maintainer handoff notes for winners. It does not auto-edit homepage event/history HTML; maintainers still follow `MEETING_WORKFLOW.md`.
```

- [ ] **Step 2: Update `README.md`**

Add:

```md
Voting phase automation runs from `.github/workflows/voting-phase-b.yml`. Required GitHub secrets are `VOTING_BASE_URL`, `VOTING_ADMIN_TOKEN`, and `DISCORD_WEBHOOK_URL`.
```

- [ ] **Step 3: Run the full test suite**

Run:

```powershell
node --test
```

Expected: all tests pass.

- [ ] **Step 4: Run syntax checks**

Run:

```powershell
node --check automation/phase-b/run-scheduler.mjs
node --check automation/phase-b/api-client.mjs
node --check automation/phase-b/discord.mjs
node --check automation/phase-b/handoff.mjs
node --check automation/phase-b/scheduler.mjs
node --check functions/api/round/archive.js
```

Expected: no output and exit code 0.

- [ ] **Step 5: Run local Pages verification**

Run:

```powershell
wrangler d1 execute gamestormers --local --file=./schema.sql
wrangler pages dev . --port 8787
```

In another terminal:

```powershell
Invoke-WebRequest http://127.0.0.1:8787/api/round/current
Invoke-WebRequest http://127.0.0.1:8787/api/round/archive
```

Expected: both endpoints return JSON.

- [ ] **Step 6: Commit docs**

```powershell
git add docs/voting-system.md README.md
git commit -m "docs: document voting phase automation"
```

## Deployment Notes

- Apply schema remotely after review:

```powershell
wrangler d1 execute gamestormers --remote --file=./schema.sql
```

- Set GitHub Actions secrets before enabling the workflow schedule.
- Run the workflow manually once with a test round before trusting hourly automation.
- Keep Discord webhook permissions narrow: only allow posting to the intended announcement channel.
- Do not auto-commit generated event/history HTML in Phase B. Generate handoff notes only.

## Self-Review

- Spec coverage: scheduled phase changes are covered in Tasks 5, 9, and 10; Discord notifications in Task 7; handoff output in Task 8; archive in Tasks 2, 3, and 11.
- Placeholder scan: this plan contains no open placeholder markers or open-ended implementation steps.
- Type consistency: plan uses existing camelCase public/admin request fields and existing snake_case D1 columns consistently.
