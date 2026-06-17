# Game Suggestion And Voting System

The voting feature is a members-driven flow for choosing the next meeting's game:

```text
suggestions open -> maintainer curates -> voting opens -> result revealed
```

It is the site's only dynamic feature. It runs on Cloudflare Pages Functions and D1, same-origin under `/api/*`. The design is privacy-first: no third-party cookies and no stored IPs.

## Architecture

- Frontend: `vote.html`, `en/vote.html`, and `js/vote.js`.
- Backend: Cloudflare Pages Functions in `functions/api/*`.
- Shared backend helpers: `functions/_lib/`.
- Storage: Cloudflare D1 with schema in `schema.sql`.
- Admin UI: `vote-admin.html`, unlisted, `noindex`, gated by Bearer `ADMIN_TOKEN`.

`js/vote.js` is bilingual via `STRINGS[lang]`. It renders suggestion, voting, and result states based on the current round phase.

## D1 Tables

- `rounds`: meeting round, meeting date, schedule windows, phase, winner, and storm code.
- `meetings`: public meeting basics for the homepage and history flow. `meetings.id` matches `rounds.id`.
- `games`: reusable selected-game metadata for public event and history cards.
- `meeting_copy`: localized public event/history copy for a meeting.
- `suggestions`: submitted games and imported metadata.
- `votes`: approval-voting rows, one row per selected game, with optional self-reported `voter_name`.
- `automation_events`: idempotency log for the voting scheduler. One row per automated action on a round, with a `UNIQUE (round_id, event_type)` constraint so reruns cannot duplicate a Discord post or handoff.

## API Routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/round/current` | GET | Current round and approved cards. Tallies are only exposed when revealed. The storm code is never exposed. Also returns `nextRound` (public metadata for the next round, if one exists) for the vote page's next-round notice. |
| `/api/meetings/public` | GET | Public-safe meeting data for the homepage: `upcoming`, `history`, and `planned` groups with their selected games and localized copy. Drives `js/meetings.js`. Storm codes, ballots, and pending/rejected suggestions are never exposed. |
| `/api/suggest` | POST | Submit a suggestion. Steam suggestions are imported server-side and auto-approved. Non-Steam suggestions are pending until maintainer approval. |
| `/api/vote` | POST | Cast an approval ballot with optional voter name. |
| `/api/admin/round` | GET/POST/PATCH | Read full round, open a new round, change phase, winner, code, meeting date, schedule windows, or public meeting basics. The GET response also includes the selected game, localized meeting copy, a publish-readiness check, and the round's `automationEvents`. |
| `/api/admin/round/:id/select` | POST | Promote a suggestion to the meeting's selected game (body: `suggestionId`). Copies the suggestion into `games`, attaches it to the meeting, confirms `winner_suggestion_id`, and reveals the round unless it is already closed. |
| `/api/admin/meeting/:id` | PATCH | Edit the selected game's public metadata (GOG URL/ID, HowLongToBeat URL/hours, genres, platforms, title, cover, store URL, price) and the localized event/history descriptions in `meeting_copy`. |
| `/api/admin/suggestion/:id` | PATCH/DELETE | Approve, reject, edit, or delete a suggestion. |
| `/api/admin/ballot/:ballotId` | DELETE | Remove a single ballot and all its votes. |
| `/api/admin/automation-event` | POST | Record a scheduler automation event (body: `roundId`, `eventType`, optional `payload`). `eventType` is one of `voting_opened`, `winner_revealed`, `handoff_generated`. Returns `{ ok, duplicate, id }`; a repeat of an already-recorded event returns `{ ok: true, duplicate: true, id: null }` instead of failing. |

## Phases

Valid `rounds.phase` values:

```text
suggesting -> voting -> revealed -> closed
```

The current round is the row with the highest `id`, which also maps to the meeting number.

When the admin opens a round, the API also creates or updates the matching `meetings` row. The same numeric id is used for both records. The round keeps voting-specific fields such as the storm code, phase, and schedule offsets. The meeting stores public event basics: meeting date, Copenhagen-local start/end times converted to UTC, venue name, venue address, Discord invite, timezone, and public meeting status.

