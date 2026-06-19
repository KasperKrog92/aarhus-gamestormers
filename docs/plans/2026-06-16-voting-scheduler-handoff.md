# Voting Scheduler And Handoff Plan

Updated 2026-06-17. All tasks are complete. Tasks 1-7 (database-backed schedule fields, automation-event storage, admin automation API, pure scheduler decisions, API client, Discord builders, winner-publication planner, and handoff Markdown builder) were implemented first. Task 8 added the runner (`automation/voting/run-scheduler.mjs`) that wires those together and calls promotion when `mayPromote` is true; Task 9 added the GitHub Actions workflow (`.github/workflows/voting-automation.yml`) that drives it once a day and uploads the handoff artifact; Task 10 updated the docs and ran verification. The full suite is 100 tests passing.

Prerequisite status: the database-backed homepage and meetings work is implemented. This automation project should build on the existing `meetings` / `games` / `meeting_copy` model and admin selected-game routes instead of generating homepage HTML changes.

## Goal

Automate the remaining voting round operations while keeping the maintainer in control of final site publication:

1. Move a round from suggestions to voting from stored schedule data.
2. Close voting, determine the winner from D1 tallies, and reveal results.
3. Post Discord announcements for voting open and winner revealed.
4. Promote the revealed winner into the database-backed homepage meeting record, with a maintainer-ready handoff only for missing manual fields.

This automation project does not edit `index.html`, `en/index.html`, history cards, JSON-LD, or `sitemap.xml`. Normal meeting publication should happen through D1/admin data instead of HTML edits. HowLongToBeat details and localized descriptions still need human review.

## Current Baseline

Already built:

- Cloudflare Pages Functions + D1 voting flow under `functions/`.
- Public vote pages: `vote.html`, `en/vote.html`, and `js/vote.js`.
- Admin page: `vote-admin.html`, protected by `ADMIN_TOKEN`.
- Date-only round schedule fields:
  - `meeting_date`
  - `suggestions_open_months_before`
  - `voting_opens_months_before`
  - `voting_closes_months_before`
  - `suggestions_open_at`
  - `voting_opens_at`
  - `voting_closes_at`
- Schedule defaults are now:
  - Suggestions start `2.8` months before the meeting.
  - Voting opens `2.5` months before the meeting.
  - Voting closes / reveal date is `2.2` months before the meeting.
- Admin UI for creating/editing meeting date, offsets, and all derived schedule dates.
- API enforcement:
  - Suggestions are blocked before `suggestions_open_at`.
  - Votes are blocked before `voting_opens_at`.
  - Votes are blocked after `voting_closes_at`, with the close date inclusive.
- Public current-round API hides `storm_code`.
- Public current-round API can return `nextRound` metadata for the vote page notice.
- Public vote pages display suggestions-open, voting-open, and voting-close dates.
- Database-backed homepage data exists through `GET /api/meetings/public`.
- Admin selected-game flow exists:
  - `POST /api/admin/round/:id/select` copies a suggestion into `games`, attaches it to `meetings`, confirms `winner_suggestion_id`, and reveals the round unless already closed.
  - `PATCH /api/admin/meeting/:id` edits selected-game public metadata and localized meeting copy.
  - Admin round responses include `selectedGame`, `meetingCopy`, and `publishReadiness`.
- New-suggestion Discord notifications via Cloudflare Pages env var `DISCORD_SUGGESTIONS_WEBHOOK_URL`.
- Existing sale-alert GitHub Action already uses a separate GitHub secret named `DISCORD_WEBHOOK_URL`.
- Idempotency storage for scheduled automation: `automation_events` table (`UNIQUE (round_id, event_type)`) plus `functions/_lib/db.js` helpers `ensureAutomationEventTable`, `getAutomationEvents`, `recordAutomationEvent` (returns `{ duplicate }` on unique-constraint hits), `toAutomationEvent`, and `isUniqueConstraintError`. Covered by `test/automation-events.test.mjs`.
- Admin automation API surface: `GET /api/admin/round` and `GET /api/admin/round/:id` return `automationEvents`, and `POST /api/admin/automation-event` records an event (admin-only, returns `{ ok, duplicate, id }`, treats a unique-constraint hit as a non-fatal duplicate). Covered by `test/admin-automation-event.test.mjs`.

Now built (Tasks 5-9):

