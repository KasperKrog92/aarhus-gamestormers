# Discord Multi-Channel Rolling Announcements Plan

Created 2026-06-17. Builds on the completed Voting Scheduler And Handoff project
(see [`2026-06-16-voting-scheduler-handoff.md`](2026-06-16-voting-scheduler-handoff.md)).
This is a plan only. Nothing here is implemented yet.

## Goal

Change the voting scheduler's Discord notifications so they behave like a single
rolling announcement plus a private maintainer alert channel:

1. Post a "suggestions are now open" announcement when a round reaches its
   `suggestions_open_at` date (a new scheduler action; the round stays in
   `suggesting`).
2. When voting opens, delete the suggestions announcement and post a "voting is
   now open" announcement in its place.
3. When the winner is revealed, delete the voting announcement and post the
   winner announcement (with meeting details). The winner announcement is the
   final message and is never deleted.
4. Route messages to two different channels:
   - Public announcement channel: suggestions-open, voting-open, winner.
   - Private maintainer channel: blocked alerts (tie / no votes), once per round.

The site rendering, Pages Functions request/response behavior, and homepage
publication flow are unchanged. This project only touches the automation layer
plus the `automation_events` storage shape and its admin write path.

## Confirmed Decisions

From the maintainer on 2026-06-17:

- Suggestions-open announcement: yes, add it. The scheduler announces when
  `suggestions_open_at` is reached.
- Winner announcement content: the maintainer will supply a message template.
  The winner announcement is never deleted.
- Blocked alerts: alert the private channel once per round, then stay quiet until
  the maintainer resolves it (guarded by a new automation event).

Derived decisions:

- Keep the existing `DISCORD_VOTING_WEBHOOK_URL` as the public announcement
  channel. Add a new optional `DISCORD_VOTING_ALERTS_WEBHOOK_URL` for the private
  channel. If the alerts webhook is unset, blocked states only log (today's
  behavior) and no `blocked_alerted` event is recorded, so configuring the
  webhook later still alerts.
- Message deletion uses the webhook itself: post with `?wait=true` to get the
  created message id back, store the id in the `automation_events` payload, and
  later `DELETE /webhooks/{id}/{token}/messages/{messageId}`. No bot token is
  needed. Deletion is best-effort: a missing or already-deleted message logs a
  warning and never fails the run.
- New automation event types: `suggestions_opened` and `blocked_alerted`. The
  message id for each rolling announcement lives in that event's `payload_json`.
- SQLite cannot alter a `CHECK` constraint in place, and `CREATE TABLE IF NOT
  EXISTS` does not update an existing table. Rather than keep widening the
  `event_type` CHECK on every new type, drop the DB-level CHECK and treat the
  application-level `AUTOMATION_EVENT_TYPES` list as the single source of truth.
  Add a one-time self-healing rebuild in `ensureAutomationEventTable` so existing
  local/remote databases lose the stale CHECK without a manual migration.

## Pending Input (blocks Task 5)

- The exact winner announcement copy/template. The plan implements everything
  around it; `winnerRevealedMessage` will be rewritten to match the supplied
  template. Until then, the builder keeps its current shape so tests pass.

## Notification Lifecycle

```text
suggestions_open_at reached   -> post "suggestions open"      (announcement ch.)
voting_opens_at reached       -> delete "suggestions open",
                                 post "voting open"            (announcement ch.)
voting_closes_at passed       -> delete "voting open",
                                 post "winner" (kept forever)  (announcement ch.)
tie / no votes                -> post "needs attention", once (private ch.)
```

Each rolling announcement is scoped to one round. A new round starts its own
lifecycle; it never deletes a previous round's winner message.

## Current Baseline (relevant pieces)

- `automation/voting/scheduler.mjs`: pure `decideRoundActions`. Actions today:
  `open_voting`, `reveal_winner`, `blocked`, `noop`.
- `automation/voting/discord.mjs`: `votingOpenedMessage`, `winnerRevealedMessage`,
  `blockedMessage`, `toWebhookPayload`, `postDiscord` (no message id, no delete).
- `automation/voting/run-scheduler.mjs`: patches phase, records the event as a
  duplicate-guard lock, then posts to the single `DISCORD_VOTING_WEBHOOK_URL`.
  Blocked states only log; they never post to Discord.
- `automation/voting/api-client.mjs`: `recordAutomationEvent` posts to
  `/api/admin/automation-event`. No change needed for message deletion, which the
  runner performs directly against the webhook.
