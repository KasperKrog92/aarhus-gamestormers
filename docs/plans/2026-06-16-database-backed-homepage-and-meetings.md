# Database-Backed Homepage And Meetings Plan

Created 2026-06-16 as a prerequisite for full voting automation.

## Progress

### 2026-06-16 Phase 1 Complete

Implemented the data/API foundation as a reviewable first phase:

- Added `meetings`, `games`, and `meeting_copy` to `schema.sql`.
- Added migration/table helpers in `functions/_lib/db.js`.
- Added DB helper functions for public meeting reads, meeting/game upserts, attaching a selected game, and localized meeting copy.
- Added `GET /api/meetings/public`.
- Added `node:test` coverage for public-safe output shaping and upcoming/history/planned grouping.
- Applied the local schema with `npx --yes wrangler d1 execute gamestormers --local --file=./schema.sql`.
- Ran `npm test`, passing 9/9 tests.
- Smoke-tested `/api/meetings/public` through `wrangler pages dev`, returning `200 OK`.

Deferred to later phases:

- Admin UI and round-creation integration.
- Homepage dynamic rendering.
- Selected-game promotion flow.
- Voting page next-round notice.
- JSON-LD generation.
- Sale workflow migration.
- Documentation migration and D1 backfill.

## Goal

Make meetings and selected games database-backed so the maintainer can create future rounds with known meeting numbers and dates, then let the site handle the public lifecycle:

1. Show upcoming meetings on the front page from D1.
2. Show past meetings in the history grid from D1.
3. Let voting automation promote a revealed winner into the matching meeting record.
4. Keep non-Steam suggestion approval manual.
5. Avoid manual edits to `index.html`, `en/index.html`, JSON-LD, history cards, and event cards for normal meeting updates.

This should happen before the deeper Phase B voting automation work. If the homepage remains hardcoded, automation can reveal a winner but still cannot complete the public site update.

## Product Vision

The desired maintainer flow:

1. Create several future rounds with meeting number, meeting date, venue, and storm code.
2. The site derives suggestion/voting windows from the meeting date.
3. Members suggest games during the suggestion window.
4. Maintainer approves only non-Steam games or fixes imported metadata when needed.
5. Voting opens and closes automatically.
6. The winning game is revealed automatically.
7. The homepage gets the new upcoming game card automatically.
8. The previous meeting naturally moves into history after its meeting end time.
9. The revealed vote page points people toward the next round, including when suggestions open for the next meeting number.

## Current Baseline

Already built:

- Voting rounds in D1.
- Suggestions and votes in D1.
- Steam metadata import for suggestions.
- Admin page for opening rounds and curating suggestions.
- Static front pages in `index.html` and `en/index.html`.
- Static event cards, history cards, and JSON-LD in both front pages.
- `js/script.js` auto-hides passed event cards and reveals pre-published history cards.
- Sale badges scan front-page event store links and local JSON files.

Current mismatch:

- Voting knows about future rounds, but the homepage does not.
- The homepage knows about upcoming selected games, but D1 does not model selected meeting games.
- The runbook still requires hand-editing two HTML files after a winner is known.

## Architecture Decision

Use D1 as the source of truth for meetings and selected games.

Use one shared rendering layer for both languages so Danish and English stay structurally synchronized. Prefer client-rendered homepage sections first because it is the smallest safe migration from the current static site:

- Static `index.html` and `en/index.html` keep the hero, navigation, about copy, and static fallback containers.
- `js/script.js` fetches `/api/meetings/public` and renders upcoming events, history cards, countdown inputs, calendar links, and sale-badge-compatible store links.
- The existing static cards can remain temporarily as a no-JS and migration fallback, then be removed once the dynamic renderer is verified.

SEO note: client-rendered event cards are less ideal for JSON-LD than server-rendered HTML. After the data model and renderers are stable, add a second pass that either:

- injects JSON-LD from the same public API in the browser, or
- serves `/` and `/en/` through Pages Functions with the same renderers, so event JSON-LD is present in the initial HTML.

Do not start with a full CMS or a new framework.

## Data Model

Extend D1 with public meeting content separate from voting ballots.

Add `meetings`:

```sql
CREATE TABLE IF NOT EXISTS meetings (
  id                 INTEGER PRIMARY KEY,
  meeting_date       TEXT NOT NULL,
  starts_at_utc      TEXT NOT NULL,
  ends_at_utc        TEXT NOT NULL,
  timezone           TEXT NOT NULL DEFAULT 'Europe/Copenhagen',
  venue_name         TEXT NOT NULL,
  venue_address      TEXT,
  discord_invite     TEXT,
  status             TEXT NOT NULL DEFAULT 'planned'
                       CHECK (status IN ('planned','suggesting','voting','revealed','completed','cancelled')),
  selected_suggestion_id INTEGER REFERENCES suggestions(id) ON DELETE SET NULL,
  selected_game_id   INTEGER,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Add `games`:

```sql
CREATE TABLE IF NOT EXISTS games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  steam_appid     TEXT,
  title           TEXT NOT NULL,
  header_image    TEXT,
  store_url       TEXT,
  gog_url         TEXT,
  gog_id          TEXT,
  genres          TEXT,
  platforms       TEXT,
  price           TEXT,
  playtime_hours  INTEGER,
  hltb_url        TEXT,
  description_da  TEXT,
  description_en  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Add `meeting_copy`:

```sql
CREATE TABLE IF NOT EXISTS meeting_copy (
  meeting_id        INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  lang              TEXT NOT NULL CHECK (lang IN ('da','en')),
  event_description TEXT,
  history_description TEXT,
  PRIMARY KEY (meeting_id, lang)
);
```

Notes:

- `rounds.id` and `meetings.id` should match the meeting number.
- `rounds` remains the voting workflow record.
- `meetings` is the public event/history record.
- `games` stores reusable selected-game metadata.
- `meeting_copy` stores localized human-reviewed copy.
- HowLongToBeat stays manual through `playtime_hours` and `hltb_url`.

## Task 1: Add Meeting Content Schema

- [x] Add `meetings`, `games`, and `meeting_copy` to `schema.sql`.
- [x] Add migration helpers in `functions/_lib/db.js`.
- [x] Add DB helper functions:
  - `getPublicMeetings(db)`
  - `getMeetingById(db, id)`
  - `upsertMeeting(db, meeting)`
  - `upsertGame(db, game)`
  - `attachGameToMeeting(db, meetingId, gameId, suggestionId)`
  - `upsertMeetingCopy(db, meetingId, lang, copy)`
- [x] Add `node:test` coverage for data shaping and public-safe output.
- [x] Run local schema:

```powershell
wrangler d1 execute gamestormers --local --file=./schema.sql
```

- [x] Run `npm test`.

Note: local schema was applied with `npx --yes wrangler ...` because `wrangler` was not on PATH in the shell.

## Task 2: Connect Rounds To Meetings

- [ ] When opening a round, create or update the matching `meetings` row.
- [ ] Keep `rounds.id` equal to `meetings.id`.
- [ ] Store meeting date, start/end UTC, venue, and Discord invite in `meetings`.
- [ ] Keep schedule offsets on `rounds` for voting behavior.
- [ ] Update `vote-admin.html` so creating a round also captures meeting event basics.
- [ ] Add an admin view that clearly shows whether a round has a public meeting record.
- [ ] Run `npm test`.

## Task 3: Public Meetings API

- [x] Add `GET /api/meetings/public`.
- [x] Return:
  - future meetings with selected games as upcoming events
  - past meetings with selected games as history
  - planned meetings without a selected game as lightweight "next round" metadata
- [x] Do not expose storm codes, ballot data, admin notes, or pending/rejected suggestions.
- [x] Include enough data to render:
  - event cards
  - history cards
  - calendar links
  - countdown dates
  - store links and sale-badge attributes
  - JSON-LD event objects
- [x] Sort by meeting number and date.
- [x] Add tests for public output shape.
- [x] Verify locally with:

```powershell
npm run dev
Invoke-WebRequest http://127.0.0.1:8788/api/meetings/public
```

Note: verified via `npx --yes wrangler pages dev . --port 8788`; the route returned `200 OK`.

## Task 4: Shared Frontend Renderers

- [ ] Add a small renderer module, for example `js/meetings.js`.
- [ ] Render upcoming event cards into the existing `.gs-events` section.
- [ ] Render history cards into the existing `.history-grid`.
- [ ] Preserve existing CSS class contracts:
  - `.event-card`
  - `.event-store-links`
  - `.cal-ics`
  - `.history-card`
  - `.history-toggle`
  - `.history-sub`
- [ ] Preserve platform icon rendering with the existing SVG symbols.
- [ ] Generate Google Calendar, Apple/ICS, and Outlook links from DB dates.
- [ ] Keep sale badges working by rendering Steam links and `data-gog-id` the same way the static HTML does.
- [ ] Update countdown logic so it can run after dynamic event cards are inserted.
- [ ] Update history accordion logic so it can run after dynamic history cards are inserted.
- [ ] Add a static test that confirms the renderer emits the key class names and data attributes.
- [ ] Run `npm test`.