- Automated transition from `suggesting` to `voting` (runner `open_voting`).
- Automated transition from `voting` to `revealed` (runner `reveal_winner`).
- Winner selection in automation (pure `decideRoundActions`, with blocked tie/no-vote handling).
- Discord notifications for phase changes and winners (separate `DISCORD_VOTING_WEBHOOK_URL`).
- Automated use of the selected-game promotion endpoint when the winner is already publish-ready or the winning suggestion can be copied into a publish-ready frontpage card.
- A publication gate for missing manual fields, so automation does not expose an incomplete homepage card (`winnerPublicationPlan`, `mayPromote`).
- Winner handoff generation for any manual fields that still need maintainer review (`buildHandoffMarkdown`, uploaded as a workflow artifact).
- Hourly + manual GitHub Actions workflow driving the runner.

Still deferred:

- Public archive of old rounds.

## Decisions

- Use GitHub Actions for orchestration, not Cloudflare Cron Triggers, because the repo already has scheduled Actions and Node scripts.
- Keep schedule values date-only (`YYYY-MM-DD`) to match the current UI and API. Do not switch the scheduler to ISO timestamp columns.
- Use the explicit `voting_opens_at` date to automate the switch into `voting`.
- Use these default schedule offsets from the meeting date:
  - Suggestions start `2.8` months before.
  - Voting opens `2.5` months before.
  - Voting closes `2.2` months before.
- Use a dedicated GitHub Actions secret named `DISCORD_VOTING_WEBHOOK_URL` for phase/winner announcements. Do not reuse the sale-alert `DISCORD_WEBHOOK_URL`, and do not reuse the Cloudflare Pages suggestion-notification secret.
- Record automation events in D1 so reruns and manual workflow dispatches do not duplicate Discord posts or handoffs.
- Do not auto-open the next round. The maintainer should be able to create a batch of future rounds/meetings ahead of time, then automation operates on those prepared records.
- Treat homepage publication as a separate step from vote-result reveal. The existing selected-game endpoint can make a game public immediately, so the scheduler must either add a draft/not-public promotion mode or only call that endpoint when the selected game will be publish-ready.
- Defer the public archive. The current product need is phase automation and handoff. Archive can be a later project once the result shape and page design are worth exposing.

## Required Secrets

GitHub Actions:

- `VOTING_BASE_URL`: `https://www.gamestormers.dk`
- `VOTING_ADMIN_TOKEN`: same value as Cloudflare Pages `ADMIN_TOKEN`
- `DISCORD_VOTING_WEBHOOK_URL`: Discord webhook for voting phase and winner announcements

Cloudflare Pages:

- `ADMIN_TOKEN`
- `TURNSTILE_SECRET`
- `DISCORD_SUGGESTIONS_WEBHOOK_URL` optional, already used for new suggestions

## File Plan

Create:

- `automation/voting/api-client.mjs`
- `automation/voting/discord.mjs`
- `automation/voting/handoff.mjs`
- `automation/voting/scheduler.mjs`
- `automation/voting/run-scheduler.mjs`
- `automation/voting/*.test.mjs`
- `.github/workflows/voting-automation.yml`

Modify:

- `schema.sql`
- `functions/_lib/db.js`
- `functions/_lib/schedule.js`
- `functions/api/admin/[[route]].js`
- `functions/api/round/current.js`
- `vote-admin.html`
- `js/vote.js`
- `docs/voting-system.md`
- `docs/deployment-guide.md`
- `README.md`

Do not modify for this automation project:

- `index.html`
- `en/index.html`
- `sitemap.xml`
- `AGENTS.md`
- `CLAUDE.md`, unless the actual workflow guidance changes beyond the focused docs

## Task 1: Complete Schedule Metadata

Purpose: make the existing date-only schedule usable for automated phase changes.

- [x] Update existing schema defaults:
  - `suggestions_open_months_before REAL NOT NULL DEFAULT 2.8`
  - `voting_closes_months_before REAL NOT NULL DEFAULT 2.2`
- [x] Add schema columns:
  - `voting_opens_months_before REAL NOT NULL DEFAULT 2.5`
  - `voting_opens_at TEXT`
- [x] Update `ensureRoundScheduleColumns` to add missing schedule columns on older D1 databases:
  - `meeting_date`
  - `suggestions_open_months_before` with default `2.8`
  - `voting_opens_months_before` with default `2.5`
  - `voting_closes_months_before` with default `2.2`
  - `suggestions_open_at`
  - `voting_opens_at`
  - `voting_closes_at`