- `functions/_lib/db.js`: `ensureAutomationEventTable` creates the table with a
  3-type CHECK; `recordAutomationEvent` / `getAutomationEvents` / `toAutomationEvent`.
- `functions/api/admin/[[route]].js`: `AUTOMATION_EVENT_TYPES =
  ['voting_opened','winner_revealed','handoff_generated']`, validated in
  `adminRecordAutomationEvent`. `automationEvents` payloads are already returned
  by `GET /api/admin/round` and `GET /api/admin/round/:id`.
- `schema.sql`: `automation_events` DDL with the 3-type CHECK.

## File Plan

Modify:

- `schema.sql` (drop the `event_type` CHECK)
- `functions/_lib/db.js` (drop CHECK in the ensure helper; add self-healing rebuild)
- `functions/api/admin/[[route]].js` (extend `AUTOMATION_EVENT_TYPES`)
- `automation/voting/scheduler.mjs` (new `announce_suggestions` action)
- `automation/voting/discord.mjs` (message-id post, delete helper, new builder)
- `automation/voting/run-scheduler.mjs` (rolling delete, two webhooks, alert-once)
- `automation/voting/preview-discord.mjs` (preview the new lifecycle + alert)
- `.github/workflows/voting-automation.yml` (pass the alerts webhook secret)
- `docs/voting-system.md`, `docs/deployment-guide.md`, `README.md`

Tests to add/extend:

- `automation/voting/scheduler.test.mjs`
- `automation/voting/discord.test.mjs`
- `automation/voting/run-scheduler.test.mjs`
- `test/automation-events.test.mjs` (new event types + rebuild migration)
- `test/admin-automation-event.test.mjs` (new event types accepted)

Do not modify: `index.html`, `en/index.html`, `sitemap.xml`, `AGENTS.md`, the
vote pages, or `js/*` (no public page or CSS change; no `?v=N` bump needed).

## Task 1: Widen Automation Event Storage

Purpose: allow the two new event types and stop fighting the SQLite CHECK.

- [ ] `schema.sql`: change the `automation_events.event_type` column to
  `event_type TEXT NOT NULL` (drop the `CHECK (...)`). Keep a comment listing the
  valid types and pointing at `AUTOMATION_EVENT_TYPES` as the enforced gate.
- [ ] `functions/_lib/db.js`: drop the CHECK in `ensureAutomationEventTable`'s
  `CREATE TABLE`. Add a one-time rebuild: read
  `SELECT sql FROM sqlite_master WHERE type='table' AND name='automation_events'`;
  if the stored SQL still contains `CHECK (event_type`, rebuild the table inside a
  batch (create `automation_events_new` without the CHECK, copy all rows, drop the
  old table, rename, recreate the index). Idempotent and safe because the table has
  no automation rows in normal use yet.
- [ ] `functions/api/admin/[[route]].js`: extend `AUTOMATION_EVENT_TYPES` to
  `['suggestions_opened','voting_opened','winner_revealed','handoff_generated','blocked_alerted']`.
- [ ] Tests: `test/automation-events.test.mjs` records `suggestions_opened` and
  `blocked_alerted` successfully and round-trips a `messageId` payload; add a case
  proving the rebuild drops a stale CHECK while preserving existing rows.
  `test/admin-automation-event.test.mjs` accepts the new types and still rejects an
  unknown one.
- [ ] Run `npm test`. Apply the schema locally:
  `wrangler d1 execute gamestormers --local --file=./schema.sql` and confirm a
  record of each new type inserts.

## Task 2: Scheduler Decision For Suggestions-Open

Purpose: decide the new announcement without side effects.

- [ ] Add `ACTIONS.ANNOUNCE_SUGGESTIONS = 'announce_suggestions'`.
- [ ] In the `suggesting` branch of `decideRoundActions`, evaluate in this order:
  1. If `today >= voting_opens_at` and `voting_opened` not recorded ->
     `open_voting` (voting wins if both dates have passed, e.g. after downtime).
  2. Else if `today >= suggestions_open_at` and `suggestions_opened` not recorded
     -> `announce_suggestions` (include `roundId` and a reason).
  3. Else `noop`.
- [ ] Reuse `cleanDateOnly` / `isBeforeDateOnly` so the boundary matches the public
  schedule (suggestions open on `suggestions_open_at` inclusive).
