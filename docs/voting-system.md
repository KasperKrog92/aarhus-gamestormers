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
- Admin UI: `vote-admin.html`, kept out of navigation and search (`noindex`, disallowed in `robots.txt`) but reachable via a hidden footer link (the "o" in "Gamestormers"), and gated by Bearer `ADMIN_TOKEN`.

`js/vote.js` is bilingual via `STRINGS[lang]`. It renders suggestion, voting, and result states based on the current round phase.

### Public vote board UI

The green round hero and cream phase timeline stay shared across phases. The dark board below them changes with the round:

- Suggesting uses closed native disclosures for the Steam/manual suggestion forms and for owner-only pitch/name management. Suggestion cards remain readable without login and use a branded placeholder when no cover image exists.
- Voting uses a two-column game slate and sticky ranked-ballot panel on desktop, collapsing to one column on smaller screens. Logged-out and non-member visitors see the same slate without ranking controls.
- Revealed rounds lead with a dedicated winner block, then show the aggregate instant-runoff rounds and the next-round notice. Ranked winners use the final-round count; legacy approval rounds keep their generic aggregate count. Winner artwork has the same no-image fallback as suggestion cards.

These public-board styles are scoped under `.gs-vote-page` in `css/style.css`; `vote-admin.html` keeps its separate card and form contracts.

## Text Field Hardening

All user-supplied text is sanitized server-side before it is stored, through helpers in `functions/_lib/http.js`:

- `clean(value, maxLen)` trims, caps length, and strips control characters plus invisible/bidirectional formatting characters (zero-width spaces, joiners, BOM, RTL override, etc.) that enable invisible content or "Trojan Source" spoofing. Tabs and line breaks are preserved, so multi-line fields (pitches, descriptions) keep their formatting.
- `cleanLine(value, maxLen)` does the same but also collapses every run of whitespace (including newlines) to a single space. It is used for single-line fields, such as a game title or suggester name, so a value cannot smuggle line breaks into a Discord notification or break a card's layout.

Every URL field is scheme-checked with the shared `isHttpUrl(value)` helper in `functions/_lib/http.js` so only `http(s)` URLs are accepted as hrefs and a `javascript:`/`data:` value is rejected with a `400`. This covers the member store link in `/api/suggest` and the admin-entered links in `PATCH /api/admin/meeting/:id`, `PATCH /api/admin/suggestion/:id`, and the meeting Discord invite/event URLs. On output, every renderer (`js/vote.js`, `js/meetings.js`, `vote-admin.html`) writes user text via `textContent` or explicit HTML escaping, never raw `innerHTML`.

### Request Hardening

`readJson(request, maxBytes = 32768)` is the single entry point for parsing write-route bodies. It enforces:

- **Media type:** a request without `Content-Type: application/json` is rejected with `415 Unsupported Media Type`.
- **Size:** a `Content-Length` over the 32 KB limit is rejected up front, and the body stream is read chunk by chunk and cancelled once the running total exceeds the limit, both returning `413 Payload Too Large`. This stops a Worker from buffering an oversized body into memory.
- **Shape:** a body that is not valid JSON returns `400 Bad Request`.

On any of these, `readJson` returns a `Response` object instead of the parsed body. Every write route checks `if (body instanceof Response) return body;` immediately after calling it, so the correct status reaches the client. The frontend (`js/vote.js`), admin UI (`vote-admin.html`), and the scheduler API client (`automation/voting/api-client.mjs`) all send `Content-Type: application/json` on every request with a body, so this enforcement is transparent to legitimate callers.

The admin Bearer-token gate (`isAdmin` in `functions/_lib/auth.js`) compares the supplied token against `ADMIN_TOKEN` in constant time: both sides are hashed to fixed-length SHA-256 digests and compared with `crypto.subtle.timingSafeEqual` (a Cloudflare Workers extension), falling back to a constant-time byte loop where that is unavailable (e.g. Node.js tests), so neither the token length nor a partial match leaks through response timing. The fallback avoids importing `node:crypto`, which keeps the Worker bundle free of the `nodejs_compat` requirement.

## D1 Tables

