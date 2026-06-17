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

### 2026-06-16 Task 2 Complete

Connected voting rounds to public meeting records:

- Opening a round now creates the matching `meetings` row with the same id as `rounds.id`.
- Round creation and saving capture meeting date, Copenhagen-local start/end times, venue name, venue address, and Discord invite.
- Meeting start/end times are stored as UTC timestamps in D1 while schedule offsets remain on `rounds`.
- The admin round picker and round editor show whether the public meeting record exists.
- Saving an older round with event basics creates or repairs its public meeting record.
- Updated `docs/voting-system.md` with the round/meeting relationship.
- Ran `npm test`, passing 11/11 tests.

### 2026-06-16 Task 4 Complete

Added the shared frontend renderer layer:

- Added `js/meetings.js` as an ES module with pure builder functions (`buildEventCard`, `buildHistoryCard`, `buildEventCards`, `buildHistoryCards`, `escapeHtml`) plus a DOM-guarded browser bootstrap that fetches `/api/meetings/public` and injects cards.
- Renderer markup mirrors the static event/history cards so existing CSS class contracts (`event-card`, `event-store-links`, `cal-ics`, `history-card`, `history-toggle`, `history-sub`) stay intact.
- Platform icons reuse the existing `#gs-icon-windows`/`#gs-icon-apple`/`#gs-icon-linux` SVG symbols.
- Google Calendar, Apple/ICS, and Outlook links are generated from D1 dates, with Copenhagen-local times and offsets derived via `Intl` (handles DST).
- Sale badges keep working: Steam links carry the `store.steampowered.com/app/` href and GOG links carry `data-gog-id`.
- Bilingual output (da/en) chosen from `document.documentElement.lang`, including localized meeting numbers, labels, date formatting, playtime suffix, and calendar copy.
- Untrusted game/meeting content is HTML-escaped before insertion.
- Refactored `js/script.js` so countdown, history accordion, calendar dropdowns, cal-ics download, sale badges, and past-event hiding are re-runnable via `window.GS.refresh()`; the countdown clears its prior interval and per-element binders use a `data-gs-bound` guard. First-load behavior is unchanged.
- `js/meetings.js` calls `window.GS.refresh()` after injecting dynamic cards.
- Added `test/meetings-render.test.mjs` confirming emitted class names, data attributes, localization, and escaping.
- Ran `npm test`, passing 17/17 tests.

Homepage wiring (loading the module, mount points, removing static fallback cards) and browser verification are deferred to Task 5.

### 2026-06-17 Task 5 Complete

Wired the shared renderer into both front pages:

- Loaded `js/meetings.js` as a `type="module"` script just before `js/script.js` on `index.html` (relative path) and `en/index.html` (absolute path), matching each page's existing convention.
- No new mount points were needed: `.events-grid`, `.history-grid`, and the `data-count-template` on `.history-sub` already exist from Task 4, and the renderer targets them.
- Kept the static event/history cards in place as a no-JS / empty-DB fallback. The renderer only replaces a grid's `innerHTML` when the API actually returns meetings for that grid, so the static shell stays visible until D1 is backfilled. Removing the duplicated static cards is intentionally held for Task 10, after the backfill lands, so the live site cannot go empty.
- Verified end to end through `npm run dev` (Pages dev on `127.0.0.1:8788`). Seeded two temporary local-only D1 rows (one upcoming, one past), confirmed `/api/meetings/public` returned them, and confirmed both `/` and `/en/` replaced the static cards with the dynamic ones: localized meeting number ("99. møde" / "Meeting 99"), Steam link, Windows/Apple platform icons, genres, playtime link, DST-correct local time range "18:30-~21:30", and the updated history count line. `window.GS.refresh()` re-bound the calendar dropdown (aria-expanded toggled on the dynamic card). No console warnings or errors. Removed the seed rows and temp SQL afterward, leaving local D1 clean.
- No `css/style.css` change, so no `?v=N` bump was required. Bumped `js/meetings.js` cache string is `?v=1` (first load).
- Ran `npm test`, passing 17/17 tests.

Deferred to later phases:

- Homepage dynamic rendering.
- Selected-game promotion flow.
- Voting page next-round notice.
- JSON-LD generation.
- Sale workflow migration.
- Documentation migration and D1 backfill.

### 2026-06-17 Task 6 Complete

Added the admin selected-game flow:

- Added `POST /api/admin/round/:id/select`: copies the chosen suggestion into a `games` row (reusing the meeting's existing game row on re-promotion), attaches it via `meetings.selected_game_id`/`selected_suggestion_id`, confirms `rounds.winner_suggestion_id`, and reveals the round (and syncs meeting status) unless it is already `closed`.
- Added `PATCH /api/admin/meeting/:id`: maintainer edits for the selected game (GOG URL/ID, HowLongToBeat URL/hours, genres, platforms, title, cover, store URL, price) and the localized event/history descriptions in `meeting_copy`. Game edits load-merge-upsert so untouched columns are preserved.
- Added DB helpers `getGameById`, `getMeetingCopy`, `setMeetingStatus`, `gameInputFromSuggestion`, and `gameRowToInput`.
- Admin round GET responses now include `selectedGame`, `meetingCopy`, and a `publishReadiness` (`{ ready, missing }`) check. A card is not publish-ready until the game has a title, cover, store link, genres, platforms, playtime hours, HowLongToBeat URL, and Danish + English event descriptions.
- Added a "Selected game" section to `vote-admin.html`: a winner dropdown (most-voted first) with a promote button, the publish-readiness banner, and an editor for the game fields and localized copy.
- Non-Steam approval stays manual; promotion does not auto-change a suggestion's status.
- Added `test/admin-select-game.test.mjs` (promote/reveal, closed-round preservation, cross-round and missing-meeting guards, meeting patch merge + copy upsert, game-edit-without-selection guard). Ran `npm test`, passing 23/23.
- Verified end to end through `npm run dev`: opened a round (created its meeting), seeded an approved suggestion, promoted it (game created, round revealed, meeting status revealed), patched in HLTB/GOG/descriptions, watched `publishReadiness` flip to ready, and confirmed `/api/meetings/public` served the upcoming event with the new fields. Drove `vote-admin.html` in the preview browser: the "Selected game" section rendered the promote dropdown, "Homepage card is publish-ready." banner, and the prefilled game/copy editor with no console errors. Removed the temporary local D1 rows afterward.
- Updated `docs/voting-system.md` with the new routes and a "Selecting The Winning Game" section.

No `css/style.css` change (reused existing admin classes), so no `?v=N` bump was required.

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

- [x] When opening a round, create or update the matching `meetings` row.
- [x] Keep `rounds.id` equal to `meetings.id`.
- [x] Store meeting date, start/end UTC, venue, and Discord invite in `meetings`.
- [x] Keep schedule offsets on `rounds` for voting behavior.
- [x] Update `vote-admin.html` so creating a round also captures meeting event basics.
- [x] Add an admin view that clearly shows whether a round has a public meeting record.
- [x] Run `npm test`.

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

- [x] Add a small renderer module, for example `js/meetings.js`.
- [x] Render upcoming event cards into the existing `.gs-events` section.
- [x] Render history cards into the existing `.history-grid`.
- [x] Preserve existing CSS class contracts:
  - `.event-card`
  - `.event-store-links`
  - `.cal-ics`
  - `.history-card`
  - `.history-toggle`
  - `.history-sub`
- [x] Preserve platform icon rendering with the existing SVG symbols.
- [x] Generate Google Calendar, Apple/ICS, and Outlook links from DB dates.
- [x] Keep sale badges working by rendering Steam links and `data-gog-id` the same way the static HTML does.
- [x] Update countdown logic so it can run after dynamic event cards are inserted.
- [x] Update history accordion logic so it can run after dynamic history cards are inserted.
- [x] Add a static test that confirms the renderer emits the key class names and data attributes.
- [x] Run `npm test`.

## Task 5: Homepage Integration

- [x] Add dynamic mount points to `index.html` and `en/index.html` if needed. (Already present from Task 4; no new mounts required.)
- [x] Load `js/meetings.js` before or alongside `js/script.js`.
- [x] Keep existing static event/history markup during the first migration as fallback.
- [ ] Once dynamic rendering is verified, remove duplicated static event/history cards. (Held for Task 10, after D1 backfill, so the live site cannot render empty.)
- [x] Keep Danish and English static shells structurally synchronized.
- [x] If `css/style.css` changes, bump query strings on both front pages. (No CSS change this task.)
- [x] Verify in a real browser through `npm run dev`.

## Task 6: Admin Selected Game Flow

- [x] Add an admin action to promote a suggestion to the selected game for its meeting.
- [x] On promotion:
  - copy suggestion metadata into `games`
  - attach the game to `meetings.selected_game_id`
  - set `meetings.selected_suggestion_id`
  - set or confirm `rounds.winner_suggestion_id`
  - set the round phase to `revealed` when appropriate
- [x] Allow maintainer edits for:
  - GOG URL and GOG product ID
  - HowLongToBeat URL and hours
  - Danish event description
  - English event description
  - Danish history description
  - English history description
  - genres and platforms if Steam import needs correction
- [x] Keep non-Steam suggestion approval manual.
- [x] Add admin validation that the homepage card is not considered publish-ready until required fields are present.

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