- [ ] `reveal_winner`, `blocked`, and `noop` are unchanged. The scheduler still
  never closes a round.
- [ ] Tests in `scheduler.test.mjs`: announces on the open date, not before, not
  twice once recorded, and prefers `open_voting` when both dates have passed.
- [ ] Run `npm test`.

## Task 3: Discord Message-Id Posting, Deletion, And Builders

Purpose: support rolling announcements and the new message.

- [ ] `postDiscord(url, content, { fetch, wait })`: when `wait` is true, post to
  `${url}?wait=true`, parse the JSON response, and return
  `{ skipped, posted, status, messageId }` (messageId from `response.id`). Default
  `wait` false keeps the current return shape. A missing url/content stays a no-op.
- [ ] Add `deleteDiscordMessage(url, messageId, { fetch })`:
  `DELETE ${url}/messages/${messageId}`. Returns `{ skipped, deleted, status }`.
  Best-effort: never throws; a 404 (already gone) counts as success-ish and logs.
- [ ] Add `suggestionsOpenedMessage({ round, baseUrl })`: names the meeting and
  links to `/vote`, mentioning the voting-open date when present.
- [ ] Keep `votingOpenedMessage` as is.
- [ ] Rewrite `winnerRevealedMessage` to the maintainer's supplied template
  (Pending Input). It should accept the data available at reveal time (meeting
  number, meeting date, winning game title, vote count, `/vote` link) and tolerate
  empty optional fields.
- [ ] `blockedMessage` unchanged (now routed to the alerts channel).
- [ ] Keep `allowed_mentions: { parse: [] }` on every payload.
- [ ] Tests in `discord.test.mjs`: `wait` returns `messageId`; non-wait keeps the
  old shape; `deleteDiscordMessage` builds the right URL and swallows errors; the
  new suggestions builder; updated winner builder once the template lands.
- [ ] Run `npm test`.

## Task 4: Runner Flow For Rolling Announcements And Alerts

Purpose: wire the lifecycle, two channels, and once-per-round alerting.

- [ ] `readEnv`: also read optional `DISCORD_VOTING_ALERTS_WEBHOOK_URL` as
  `discordAlertsWebhookUrl`. Required vars unchanged.
- [ ] Helper to read a stored message id: find an event by type in the round's
  `automationEvents` and return `payload.messageId` or null.
- [ ] `announce_suggestions`: post `suggestionsOpenedMessage` to the announcement
  webhook with `wait: true`; record `suggestions_opened` with `{ messageId, today }`.
  No phase patch. If recording returns `duplicate`, delete the message just posted
  to avoid an orphan.
- [ ] `open_voting`: patch phase to `voting` first (durable). Post
  `votingOpenedMessage` with `wait: true`, then delete the stored
  `suggestions_opened` message (post-new-then-delete-old avoids a visible gap).
  Record `voting_opened` with `{ messageId, today }`.
- [ ] `reveal_winner`: patch phase to `revealed` + winner first. Post the winner
  message (no `wait` needed; it is never deleted), then delete the stored
  `voting_opened` message. Record `winner_revealed` with `{ today, winnerSuggestionId }`.
  Then run the existing publication planner / handoff / `handoff_generated` logic
  unchanged.
- [ ] `blocked`: if `blocked_alerted` is already recorded, only log (quiet). Else,
  if `discordAlertsWebhookUrl` is set, post `blockedMessage` to the alerts webhook;
  on a successful post, record `blocked_alerted` with `{ blocker, today }`. If the
  alerts webhook is unset, log only and do not record (so configuring it later
  still alerts). Always exit 0.
- [ ] Keep the "patch phase before posting" rule. Because message ids must come
  from the post, the transition event is now recorded after the post; the phase
  change remains the primary re-entry guard (`decideRoundActions` branches on
  phase), and a post-without-record failure is logged loudly and re-thrown.
- [ ] Update `preview-discord.mjs` to preview the full lifecycle (suggestions /
  voting / winner) against the announcement webhook and the blocked alert against
  `DISCORD_VOTING_ALERTS_WEBHOOK_URL`, including a delete demonstration.
- [ ] Tests in `run-scheduler.test.mjs` (mocked client/discord/handoff): announces
  suggestions and stores the id; opens voting, deletes the suggestions message, and
  stores the voting id; reveals, deletes the voting message, keeps the winner
  message; alerts the private channel once and stays quiet on the second blocked
  run; alerts webhook unset -> logs only, no `blocked_alerted` recorded.