- `rounds`: meeting round, meeting date, schedule windows, phase, and winner. `storm_code` is a legacy unused column kept for compatibility.
- `meetings`: public meeting basics for the homepage and history flow. `meetings.id` matches `rounds.id`.
- `games`: reusable selected-game metadata for public event and history cards.
- `meeting_copy`: localized public event/history copy for a meeting.
- `suggestions`: submitted games, imported metadata, the authenticated Discord user id, and the member's public display-name preference.
- `votes`: ranked-choice ballot rows, one row per ranked game with a `rank` (1 = first preference). A member's ballot is the set of rows sharing a `ballot_id`, read in `rank` order. Votes are associated with the authenticated Discord user so one member has one replaceable ballot per round. Pre-RCV approval rows (none in production) leave `rank` NULL and fall back to aggregate counts.
- `discord_users`, `auth_sessions`, `oauth_states`: minimal Discord OAuth login data. OAuth access tokens and guild lists are not stored.
- `automation_events`: idempotency log for the voting scheduler. One row per automated action on a round, with a `UNIQUE (round_id, event_type)` constraint so reruns cannot duplicate a Discord post or handoff.

## API Routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/round/current` | GET | Current round and approved cards. Per-candidate counts and the round-by-round `rcvResult` are only exposed when revealed. Always returns `round.ballotCount` (distinct ballots submitted) as turnout, which is safe to show during voting because it reveals how many voted, never which game leads. Also returns `stats` (`{ games, people }`: count of approved suggestions and distinct suggesters, by Discord user id, with no ids exposed) for the suggestions-phase social-proof card, and `nextRound` (public metadata for the next round, if one exists) for the vote page's next-round notice. |
| `/api/meetings/public` | GET | Public-safe meeting data for the homepage: `upcoming`, `history`, and `planned` groups with their selected games and localized copy. Drives `js/meetings.js`. Ballots, Discord ids, and pending/rejected suggestions are never exposed. |
| `/api/auth/discord/start` | GET | Starts Discord OAuth with `identify guilds`, stores a short-lived state nonce, and redirects to Discord. |
| `/api/auth/discord/callback` | GET | Validates OAuth state, exchanges the code, reads `/users/@me` and `/users/@me/guilds`, stores only the user id/display data/membership flag, creates a hashed-session cookie, and discards the OAuth token and guild list. |
| `/api/auth/session` | GET | Returns the current logged-in UI state and Discord invite link. |
| `/api/auth/logout` | GET/POST | Deletes the current session and clears the session cookie. |
| `/api/auth/dev-login` | GET | Local-only testing shortcut that mints a fake member session without Discord OAuth, then redirects to `/vote`. Gated behind `DEV_LOGIN=true` in `.dev.vars` (absent in production) plus a localhost host check, so it returns 404 anywhere else. `?member=0` simulates a non-member; `?returnTo=` sets the post-login path. See CLAUDE.md "Local Preview". |
| `/api/suggest` | POST | Submit a suggestion. Requires Discord login and membership in the Aarhus Gamestormers server. Steam suggestions are imported server-side and auto-approved. Non-Steam suggestions are pending until maintainer approval. |
| `/api/suggestions/mine` | GET | Return the logged-in member's suggestions for the current round, including status and public display-name preference. Discord ids are never returned. |
| `/api/suggestions/:id` | PATCH | Let the original logged-in suggester change their own suggestion: the `showName` preference in any voting phase, and the `pitch` only while suggestions are open for the current round. Ownership comes from the authenticated Discord session. |
| `/api/vote` | POST | Cast a ranked ballot (body: `{ rankings: number[] }`, ordered top preference first; `suggestionIds` is accepted as a transitional alias). Ids are coerced to integers, filtered to approved suggestions, de-duplicated preserving first occurrence, and rejected if empty. Requires Discord login and membership in the Aarhus Gamestormers server. Re-submitting replaces that Discord user's previous ballot for the round, writing one row per ranked id with `rank = index + 1`. |
| `/api/vote/mine` | GET | Return the logged-in member's current ranking for the current round (`{ rankings: number[] }`, ordered by rank) so the vote UI can pre-fill and edit it. Member-only; never returns other members' ballots. |
| `/api/admin/round` | GET/POST/PATCH | Read full round, open a new round, change phase, winner, meeting date, schedule windows, Discord event URL, or public meeting basics. The GET response also includes the selected game, localized meeting copy, publish-readiness and Discord-announcement readiness checks, the round's `automationEvents`, first-preference `tallies`, and the aggregate `rcvResult` (round-by-round instant-runoff result, including a `blocked` tie/no-ballots state) used by the admin Votes section and the scheduler. |
| `/api/admin/round/:id` | DELETE | Delete the voting round (cascades to its suggestions and votes). The matching public `meetings` row is removed only while it is unpublished, i.e. no game has been selected (`selected_game_id IS NULL`); a published meeting (game selected, so it shows as a homepage upcoming/history card) is kept. Cancelling or removing a published meeting is a separate, future admin action. |
| `/api/admin/round/:id/select` | POST | Promote a suggestion to the meeting's selected game (body: `suggestionId`). Copies the suggestion into `games`, attaches it to the meeting, confirms `winner_suggestion_id`, and reveals the round unless it is already closed. |
| `/api/admin/round/:id/announce-winner` | POST | Post the final public Discord winner/meeting announcement after the round is revealed and all announcement fields are ready. Records `winner_announcement_posted` so the button is idempotent. Requires `DISCORD_VOTING_WEBHOOK_URL` in Cloudflare Pages. |
| `/api/admin/meeting/:id` | PATCH | Edit the selected game's public metadata (GOG URL/ID, HowLongToBeat URL/hours, genres, platforms, title, cover, store URL, price) and the localized event/history descriptions in `meeting_copy`. |
| `/api/admin/suggestion/:id` | PATCH/DELETE | Approve, reject, edit, or delete a suggestion. |
| `/api/admin/ballot/:ballotId` | DELETE | Remove a single ballot and all its votes. |
| `/api/admin/automation-event` | POST | Record a scheduler automation event (body: `roundId`, `eventType`, optional `payload`). Valid `eventType` values are `suggestions_opened`, `voting_opened`, `winner_revealed`, `blocked_alerted`, `winner_setup_needed_alerted`, `winner_announcement_posted`, and `handoff_generated`. Returns `{ ok, duplicate, id }`; a repeat of an already-recorded event returns `{ ok: true, duplicate: true, id: null }` instead of failing. |