`vote-admin.html` shows whether each round has a public meeting record. Saving a round with meeting basics updates the matching meeting record, which lets older rounds be repaired without touching the database manually.

## Selecting The Winning Game

Once a winner is known, the maintainer promotes it from the "Selected game" section of `vote-admin.html` (or via `POST /api/admin/round/:id/select`). Promotion:

- Copies the chosen suggestion's metadata into a `games` row (re-promoting reuses the same row instead of creating duplicates).
- Sets `meetings.selected_game_id` and `meetings.selected_suggestion_id`.
- Confirms `rounds.winner_suggestion_id`.
- Moves the round to `revealed` and the meeting to the matching status, unless the round is already `closed`.

After promotion, the maintainer fills in fields that have no Steam source: GOG URL and product ID, HowLongToBeat URL and hours, genres/platforms corrections, and the localized event/history descriptions stored in `meeting_copy`. These edits go through `PATCH /api/admin/meeting/:id`.

The admin GET responses include a `publishReadiness` object (`{ ready, missing }`). A homepage card is not considered publish-ready until the selected game has a title, cover image, store link, genres, platforms, playtime hours, a HowLongToBeat URL, and event descriptions in both Danish and English. The "Selected game" section surfaces this so a card is not revealed publicly with missing fields. Non-Steam suggestion approval stays manual; promotion does not change a suggestion's approval status.

## Public Meetings And Homepage

`GET /api/meetings/public` is the read side that the homepage uses. It joins `meetings` to their selected
`games` and `meeting_copy`, hides cancelled meetings, and groups the rest:

- `upcoming`: future meetings that have a selected game (rendered as event cards).
- `history`: past meetings (`ends_at_utc` already passed) that have a selected game, newest first.
- `planned`: future meetings with no selected game yet, returned as lightweight metadata only.

`js/meetings.js` fetches this route, renders the event/history cards and JSON-LD for both languages, and leaves
the static fallback shell in place only while the API has no selected meeting content. Once D1 returns selected
meetings, empty `upcoming` or `history` groups clear the matching static fallback cards so old events do not stay
visible. See [`project-guide.md`](project-guide.md) and [`content-guide.md`](content-guide.md).

### Next-round notice

`GET /api/round/current` includes a `nextRound` object — `{ id, title, meetingDate, suggestionsOpenAt,
votingOpensAt, votingClosesAt }` — built from the next round whose id is greater than the current round (storm code excluded).
When the current round is revealed or voting has closed, `js/vote.js` shows this as a bilingual "next round"
notice. Because the current round is the highest-id round today, `nextRound` is normally `null`; the field is
forward-compatible groundwork for the Voting Scheduler And Handoff project, where pre-created future rounds can populate it.

## Round Schedule

Each round can be attached to a `meeting_date` (`YYYY-MM-DD`). When the admin creates a round with a meeting date, the system defaults:

- `suggestions_open_months_before`: `2.8`
- `voting_opens_months_before`: `2.5`
- `voting_closes_months_before`: `2.2`
- `suggestions_open_at`: derived from the meeting date and suggestion lead time.
- `voting_opens_at`: derived from the meeting date and voting-open lead time.
- `voting_closes_at`: derived from the meeting date and voting close lead time.

The public vote page shows the meeting date and the resulting suggestion/voting dates. The editable month offsets stay admin-facing on `vote-admin.html`. Fractional months are converted as 30-day fractions, so `2.5` means two calendar months plus 15 days and `2.8` means two calendar months plus 24 days. The admin still controls the phase manually (`suggesting -> voting -> revealed -> closed`), but the API enforces the schedule boundaries:

- Suggestions are rejected before `suggestions_open_at` when the round is in `suggesting`.
- Votes are rejected before `voting_opens_at` when the round is in `voting`.
- Votes are rejected after `voting_closes_at` when the round is in `voting`; the close date itself is inclusive for the whole day.