- [x] Extend `functions/_lib/schedule.js` so `defaultScheduleForMeetingDate()` returns `suggestionsOpenAt`, `votingOpensAt`, and `votingClosesAt`.
- [x] Update schedule constants:
  - `DEFAULT_SUGGESTIONS_OPEN_MONTHS_BEFORE = 2.8`
  - `DEFAULT_VOTING_OPENS_MONTHS_BEFORE = 2.5`
  - `DEFAULT_VOTING_CLOSES_MONTHS_BEFORE = 2.2`
- [x] Keep fractional month handling consistent with the current tests: whole calendar months plus 30-day fractional months, so `2.8` means two calendar months plus 24 days and `2.2` means two calendar months plus 6 days.
- [x] Update `test/round-schedule.test.mjs` for the new default.
- [x] Run `npm test`.

## Task 2: Expose The New Schedule Field

Purpose: let the maintainer inspect and override the automation date.

- [x] Update `functions/api/admin/[[route]].js`:
  - `POST /api/admin/round` accepts `votingOpensMonthsBefore` and `votingOpensAt`.
  - `PATCH /api/admin/round/:id` accepts `votingOpensMonthsBefore` and `votingOpensAt`.
  - `GET /api/admin/round` and `GET /api/admin/round/:id` continue returning raw round rows for admin use.
- [x] Update `functions/api/round/current.js` to expose public-safe `votingOpensMonthsBefore` and `votingOpensAt`.
- [x] Update `vote-admin.html` to show/edit:
  - Suggestions start months before, default `2.8`
  - Voting opens months before
  - Voting opens date, default offset `2.5`
  - Voting closes months before, default `2.2`
- [x] Update `js/vote.js` schedule display to include voting opens.
- [x] No CSS changes were needed, so no stylesheet query-string bump was required.
- [x] Add or extend static tests for admin field wiring if useful.
- [x] Run `npm test`.

## Task 3: Add Automation Event Storage

Purpose: make scheduled and manual reruns idempotent.

- [x] Add `automation_events` to `schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS automation_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id     INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN ('voting_opened','winner_revealed','handoff_generated')),
  payload_json TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (round_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_automation_events_round ON automation_events(round_id, event_type);
```

- [x] Add DB helpers:
  - `ensureAutomationEventTable(db)`
  - `getAutomationEvents(db, roundId)`
  - `recordAutomationEvent(db, roundId, eventType, payload)`
  - duplicate-event detection for D1 unique failures (`isUniqueConstraintError`)
- [x] Add focused tests for helper shaping and duplicate handling.
- [x] Run the local schema once:

```powershell
wrangler d1 execute gamestormers --local --file=./schema.sql
```

- [x] Run `npm test`.

## Task 4: Add Admin Automation API Surface

Purpose: let GitHub Actions operate only through authenticated Pages Functions.

- [x] Extend `GET /api/admin/round` and `GET /api/admin/round/:id` to include `automationEvents`.
- [x] Add `POST /api/admin/automation-event` with body:

```json
{
  "roundId": 19,
  "eventType": "voting_opened",
  "payload": {}
}
```

- [x] Return success for duplicate events without failing the scheduler, but make it clear in JSON that the event already existed (`{ ok: true, duplicate: true, id: null }`).
- [x] Keep this route admin-only via existing bearer auth.
- [x] Add tests for event recording and duplicate behavior where practical (`test/admin-automation-event.test.mjs`).
- [x] Run `npm test`.

## Task 5: Build Scheduler Decisions

Purpose: keep phase decisions pure and testable before wiring network calls.

- [x] Create `automation/voting/scheduler.mjs`.
- [x] Implement `decideRoundActions({ today, round, suggestions, tallies, automationEvents })`.
- [x] Rules:
  - If phase is `suggesting`, `today >= voting_opens_at`, and `voting_opened` is not recorded, return `open_voting`.
  - If phase is `voting`, `today > voting_closes_at`, and `winner_revealed` is not recorded, compute the winner from tallies.
  - If there are no votes, return a blocked/no-op result that explains why.
  - If there is a tie for first place, return a blocked/no-op result that names the tied suggestions.
  - Otherwise return `reveal_winner` with `winnerSuggestionId`.
- [x] Do not close rounds automatically in the first scheduler pass.
- [x] Cover the rules with `node:test`.
- [x] Run `npm test`.