## Phases

Valid `rounds.phase` values:

```text
suggesting -> voting -> revealed -> closed
```

### Current round selection and the rolling pipeline

The "current" round is the earliest round (lowest `id`, which also maps to the meeting number) that has not been closed. This selection drives the public vote page, the `/api/suggest` and `/api/vote` targets, the admin default view, and the scheduler's per-pass round. With a pre-created pipeline of future rounds (e.g. meetings 19-22), the soonest meeting is the focus and the cycle rolls forward on its own:

1. **Before suggestions open**: the next meeting is shown with its meeting date and the date suggestions open. Phase is `suggesting`; the schedule gate (`suggestionsAreOpen`) keeps the form closed until `suggestions_open_at`.
2. **Suggestions open**: members suggest; the date voting opens is shown.
3. **Voting open** (`voting`, set by the scheduler at `voting_opens_at`): members vote; the date voting closes is shown.
4. **Revealed** (set by the scheduler after `voting_closes_at`): the winning game is shown, along with the next round's suggestion-open date via the next-round notice. The winner stays the vote page's focus through this phase.
5. **Closed**: the round closes at the **halfway point** between its `voting_closes_at` and the next round's `suggestions_open_at`. From then on the winner is no longer shown on the vote page and the next round becomes current, starting the cycle again.

`getCurrentRound` performs the close lazily: on every read it first runs `closeDueRevealedRounds`, which moves any `revealed` round to `closed` once that halfway point has passed (only when a later round exists with both dates set, so the last revealed round keeps showing its winner until a successor is created). This makes the vote page deterministic regardless of when the daily scheduler runs. If every round is closed, `getCurrentRound` falls back to the highest `id` so the most recent result still shows.

The halfway midpoint is computed by `midpointDateOnly(voting_closes_at, nextSuggestionsOpenAt)` in `functions/_lib/schedule.js`. `voting_closes_at` is used as the reveal anchor because the winner is revealed when voting closes and it is a stable stored value.