## Automation Events

The `automation_events` table is the idempotency log for the planned voting scheduler. Each row records one automated action taken on a round, keyed by a `UNIQUE (round_id, event_type)` constraint. `event_type` is constrained to `voting_opened`, `winner_revealed`, or `handoff_generated`, and an optional JSON `payload` can capture context (for example, whether a Discord post was sent).

The `functions/_lib/db.js` helpers manage this table:

- `ensureAutomationEventTable(db)` creates the table and index on demand, matching the lazy-provisioning pattern used by the other `ensure*` helpers.
- `getAutomationEvents(db, roundId)` returns shaped events (`{ id, roundId, eventType, payload, createdAt }`, payload parsed from JSON), oldest first.
- `recordAutomationEvent(db, roundId, eventType, payload)` inserts an event and returns `{ duplicate, id }`. A unique-constraint hit is reported as `{ duplicate: true, id: null }` rather than thrown, so a rerun is a safe no-op. `isUniqueConstraintError(err)` distinguishes that case from real DB errors, which still propagate.

The scheduler reaches this only through the admin API (`GET /api/admin/round` exposes `automationEvents`; `POST /api/admin/automation-event` records them), never by touching D1 directly. This keeps all automation authenticated through the existing Bearer `ADMIN_TOKEN` gate.

## Vote Integrity

The system deliberately uses lightweight safeguards:

- Per-round storm code as a soft Discord gate.
- Cloudflare Turnstile for bot checks.
- Random `ballot_id` returned to the client and stored in localStorage only for "you already voted" UX.

The `ballot_id` is not an identity system and is not enforced server-side as one-vote-per-person. That is intentional. Stronger enforcement would require identity such as Discord login, which is out of scope.

Admin moderation compensates for the low-friction flow:

- Admin can see full per-ballot breakdown at any phase.
- Admin can see live tallies.
- Admin can delete suspicious ballots.
- Ballot names are rendered with `textContent`, never `innerHTML`.

## Suggestion Curation

Member-facing suggestion guidelines:

- Games must be playable on PC.
- The usual target is about 10 hours or less to finish.
- Longer games and open-ended games are allowed when the pitch clearly says so.
- The vote page links to upcoming games and the history section so members can avoid suggesting games already scheduled or played.

Steam suggestions:

- User submits a Steam store URL.
- Backend imports title, banner, genres, platforms, price, and short descriptions.
- Descriptions are fetched in English and Danish and stored as `description_en` and `description_da`.
- Suggestions are auto-approved and visible immediately.
- Admin can still edit, reject, or delete them.

Non-Steam suggestions:

- User enters title, store link, genres, and pitch.
- Suggestion is stored as `pending`.
- It stays hidden until the maintainer verifies it and adds/approves an image.

HowLongToBeat has no API in this project. `playtime_hours` is filled manually by the maintainer during curation.

## Turnstile

`vote.html` and `en/vote.html` carry the public production `data-turnstile-sitekey` on `#vote-app`.

`js/vote.js` overrides that sitekey on `localhost`, `127.0.0.1`, and `0.0.0.0` with Cloudflare's always-pass visible test sitekey, `1x00000000000000000000AA`.

Keep the matching secret in Cloudflare Pages as `TURNSTILE_SECRET`. Local development can use Cloudflare's always-pass test secret in `.dev.vars`.

## Suggestion Notifications

When `DISCORD_SUGGESTIONS_WEBHOOK_URL` is set, `/api/suggest` posts a Discord message for every new suggestion (see `functions/_lib/notify.js`):

- Steam suggestions (auto-approved): "live on the voting board", with a link to the public `/vote` page.
- Non-Steam suggestions (`pending`): flagged as needing approval, with a link to the `/vote-admin/` page.

Links point at the live site (`SITE_URL` in `functions/api/suggest.js`), not the request origin, so they stay correct even when a notification fires from a local dev test.