- [ ] Run `npm test`.

## Task 5: Winner Template (Pending Input)

Purpose: match the maintainer's exact winner copy.

- [ ] Implement `winnerRevealedMessage` from the supplied template.
- [ ] Confirm which fields it needs and that they are present in the admin round
  payload at reveal time; fetch/pass any extra fields the runner does not already
  have.
- [ ] Update the discord test snapshot for the winner message.
- [ ] Run `npm test`.

## Task 6: Workflow And Secrets

Purpose: give the scheduled run access to the second channel.

- [ ] `.github/workflows/voting-automation.yml`: add
  `DISCORD_VOTING_ALERTS_WEBHOOK_URL: ${{ secrets.DISCORD_VOTING_ALERTS_WEBHOOK_URL }}`
  to the scheduler step env. Keep permissions, Node version, and artifact upload as
  is.
- [ ] No new required secret. The alerts webhook is optional.

## Task 7: Documentation And Verification

- [ ] `docs/voting-system.md`: document the new lifecycle, the two webhooks, the
  `suggestions_opened` / `blocked_alerted` events and stored message ids, rolling
  deletion, and once-per-round alerting. Note the dropped CHECK and that
  `AUTOMATION_EVENT_TYPES` is the enforced gate.
- [ ] `docs/deployment-guide.md`: add `DISCORD_VOTING_ALERTS_WEBHOOK_URL` to the
  Voting Automation secrets (clearly optional and a different channel), and note
  the remote schema apply plus the self-healing rebuild for the CHECK drop.
- [ ] `README.md`: update the automation bullet for the two channels.
- [ ] Run `npm test` and `node --check` on each automation module.
- [ ] Manually preview both channels with `preview-discord.mjs` against test
  webhooks before trusting the scheduled workflow.

## Required Secrets (updated)

GitHub Actions:

- `VOTING_BASE_URL`
- `VOTING_ADMIN_TOKEN`
- `DISCORD_VOTING_WEBHOOK_URL` (public announcement channel)
- `DISCORD_VOTING_ALERTS_WEBHOOK_URL` (private maintainer channel; optional)

## Deployment Safety And Sequencing

The intent is that every commit on this branch can be pushed to `main` without
breaking the live site or the existing automation. The live website never depends
on this code, so site rendering and `/api/*` behavior are unaffected throughout.
Order the rollout so the database and the code agree before the scheduler uses a
new event type:

1. Land Task 1 first (drop the CHECK + self-healing rebuild + widened
   `AUTOMATION_EVENT_TYPES`). After deploy, the next admin API call runs the
   rebuild once. Apply the schema remotely too:
   `wrangler d1 execute gamestormers --remote --file=./schema.sql` (this updates
   fresh databases; existing ones are migrated by the ensure helper). Until this
   lands, recording `suggestions_opened` / `blocked_alerted` would fail the CHECK,
   so do not ship the runner changes that emit them before Task 1 is deployed.
2. Land Tasks 2 to 6 together. The runner only emits the new event types after the
   storage accepts them.
3. The scheduled workflow stays idempotent: the phase change plus the recorded
   event guard re-entry, deletion is best-effort, and blocked alerts are once per
   round. A missing alerts webhook degrades to logging.

Note on the *current* (pre-feature) push: the in-progress
`voting-automation.yml` registers an hourly cron. On `main` with no GitHub secrets
set, each scheduled run fails at `readEnv` (red run + notification email) until the
secrets exist. It does not affect the website. Before pushing, either set the
GitHub Actions secrets, temporarily disable the workflow in the Actions tab, or
hold the workflow file until secrets are ready. See the response notes that
accompany this plan.

## Open Questions / Risks

- Deleting the voting announcement removes the public record of "voting is open"
  once the winner posts. That is the requested behavior; revisit if a permanent
  per-phase history is wanted later.
- `blocked_alerted` is per round, so a tie that later becomes a different blocker
  does not re-alert. Acceptable: the maintainer is already engaged after the first
  alert.
- If the scheduler misses the suggestions window (downtime past both dates), it
  skips straight to `open_voting` and never posts the suggestions announcement; the
  voting-open delete simply finds no stored suggestions message.

## Deferred (unchanged from the prior project)

- Public archive of old rounds.
- Automatic creation of the next round.
- Draft PR creation for winner handoff files.
- Automatic HowLongToBeat lookup.