## Task 5: Homepage Integration

- [ ] Add dynamic mount points to `index.html` and `en/index.html` if needed.
- [ ] Load `js/meetings.js` before or alongside `js/script.js`.
- [ ] Keep existing static event/history markup during the first migration as fallback.
- [ ] Once dynamic rendering is verified, remove duplicated static event/history cards.
- [ ] Keep Danish and English static shells structurally synchronized.
- [ ] If `css/style.css` changes, bump query strings on both front pages.
- [ ] Verify in a real browser through `npm run dev`.

## Task 6: Admin Selected Game Flow

- [ ] Add an admin action to promote a suggestion to the selected game for its meeting.
- [ ] On promotion:
  - copy suggestion metadata into `games`
  - attach the game to `meetings.selected_game_id`
  - set `meetings.selected_suggestion_id`
  - set or confirm `rounds.winner_suggestion_id`
  - set the round phase to `revealed` when appropriate
- [ ] Allow maintainer edits for:
  - GOG URL and GOG product ID
  - HowLongToBeat URL and hours
  - Danish event description
  - English event description
  - Danish history description
  - English history description
  - genres and platforms if Steam import needs correction
- [ ] Keep non-Steam suggestion approval manual.
- [ ] Add admin validation that the homepage card is not considered publish-ready until required fields are present.

## Task 7: Voting Page Next-Round Notice

- [ ] Update `/api/round/current` or add a small public route that includes next planned round metadata.
- [ ] After a round is revealed or voting has closed, show:
  - winner/results for the current round
  - next meeting number
  - next meeting date
  - suggestion start date
  - voting open date if known
- [ ] Keep the notice bilingual in `js/vote.js`.
- [ ] Do not expose the next round storm code.
- [ ] Add tests for public response shape and static JS strings.

## Task 8: SEO And JSON-LD

- [ ] Generate Event JSON-LD objects from the same public meeting data.
- [ ] First pass: inject JSON-LD client-side once meetings load.
- [ ] Second pass if needed: serve `/` and `/en/` through Pages Functions so JSON-LD is present in initial HTML.
- [ ] Keep canonical, hreflang, OG, and Twitter metadata static unless the broader page copy changes.
- [ ] Revisit whether `sitemap.xml` needs dynamic generation or whether static `lastmod` is enough after event data moves to D1.

## Task 9: Sale Workflow Follow-Up

- [ ] Update `.github/workflows/update-steam-sales.yml` so it can read upcoming event store links from D1 instead of parsing static HTML.
- [ ] Keep writing `data/steam-sales.json` and `data/gog-sales.json` unless a later plan moves sale data to D1 too.
- [ ] Keep Discord sale alerts separate from voting announcements.
- [ ] Verify sale badges still render on dynamically generated event cards.

## Task 10: Documentation And Migration

- [ ] Update `docs/project-guide.md` to say the homepage event/history sections are dynamic.
- [ ] Update `docs/content-guide.md` to document database fields and admin workflow instead of hand-editing cards.
- [ ] Update `MEETING_WORKFLOW.md` so "new game chosen" becomes admin data entry rather than HTML editing.
- [ ] Update `docs/voting-system.md` to explain the link between rounds and meetings.
- [ ] Update `docs/deployment-guide.md` with any new D1 migration notes.
- [ ] Backfill existing hardcoded meetings into D1.
- [ ] Compare dynamic output against current `index.html` and `en/index.html`.
- [ ] Run:

```powershell
npm test
npm run dev
```

- [ ] Verify in a real browser:
  - `http://127.0.0.1:8788/`
  - `http://127.0.0.1:8788/en/`
  - `http://127.0.0.1:8788/vote.html`
  - `http://127.0.0.1:8788/vote-admin.html`

## Acceptance Criteria

- A maintainer can create future meetings/rounds without editing homepage HTML.
- The homepage shows selected upcoming games from D1.
- The history grid shows completed meetings from D1.
- The vote reveal page can point to the next meeting and suggestion window.
- A selected winner can become a homepage event through admin/API data changes.
- Non-Steam suggestion approval remains manual.
- Existing calendar, countdown, history accordion, platform icons, and sale badge behavior still work.

## Relationship To Voting Automation Plan

After this plan is implemented, update `2026-06-16-phase-b-voting-automation.md` so its reveal step promotes the winner into `meetings`/`games` instead of generating a Markdown handoff as the primary output.

The handoff can remain as a fallback for missing manual fields, especially HowLongToBeat and localized descriptions.