## Task 6: Build API Client And Discord Messages

Purpose: isolate side effects from scheduler logic.

- [x] Create `automation/voting/api-client.mjs`.
- [x] Support:
  - `getCurrentRound()`
  - `getAdminRound(roundId)`
  - `patchRound(roundId, body)`
  - `selectWinner(roundId, suggestionId, options)`
  - `patchMeeting(roundId, body)`
  - `recordAutomationEvent(body)`
- [x] Use bearer auth from `VOTING_ADMIN_TOKEN`.
- [x] Create `automation/voting/discord.mjs`.
- [x] Messages:
  - Voting opened: concise link to `/vote`.
  - Winner revealed: winner title, meeting label, and link to `/vote`.
  - Blocked tie/no-votes: optional maintainer-facing message, only if we choose to alert the admin channel.
- [x] Use `allowed_mentions: { parse: [] }`.
- [x] Test request URLs, headers, JSON bodies, and message payloads.
- [x] Run `npm test`.

## Task 7: Promote Winner And Generate Handoff

Purpose: move the winning suggestion toward the database-backed homepage without losing maintainer control over incomplete public meeting cards.

- [x] Create `automation/voting/handoff.mjs`.
- [x] Add a pure `winnerPublicationPlan({ roundPayload, winnerSuggestionId })` helper that reports:
  - whether the winner is already selected (`winnerAlreadySelected`, plus a `conflict` flag when a different suggestion is attached)
  - whether the selected game is publish-ready (`publishReady`)
  - which manual fields are missing from `publishReadiness` (`missing`)
  - whether automation may safely call selected-game promotion (`mayPromote`, with `needsHandoff` and a human-readable `reason`)
- [x] Before enabling scheduled promotion, add one of these safety paths:
  - extend `POST /api/admin/round/:id/select` with a draft/not-public mode that copies the winner into `games` and `meetings` without exposing it through `/api/meetings/public`
  - or call promotion only when the winner is already publish-ready or the winning suggestion can be copied into a publish-ready card
  - Chosen: auto-promote only when safe. `mayPromote` is true when the winner is already selected and the card is publish-ready (an idempotent re-confirm), or when the unselected winning suggestion already has every frontpage field that promotion copies into `games`. The planner directly requires HowLongToBeat URL and playtime hours in addition to the other homepage card fields. A game freshly copied from a suggestion can still lack manual fields such as HowLongToBeat data, GOG product ID, or localized event copy, so incomplete reveal flows still write a handoff instead of publishing.
- [x] When promotion is allowed, call the existing selected-game API instead of editing `games` / `meetings` directly. (Done in Task 8: the runner calls `client.selectWinner` only when `plan.mayPromote` is true.)
- [x] After promotion, refetch the admin round payload and use `publishReadiness` to decide whether a handoff artifact is needed. (Done in Task 8: the runner re-fetches via `getAdminRound`, recomputes the plan, and only writes a handoff when `plan.needsHandoff` is true.)
- [x] Generate Markdown containing:
  - Meeting number/title/date
  - Winner title
  - Steam app ID and store URL
  - GOG URL if present
  - Banner image URL
  - Genres/platforms
  - Pitch and suggested-by
  - Current vote tally
  - `publishReadiness.missing`
  - Explicit HowLongToBeat and localized-description reminders when missing
  - Checklist pointing to `MEETING_WORKFLOW.md`
- [x] Write the handoff to a temporary workflow path such as `automation-output/meeting-19-winner.md`. (`writeHandoff` + `handoffArtifactPath` provide this; the runner calls them in Task 8.)
- [x] Upload it as a GitHub Actions artifact. Do not commit it from the scheduled workflow. (Done in Task 9: the workflow uploads `automation-output/*.md`; `automation-output/` is gitignored so it is never committed.)
- [x] Test the publication planner and Markdown builder. (`automation/voting/handoff.test.mjs`, 12 cases.)
- [x] Run `npm test`.

## Task 8: Wire The Runner

Purpose: execute the decisions safely from GitHub Actions.

- [x] Create `automation/voting/run-scheduler.mjs`.
- [x] Required env:
  - `VOTING_BASE_URL`
  - `VOTING_ADMIN_TOKEN`
- [x] Optional env:
  - `DISCORD_VOTING_WEBHOOK_URL`