It is fire-and-forget via `waitUntil`, so a slow or failing webhook never blocks or breaks the suggestion submission. The secret is optional: if it is unset, notifications are skipped and everything else works unchanged. `allowed_mentions` is empty so a game title can never ping the channel.

Create the webhook in Discord under Server Settings, Integrations, Webhooks, then store the URL as `DISCORD_SUGGESTIONS_WEBHOOK_URL` (encrypted env var in Cloudflare Pages, and in `.dev.vars` for local testing). This is a separate secret from the sales-alert workflow's `DISCORD_WEBHOOK_URL` (a GitHub Actions secret), so the two can post to different channels.

## Local Development

```powershell
wrangler d1 create gamestormers
wrangler d1 execute gamestormers --local --file=./schema.sql
npm run dev
```

Create `.dev.vars` with:

```text
TURNSTILE_SECRET=...
ADMIN_TOKEN=test
DISCORD_SUGGESTIONS_WEBHOOK_URL=...   # optional; enables suggestion notifications
```

Open:

- `http://127.0.0.1:8788/vote.html`
- `http://127.0.0.1:8788/en/vote.html`
- `http://127.0.0.1:8788/vote-admin.html`

Use `test` for the admin page when using the local `.dev.vars` value.

Apply the schema to production only when intentionally changing production D1:

```powershell
wrangler d1 execute gamestormers --remote --file=./schema.sql
```

## Voting Scheduler Modules

The Voting Scheduler And Handoff project lives under `automation/voting/` as plain Node ES modules (run by GitHub Actions, not by Pages Functions). They are kept side-effect-free where possible so the decision rules stay testable. Each module has a sibling `*.test.mjs` run by `npm test`.

- `scheduler.mjs`: pure `decideRoundActions({ today, round, suggestions, tallies, automationEvents })`. Given a round's current state it returns one decision:
  - `open_voting` when the round is `suggesting`, `today` has reached `voting_opens_at` (inclusive), and `voting_opened` is not already recorded.
  - `reveal_winner` (with `winnerSuggestionId` and the winning `{ id, title, votes }`) when the round is `voting`, `today` is past `voting_closes_at` (the close date is still an open voting day), `winner_revealed` is not recorded, and the tally has a single clear leader.
  - `blocked` when a reveal is due but cannot complete automatically: `no_votes` (no ballots) or `tie` (the reason names the tied suggestions). The runner should log these and leave the round for the maintainer.
  - `noop` otherwise (nothing due, the event is already recorded, or the phase is `revealed`/`closed`). The scheduler never closes a round automatically.
  The date comparisons reuse `functions/_lib/schedule.js` so they match the public schedule boundaries exactly.
- `api-client.mjs`: `createApiClient({ baseUrl, adminToken, fetch })` wraps the admin API (`getCurrentRound`, `getAdminRound`, `patchRound`, `selectWinner`, `patchMeeting`, `recordAutomationEvent`). Both reads use the admin endpoints because the scheduler needs tallies and `automationEvents`, which the public `/api/round/current` withholds. Every call sends `Authorization: Bearer <VOTING_ADMIN_TOKEN>` (the same value as the Cloudflare Pages `ADMIN_TOKEN`).
- `discord.mjs`: pure message builders (`votingOpenedMessage`, `winnerRevealedMessage`, `blockedMessage`) plus `postDiscord`, which sends a `{ content, allowed_mentions: { parse: [] } }` payload and is a no-op without a webhook URL. These phase/winner announcements use their own webhook, `DISCORD_VOTING_WEBHOOK_URL` (a GitHub Actions secret), kept separate from the new-suggestion `DISCORD_SUGGESTIONS_WEBHOOK_URL` and the sale-alert `DISCORD_WEBHOOK_URL`.

Not built yet: the runner (`run-scheduler.mjs`) that wires these together, automated selected-game promotion with publication gating, winner handoff artifacts for missing manual fields, and the GitHub Actions workflow that drives them on a schedule. Playtime should stay manual unless a reliable source becomes available. (New-suggestion Discord notifications are built, see Suggestion Notifications above.)