Promoting the winner to a public upcoming-event card on the homepage is automatic only when the winning suggestion already has every field the homepage card requires (see [Selecting The Winning Game](#selecting-the-winning-game) and `MEETING_WORKFLOW.md`). If the copied game would lack HowLongToBeat data, localized descriptions, or other required fields, the scheduler reveals the winner and writes a handoff instead of publishing an incomplete card.

When the admin opens a round, the API also creates or updates the matching `meetings` row. The same numeric id is used for both records. The round keeps voting-specific fields such as phase and schedule offsets. The meeting stores public event basics: meeting date, Copenhagen-local start/end times converted to UTC, venue name, venue address, Discord invite, timezone, and public meeting status.

`vote-admin.html` shows whether each round has a public meeting record. Saving a round with meeting basics updates the matching meeting record, which lets older rounds be repaired without touching the database manually.

## Selecting The Winning Game

Once a winner is known, the maintainer promotes it from the "Selected game" section of `vote-admin.html` (or via `POST /api/admin/round/:id/select`). Promotion:

- Copies the chosen suggestion's metadata into a `games` row (re-promoting reuses the same row instead of creating duplicates).
- Sets `meetings.selected_game_id` and `meetings.selected_suggestion_id`.
- Confirms `rounds.winner_suggestion_id`.
- Moves the round to `revealed` and the meeting to the matching status, unless the round is already `closed`.

Before promotion, the maintainer can curate a suggestion's GOG URL, HowLongToBeat URL, playtime hours, genres, platforms, and descriptions. Promotion copies those suggestion fields into the selected game. After promotion, the maintainer fills any remaining selected-game fields such as GOG product ID and localized event/history descriptions stored in `meeting_copy`. These edits go through `PATCH /api/admin/meeting/:id`.

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
votingOpensAt, votingClosesAt }` — built from the next round whose id is greater than the current round.
When the current round is revealed or voting has closed, `js/vote.js` shows this as a bilingual "next round"
notice. With a pre-created pipeline of future rounds, `nextRound` points at the round after whichever one is
currently active.

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

### Schedule timezone and live opening

All schedule boundaries are whole-day comparisons evaluated in the club's local timezone (`Europe/Copenhagen`), not UTC. `todayDateOnly` in `functions/_lib/schedule.js` resolves "today" to the Danish calendar day, so every boundary that flows through `roundScheduleState` (`suggestionsAreOpen`, `votingHasStarted`, `votingIsOpen`), the scheduler, and `closeDueRevealedRounds` flips at local midnight, instead of UTC midnight (02:00 in Denmark during summer time).

Suggestions opening is a pure date boundary inside the `suggesting` phase, so it goes live the instant the local day reaches `suggestions_open_at`, independent of the scheduler. The Discord "suggestions open" announcement is separate: the scheduler posts it at 09:00 Europe/Copenhagen, so the form can be open for hours before the announcement. Voting opening and the winner reveal are scheduler-driven phase changes, so they happen on the 09:00 run rather than at midnight.

The on-page countdowns in `js/vote.js` reflect this split: the suggestions-open countdown targets local midnight (the boundary really does flip then), while the voting-opens countdown targets 09:00 local (`SCHEDULER_HOUR`), since voting only goes live when the scheduler flips the phase. The opening time is shown on the phase timeline next to the voting date ("kl. 09.00" / "at 09:00", from `schedulerTimeNote`, rendered as `.vote-phase-time` inside a `.vote-phase-when` wrapper on the voting step only; stacked under the date on desktop, beside it on mobile). The hero timer just counts down to 09:00; its date note stays hidden. The countdown targets are client-local, which matches the Denmark-based audience.

`js/vote.js` re-fetches `/api/round/current` and re-renders when the suggestions-open countdown reaches zero (throttled `autoReload`), so a member already sitting on the vote page sees the suggestion form appear without a manual reload.

## Automation Events

The `automation_events` table is the idempotency log for the planned voting scheduler. Each row records one automated action taken on a round, keyed by a `UNIQUE (round_id, event_type)` constraint. Known event types are `suggestions_opened`, `voting_opened`, `winner_revealed`, `blocked_alerted`, `winner_setup_needed_alerted`, `winner_announcement_posted`, and `handoff_generated`; the database does not enforce a fixed CHECK so new lifecycle events do not require a table rebuild. An optional JSON `payload` captures context such as webhook status, missing fields, and Discord message IDs for rolling public announcements.

The `functions/_lib/db.js` helpers manage this table:

- `ensureAutomationEventTable(db)` creates the table and index on demand, matching the lazy-provisioning pattern used by the other `ensure*` helpers. It also rebuilds older local/remote tables that still have the stale `event_type` CHECK constraint.
- `getAutomationEvents(db, roundId)` returns shaped events (`{ id, roundId, eventType, payload, createdAt }`, payload parsed from JSON), oldest first.
- `recordAutomationEvent(db, roundId, eventType, payload)` inserts an event and returns `{ duplicate, id }`. A unique-constraint hit is reported as `{ duplicate: true, id: null }` rather than thrown, so a rerun is a safe no-op. `isUniqueConstraintError(err)` distinguishes that case from real DB errors, which still propagate.

The scheduler reaches this only through the admin API (`GET /api/admin/round` exposes `automationEvents`; `POST /api/admin/automation-event` records them), never by touching D1 directly. This keeps all automation authenticated through the existing Bearer `ADMIN_TOKEN` gate.

## Discord Login And Vote Integrity

Members can browse the vote page without logging in, but suggesting and voting require Discord OAuth login. The app requests only the `identify` and `guilds` scopes:

- `identify` identifies the Discord user.
- `guilds` is used only to confirm the user belongs to the Aarhus Gamestormers Discord server (`DISCORD_GUILD_ID=1333453198408683613`).

The callback does not request email and does not store OAuth access tokens or guild lists. D1 stores only the Discord user id, optional username/avatar for logged-in UI and admin context, a membership flag, short-lived OAuth state, and hashed session tokens.

For suggestions, new rows store `discord_user_id` and a `suggested_by` display-name snapshot so admins may see who suggested a game. The suggestion form also sends `showName`, which is checked by default. Public cards show the saved name only when `show_suggester_name` is enabled, and they never expose Discord ids. Logged-in members can change this preference for their own current-round suggestions in every voting phase. The update route checks `suggestions.discord_user_id` against the session and does not require the member to send their name or id.

Logged-in members can also edit the `pitch` on their own suggestions, but only while suggestions are open for the current round (phase `suggesting` and `suggestionsAreOpen`). After voting starts the same `PATCH /api/suggestions/:id` route rejects pitch edits with a 409 so a pitch cannot be rewritten once members have begun voting on it. The vote page surfaces this as a per-suggestion pitch editor in the owner panel that appears only during the suggestions-open phase.

The lazy D1 migration adds `show_suggester_name` as nullable. Existing authenticated suggestions therefore stay hidden, while older pre-auth suggestions retain their previous byline behaviour. Every new authenticated submission writes an explicit `1` or `0`, defaulting to `1` when `showName` is omitted.

For votes, submitting a ballot deletes that Discord user's previous rows for the current round and inserts the new ranked choices (one row per ranked game, `rank` 1..N). That makes the latest ranking count across browsers and devices. Individual ranked ballots are never exposed publicly. The admin Votes section shows the aggregate ranked-choice results first, then lists each individual ballot (expandable, in submission order) so the maintainer can spot-check that the count matches the raw rankings. Ballots are labelled by index, not by who cast them, and Discord ids are never shown.

## Ranked-Choice Counting And Tie Rules

The winner is chosen by instant-runoff voting (IRV), not approval voting. Members rank the suggested games in order of preference (partial rankings allowed); the count eliminates the weakest game each round and transfers its ballots until one game holds a majority.

The counter lives in one pure module, `functions/_lib/rcv.js`, exporting `runIrv({ ballots, candidateIds })`. It takes no D1 or network, so both the Pages Functions (`/api/round/current`, the admin route) and the Node scheduler import the same implementation and tie rules. `ballots` is an array of ordered, de-duplicated approved-suggestion id lists; `candidateIds` is the approved suggestions so a game with zero first preferences still appears in round 1. The result is recomputed from stored ballots on every revealed read; nothing is persisted except `rounds.winner_suggestion_id` (set at reveal by the scheduler or admin).

Algorithm per round:

1. Seed each standing candidate from the ballots whose first still-standing preference is that candidate. Ballots that rank none of the standing candidates are **exhausted** and excluded from the active total.
2. `majority = floor(activeBallots / 2) + 1`. If any candidate reaches it, that candidate wins and the count stops.
3. Otherwise eliminate the lowest candidate (tie rules below) and transfer each of its ballots to that ballot's next still-standing preference; ballots with no further preference become exhausted.
4. Repeat. A single remaining candidate wins by default.

Edge cases are explicit: zero ballots → `blocked: no_ballots`; a single candidate → immediate winner; all-but-no-majority resolves to the remaining top candidate; partial rankings simply exhaust when the list runs out.

**Elimination tie** (lowest is shared) is broken deterministically, in order: (1) fewest first-preference (round-1) votes, then (2) lowest in the most recent prior round where the tied candidates differed, then (3) lowest suggestion `id` (oldest). This always terminates without a coin flip and `id` order is stable and not voter-influenced.

**Final / decisive tie** (the last standing candidates are exactly equal and none can reach majority) is **not** auto-resolved. `runIrv` returns `blocked: { reason: 'tie', tied: [...] }`, the scheduler leaves the round for the maintainer, and the admin Votes section surfaces the tied games and prompts breaking it by selecting the winner in the Selected game section. Rationale: an elimination order is a low-stakes internal step safe to break by rule, but the actual winner of a tied final is a real decision the maintainer should own.

### Privacy

- **Never expose individual ranked ballots publicly.** `/api/round/current` exposes only the aggregate `rcvResult` (per-round counts, transfers, exhausted totals), and only after reveal.
- **Participation count is turnout, not a tally.** `round.ballotCount` (`COUNT(DISTINCT ballot_id)`, so a multi-row ranked ballot counts once) is the only vote-derived number exposed during the `voting` phase. It says how many people voted, never which game leads, so it is distinct from the per-candidate counts that stay hidden until reveal.
- **Admin can see individual ballots.** The Bearer-gated `GET /api/admin/round` returns each ordered ballot, and the admin Votes section lists them (expandable) below the aggregates so the maintainer can verify the IRV count. Ballots are listed by submission order, never tied to a Discord id in the response or UI. No public endpoint returns ranked ballots.
- **Small-electorate caveat:** with a small club, even aggregate transfer patterns can hint at individual preferences, and ranked data is more revealing than approval was. Listing individual ballots in the admin UI goes further, so it stays admin-only behind the token gate. This is an accepted trade-off; public reporting stays coarse (counts, not cross-tabs).

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

HowLongToBeat has no API in this project. `playtime_hours` and `hltb_url` are filled manually by the maintainer during curation, and the admin promotion flow copies both onto the selected game.

## Discord OAuth Setup

Required Cloudflare Pages configuration:

```text
wrangler.toml:
DISCORD_REDIRECT_URI=https://www.gamestormers.dk/api/auth/discord/callback
DISCORD_GUILD_ID=1333453198408683613

Cloudflare Pages encrypted secrets:
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
SESSION_SECRET=...  # long random value used to hash session/state tokens
```

Cloudflare Pages receives plain vars and encrypted secrets through the same `env` object at runtime. Since this project uses `wrangler.toml`, the dashboard only allows adding encrypted secrets directly; storing `DISCORD_CLIENT_ID` as a secret is acceptable.

For local development, use the local callback URL in `.dev.vars`:

```text
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=http://127.0.0.1:8788/api/auth/discord/callback
DISCORD_GUILD_ID=1333453198408683613
SESSION_SECRET=...
```

In the Discord Developer Portal, add matching OAuth2 redirect URLs for every environment you use, including local preview and production. The OAuth URL should request only `identify` and `guilds`.

## Suggestion Notifications

When `DISCORD_SUGGESTIONS_WEBHOOK_URL` is set, `/api/suggest` posts a Discord message for every new suggestion (see `functions/_lib/notify.js`):

- Steam suggestions also make the game title a link to its Steam store page. Every notification includes the pitch when one was supplied, the suggester as a clickable Discord `@` link only when they opted to show their name, and a `[Check it out on the vote page and suggest your own game](...)` link to the public `/vote` page. The webhook's `allowed_mentions` setting keeps that `@` link from pinging the member.
- Non-Steam suggestions (`pending`) are also flagged as needing approval and include a link to the `/vote-admin/` page.

Links point at the live site (`SITE_URL` in `functions/api/suggest.js`), not the request origin, so they stay correct even when a notification fires from a local dev test.

It is fire-and-forget via `waitUntil`, so a slow or failing webhook never blocks or breaks the suggestion submission. The secret is optional: if it is unset, notifications are skipped and everything else works unchanged. `allowed_mentions` is empty so a game title can never ping the channel, and Discord's `SUPPRESS_EMBEDS` message flag keeps the vote-page link clickable without generating a preview card.

Create the webhook in Discord under Server Settings, Integrations, Webhooks, then store the URL as `DISCORD_SUGGESTIONS_WEBHOOK_URL` (encrypted env var in Cloudflare Pages, and in `.dev.vars` for local testing). This is a separate secret from the sales-alert workflow's `DISCORD_WEBHOOK_URL` (a GitHub Actions secret), so the two can post to different channels.

## Local Development

```powershell
wrangler d1 create gamestormers
wrangler d1 execute gamestormers --local --file=./schema.sql
npm run dev
```

Create `.dev.vars` with:

```text
ADMIN_TOKEN=test
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=http://127.0.0.1:8788/api/auth/discord/callback
DISCORD_GUILD_ID=1333453198408683613
SESSION_SECRET=...
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

The voting scheduler lives under `automation/voting/` as plain Node ES modules (run by GitHub Actions, not by Pages Functions). They are kept side-effect-free where possible so the decision rules stay testable. Each module has a sibling `*.test.mjs` run by `npm test`.

- `scheduler.mjs`: pure `decideRoundActions({ today, round, suggestions, rcvResult, automationEvents })`. Given a round's current state it returns one decision:
  - `announce_suggestions` when the round is `suggesting`, `today` has reached `suggestions_open_at`, voting is not open yet, and `suggestions_opened` is not already recorded.
  - `open_voting` when the round is `suggesting`, `today` has reached `voting_opens_at` (inclusive), and `voting_opened` is not already recorded.
  - `reveal_winner` (with `winnerSuggestionId = rcvResult.winnerId` and the winning `{ id, title, votes }`, votes being the winner's round-one first-preference count) when the round is `voting`, `today` is past `voting_closes_at` (the close date is still an open voting day), `winner_revealed` is not recorded, and `rcvResult` resolved to a single winner.
  - `blocked` when a reveal is due but `rcvResult.blocked` is set: `no_votes` (`reason: 'no_ballots'`, no ballots) or `tie` (`reason: 'tie'`, naming the tied suggestions). The runner should log these and leave the round for the maintainer.
  - `noop` otherwise (nothing due, the event is already recorded, or the phase is `revealed`/`closed`). The scheduler never closes a round automatically.
  The IRV winner/tie/no-ballots decision comes from `rcvResult` (computed by the admin API via `functions/_lib/rcv.js`), so the scheduler shares the one counting implementation. The date comparisons reuse `functions/_lib/schedule.js` so they match the public schedule boundaries exactly.
- `api-client.mjs`: `createApiClient({ baseUrl, adminToken, fetch })` wraps the admin API (`getCurrentRound`, `getAdminRound`, `patchRound`, `selectWinner`, `patchMeeting`, `recordAutomationEvent`). Both reads use the admin endpoints because the scheduler needs the `rcvResult` and `automationEvents`, which the public `/api/round/current` withholds. Every call sends `Authorization: Bearer <VOTING_ADMIN_TOKEN>` (the same value as the Cloudflare Pages `ADMIN_TOKEN`).
- `discord.mjs`: pure message builders (`suggestionsOpenedMessage`, `votingOpenedMessage`, `winnerRevealedMessage`, `winnerSetupNeededMessage`, `blockedMessage`) plus `postDiscord`, which sends a `{ content, allowed_mentions: { parse: [] } }` payload and is a no-op without a webhook URL. When called with `wait: true`, `postDiscord` appends `?wait=true` and returns the created Discord `messageId`; `deleteDiscordMessage` removes webhook-created messages by ID and treats missing/already-deleted messages as best-effort success. The public voting announcements use `DISCORD_VOTING_WEBHOOK_URL`; private setup and blocked-round alerts use `DISCORD_VOTING_ALERTS_WEBHOOK_URL`. The voting-open message asks members to rank the games in order of preference (they need not rank them all), includes approved suggestions, and trims the list before Discord's 2000-character limit so the vote link and code remain visible.
- `handoff.mjs`: pure winner-promotion planner and maintainer handoff builder.
  - `winnerPublicationPlan({ roundPayload, winnerSuggestionId })` reads the admin round payload and reports whether the winner is already selected (`winnerAlreadySelected`, plus a `conflict` flag when a different suggestion is attached), whether the existing or projected card is publish-ready (`publishReady`), which manual fields are still missing (`missing`, from `publishReadiness`, direct selected-game checks, or the winning suggestion's copied fields), and whether automation may safely promote (`mayPromote`, with `needsHandoff` and a human-readable `reason`). When `winnerSuggestionId` is omitted it falls back to the round's recorded `winner_suggestion_id`.
  - Publication safety: `mayPromote` is true when the winner is already selected and publish-ready, or when the unselected winning suggestion already has all frontpage fields needed after promotion (title, cover image, store link, genres, platforms, playtime hours, HowLongToBeat URL, and Danish/English event descriptions). If any required field is missing, the scheduler reveals the winner and writes a handoff instead of publishing an incomplete homepage card. No draft mode was added to `POST /api/admin/round/:id/select`.
  - `buildHandoffMarkdown({ roundPayload, winnerSuggestionId, plan, baseUrl })` renders a maintainer brief: meeting number/title/date, winner details (Steam app id, store URL, GOG when present, banner, genres/platforms, pitch, suggested-by), a "Vote results" section rendered from `rcvResult` (final IRV standing and winner plus a round-by-round summary of counts, eliminations, and exhausted/majority lines, with a legacy approval-tally fallback when `rcvResult` is null and the final-tie blocked state surfaced), `publishReadiness.missing`, explicit HowLongToBeat and localized-description reminders when missing, and a checklist pointing to `MEETING_WORKFLOW.md`. `handoffArtifactPath(roundId)` and `writeHandoff(markdown, { roundId })` write it to `automation-output/meeting-<id>-winner.md` for the runner to upload as a GitHub Actions artifact (never committed; `automation-output/` is gitignored).
- `run-scheduler.mjs`: the runner that wires the above together. `runScheduler({ env, today, deps })` reads the environment (`readEnv` requires `VOTING_BASE_URL` and `VOTING_ADMIN_TOKEN`; `DISCORD_VOTING_WEBHOOK_URL` and `DISCORD_VOTING_ALERTS_WEBHOOK_URL` are optional), fetches the current admin round, asks `decideRoundActions` for one decision, and acts on it. Its side-effecting dependencies (`client`, `postDiscord`, `deleteDiscordMessage`, `writeHandoff`, `logger`) are injectable so the flow is unit-tested without real network or filesystem access.

### Runner flow and idempotency

For each pass the runner does one of:

- `announce_suggestions`: post the Discord "suggestions open" announcement with `wait: true`, then record `suggestions_opened` with the returned `messageId`.
- `open_voting`: patch the round to `voting`, post the Discord "voting open" announcement with `wait: true`, delete the stored `suggestions_opened` message if present, then record `voting_opened` with the returned `messageId`.
- `reveal_winner`: patch the round to `revealed` with the winning `winnerSuggestionId`, record `winner_revealed`, then refetch the admin round. If the winning suggestion can be copied into a publish-ready frontpage card, the runner promotes it automatically; if the selected winner, manual metadata, localized copy, and Discord event URL are ready, it posts the public winner/meeting announcement, records `winner_announcement_posted`, and deletes the stored `voting_opened` message. If anything is missing, it records/sends a private `winner_setup_needed_alerted` admin-channel alert, writes the handoff, and waits for the maintainer to complete setup and click "Post Discord reveal" in `vote-admin.html`. The admin "Post Discord reveal" path also deletes the stored `voting_opened` message after a successful final announcement.
- `blocked` (tie or no votes): log a loud warning and, when `DISCORD_VOTING_ALERTS_WEBHOOK_URL` is set, post one private maintainer alert and record `blocked_alerted`. Future scheduler runs for the same blocked round stay quiet until the maintainer resolves it. If the alerts webhook is unset, the runner logs only and does not record `blocked_alerted`, so configuring the webhook later still alerts.
- `noop`: nothing due; log and exit 0.

The idempotency model has two guards. Phase patches happen before their transition events, and `decideRoundActions` branches on phase, so a round that already moved on is never re-opened or re-revealed. On top of that, `recordAutomationEvent` returns `{ duplicate }` from the `UNIQUE (round_id, event_type)` constraint and acts as a lock for suggestions-open, voting-open, blocked-alert, setup-alert, winner-announcement, and handoff side effects. Suggestions/voting announcements are posted before recording so their Discord message IDs can be stored; if the event record is a duplicate or fails after posting, the runner deletes the just-posted message to avoid orphaned public announcements. If recording fails after a successful phase patch, the runner logs loudly and re-throws so the failure surfaces as a red workflow run for the maintainer.

### Scheduled workflow

`.github/workflows/voting-automation.yml` drives the runner on `workflow_dispatch` and once a day at 09:00 Europe/Copenhagen using Node 24. Because GitHub Actions cron is UTC-only, the workflow has candidate schedules for 07:00 and 08:00 UTC and a first-step Copenhagen time gate; only the candidate run where the local hour is 09 proceeds to tests and the scheduler. It runs `npm test`, then `node automation/voting/run-scheduler.mjs`, then uploads `automation-output/*.md` as the `winner-handoff` artifact (`if-no-files-found: ignore`, so the common no-op run stays green). Permissions are minimal (`contents: read`, `actions: read`); the workflow never commits or edits HTML. It reads the GitHub Actions secrets `VOTING_BASE_URL`, `VOTING_ADMIN_TOKEN`, and the optional `DISCORD_VOTING_WEBHOOK_URL` / `DISCORD_VOTING_ALERTS_WEBHOOK_URL` (see [`deployment-guide.md`](deployment-guide.md)). Playtime should stay manual unless a reliable source becomes available. (New-suggestion Discord notifications are built separately, see Suggestion Notifications above.)

### Out Of Scope

The scheduler does not automatically create future rounds, publish a public archive of closed voting rounds, create pull requests, enforce identity-backed one-vote-per-person voting, or look up HowLongToBeat data automatically. Those remain manual or future-project areas.