- [x] Flow:
  1. Fetch current admin round state.
  2. Decide actions.
  3. For `open_voting`, patch the round phase to `voting`, record `voting_opened`, then post Discord.
  4. For `reveal_winner`, patch winner + phase to `revealed`, record `winner_revealed`, then post Discord.
  5. Run the winner publication planner.
  6. If promotion is allowed, call the selected-game API, refetch the admin payload, and generate a handoff only when manual fields remain missing.
  7. If promotion is not allowed, generate the handoff and leave homepage publication to `MEETING_WORKFLOW.md`.
  8. Record `handoff_generated` when an artifact is produced.
  9. For blocked states, log clearly and exit 0 so the schedule does not become noisy.
- [x] Prefer patching phase before posting Discord so a failed rerun does not repeat a successful announcement. (The `recordAutomationEvent` `{ duplicate }` result is the test-and-set lock: only the run that first records the event posts the announcement.)
- [x] If event recording fails after a successful phase patch, log loudly because the next manual rerun may need maintainer attention. (`patchPhaseAndRecord` logs an error and re-throws so it surfaces as a red run.)
- [x] Test env validation and runner behavior with mocked client/Discord/handoff dependencies. (`automation/voting/run-scheduler.test.mjs`, 10 cases.)
- [x] Run `npm test`.

## Task 9: Add GitHub Actions Workflow

Purpose: run the automation on a predictable cadence and manually on demand.

- [x] Create `.github/workflows/voting-automation.yml`.
- [x] Use:

```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: "0 7 * * *"
```

- [x] Use Node 24 to match current GitHub Actions examples in the repo.
- [x] Run `npm test` before the scheduler.
- [x] Run `node automation/voting/run-scheduler.mjs`.
- [x] Upload handoff Markdown artifacts when generated. (`actions/upload-artifact@v4` with `path: automation-output/*.md` and `if-no-files-found: ignore` so no-op runs stay green.)
- [x] Keep permissions minimal:
  - `contents: read`
  - `actions: read` (artifact upload uses the run token and needs no more)
- [x] Do not grant `contents: write` unless a later task intentionally creates PRs.

## Task 10: Documentation And Verification

Purpose: keep project memory aligned with the implemented workflow.

- [x] Update `docs/voting-system.md`:
  - document `voting_opens_at`
  - document automation events
  - document scheduler behavior and blocked tie/no-vote behavior (added a runner-flow/idempotency and scheduled-workflow subsection)
  - keep suggestion notifications separate from voting phase notifications
- [x] Update `docs/deployment-guide.md`:
  - add the GitHub Actions secrets (new "Voting Automation (GitHub Actions)" section)
  - mention remote schema migration when deploying the new D1 columns/table
- [x] Update `README.md` automation section.
- [x] Run:

```powershell
npm test
node --check automation/voting/run-scheduler.mjs
node --check automation/voting/api-client.mjs
node --check automation/voting/discord.mjs
node --check automation/voting/handoff.mjs
node --check automation/voting/scheduler.mjs
```

All passed: 100 tests green, all five modules syntax-clean. The runner CLI also fails fast (exit 1) on missing env.

- [~] Local Pages verification (`wrangler d1 execute ... --file=./schema.sql`, `npm run dev`) and browser checks of `vote.html` / `en/vote.html` / `vote-admin.html`: not applicable to the Task 8-10 work. The runner is a standalone Node script run by GitHub Actions, not by Pages, and Tasks 8-10 added no HTML/JS/Pages-Function changes. The vote pages and APIs were already verified as part of Tasks 1-7. The runner is covered by unit tests plus a CLI smoke test. Before the scheduled workflow is trusted in production, run it once via `workflow_dispatch` (see Deployment Notes).

## Deployment Notes

- Apply the D1 migration remotely only when ready:

```powershell
wrangler d1 execute gamestormers --remote --file=./schema.sql
```

- Add GitHub Actions secrets before enabling the scheduled workflow.
- Run `workflow_dispatch` once against a test/current round before trusting the daily automation.
- Confirm the Discord webhook posts to the intended voting announcement channel.
- Keep final event publication manual through `MEETING_WORKFLOW.md`.

## Deferred To Later Projects

- Public archive of old revealed/closed voting rounds.
- Automatic creation of the next round.
- Draft PR creation for winner handoff files.
- Identity-backed one-vote-per-person enforcement.
- Automatic HowLongToBeat lookup.
