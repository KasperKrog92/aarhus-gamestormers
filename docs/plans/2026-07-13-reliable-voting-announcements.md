# Reliable Voting Announcements

Date: 2026-07-13

Status: implemented and deployed 2026-07-13. The Worker `gamestormers-voting-cron` is live with its cron triggers and all secrets including the healthchecks ping, and the smoke tests passed (authenticated pass returned `noop` with `healthcheckPing: "ok"`, wrong token 401, GET 404). Remaining: the Phase 3 burn-in observations (first scheduled Worker pass 2026-07-14, round 20 voting open 2026-07-21, voting close 2026-07-30) and the Phase 4 review. The plan below is kept as written, with checkboxes updated.

Scope: make the daily voting scheduler pass fire punctually and make any failure loud, by adding a Cloudflare Worker cron trigger as the primary clock, keeping GitHub Actions as a redundant backstop, and adding a dead-man's switch so a silent skip can never again go unnoticed for days.

## Background

On 2026-07-12, round 20's suggestions-open Discord announcement did not post. The scheduler itself was healthy; the GitHub Actions workflow that triggers it skipped every run for days because GitHub's cron triggers started 1.5 to 4 hours late and the workflow's time gate required the Copenhagen hour to be exactly 09. The gate is fixed (commit `ed9b88e`: run at or after 09:00 local, plus a 12:00 UTC backstop cron), but two structural weaknesses remain:

1. GitHub Actions cron is the only clock, and it is routinely hours late. Announcements now post late instead of never, but punctuality is still poor.
2. Failure is silent. Nothing alerts the maintainer when a daily pass does not happen. The July incident was only noticed by a human missing the announcement.

## Target architecture

```text
                 Cloudflare Worker (gamestormers-voting-cron)
  primary clock: cron 07:00 + 08:00 UTC, backstop 12:30 UTC
                 in-worker gate: Europe/Copenhagen hour >= 9
                        |
                        v
                 runScheduler()  <-- the existing module in automation/voting/
                        |              (same code the GitHub runner executes)
                        v
        admin API over HTTPS (Bearer VOTING_ADMIN_TOKEN)
                        |
                        v
              D1 + Discord webhooks (unchanged)

  backstop clock: existing .github/workflows/voting-automation.yml, unchanged
  watchdog:       healthchecks.io dead-man ping after every successful pass,
                  from both the Worker and the GitHub runner
  manual trigger: POST to the Worker with Bearer CRON_TOKEN,
                  or the existing workflow_dispatch
```

Key property: the Worker and the GitHub runner execute the same `runScheduler` module against the same admin API. There is one implementation of the scheduling logic, hosted by two independent clocks. The `automation_events` idempotency lock and the existing duplicate-post cleanup (`recordEventAfterDiscord` deletes its own Discord message when the event record turns out to be a duplicate) already make concurrent or repeated passes safe, so redundant clocks cost nothing.

## Design decisions

1. **Worker runs the existing runner; no new Pages tick endpoint.** Pages Functions cannot have cron triggers, so a companion Worker is needed either way. Earlier discussion sketched a `/api/cron/tick` Pages endpoint, but reading the runner changed the recommendation: `runScheduler` already has injectable dependencies and reaches D1 only through the admin API, which is the documented automation boundary. Bundling it into the Worker means zero new server-side surface area, no extraction of admin payload building, and no second implementation.
2. **Timing.** Cloudflare cron fires within about a minute of schedule. Triggers at 07:00 and 08:00 UTC cover 09:00 Copenhagen across DST; a 12:30 UTC trigger is the same-day backstop. The Worker computes the Copenhagen hour with `Intl.DateTimeFormat` and no-ops before 09:00 local, so every trigger is safe regardless of when it lands.
3. **Manual and external triggering.** The Worker also exposes a `fetch` handler: `POST /` with `Authorization: Bearer CRON_TOKEN` runs one pass. `CRON_TOKEN` is a new secret with no admin power, so a third-party pinger could later be added without holding `ADMIN_TOKEN`. Anything else returns 404.
4. **Dead-man's switch.** After every successful pass (including noop), the runner pings a healthchecks.io check URL. The check expects one ping per day with a grace deadline of 14:00 Copenhagen. If no ping arrives, healthchecks emails the maintainer, and optionally posts to the private Discord alerts channel via its built-in webhook integration. Both hosts ping, so the alert only fires when no pass at all completed, which is exactly the failure mode from July. The ping URL is optional in the environment: absent means skip, matching how the Discord webhooks degrade.
5. **Handoff delivery from the Worker.** `writeHandoff` writes markdown to disk for the GitHub artifact upload, which a Worker cannot do. The Worker instead posts the handoff markdown as a file attachment to the private alerts webhook (Discord webhooks accept multipart file uploads). Arguably better than the artifact: the brief lands where the maintainer already reads alerts. The GitHub runner keeps the artifact path.
6. **Small Node decoupling refactor.** Two modules pin the runner to Node and must be split so wrangler can bundle it without `nodejs_compat` (which this project deliberately avoids):
   - `handoff.mjs` imports `node:fs/promises` and `node:path` at top level for `writeHandoff`/`handoffArtifactPath`. Move those two functions to a new `handoff-node.mjs`; the pure builders stay put.
   - `run-scheduler.mjs` imports `node:url` only for its run-directly check and defaults `env` to `process.env`. Move the CLI entry into a new `automation/voting/cli.mjs` (the workflow calls that instead); `runScheduler` keeps taking `env` explicitly.
   Behaviour is unchanged; existing tests keep passing with only import-path updates.
7. **GitHub Actions stays, unchanged, as the backstop.** After the gate fix it works; it is free redundancy on independent infrastructure. Its daily pass is a no-op whenever the Worker already ran (the Worker fires hours earlier on a normal day). Whether to retire or thin it out is a burn-in-review decision, not part of this plan.
8. **Cost.** Everything fits free tiers: Workers free plan includes cron triggers, healthchecks.io free plan includes 20 checks.

## New repo layout

```text
automation/cron-worker/
  worker.mjs        scheduled() + fetch() handlers, Copenhagen gate,
                    Discord-attachment handoff writer, healthchecks ping
  wrangler.jsonc    name gamestormers-voting-cron, crons, no bundling surprises
  worker.test.mjs   gate logic, trigger auth, handoff/ping wiring (mocked)
automation/voting/
  cli.mjs           Node CLI entry (moved from run-scheduler.mjs)
  handoff-node.mjs  writeHandoff + handoffArtifactPath (moved from handoff.mjs)
```

`npm run deploy:cron` wraps `wrangler deploy --config automation/cron-worker/wrangler.jsonc`.

Note for CLAUDE.md: the existing rule "do not use wrangler deploy, that targets Workers" protects the site deploy. The cron Worker is deliberately a Worker; the rule gets an explicit exception naming `automation/cron-worker/`.

## Worker environment

| Name | Kind | Value |
| --- | --- | --- |
| `VOTING_BASE_URL` | var | `https://www.gamestormers.dk` |
| `VOTING_ADMIN_TOKEN` | secret | same value as the Cloudflare Pages `ADMIN_TOKEN` |
| `DISCORD_VOTING_WEBHOOK_URL` | secret | same value as the GitHub Actions secret |
| `DISCORD_VOTING_ALERTS_WEBHOOK_URL` | secret | same value as the GitHub Actions secret |
| `CRON_TOKEN` | secret | new random value, HTTP trigger auth only |
| `HEALTHCHECKS_PING_URL` | secret | from the new healthchecks.io check; optional |

The GitHub workflow additionally gets `HEALTHCHECKS_PING_URL` as a repo secret so the backstop pass pings too.

## Work plan

### Phase 0: prerequisites (Kasper, manual)

Secret values cannot be read back out of GitHub or Cloudflare, so the values below must come from you. Everything else in this plan Claude can do.

- [x] Create a free healthchecks.io account and one check (done 2026-07-13; ping URL handed over and verified end to end).
- [x] Provide the values for `ADMIN_TOKEN`, `DISCORD_VOTING_WEBHOOK_URL`, and `DISCORD_VOTING_ALERTS_WEBHOOK_URL` (provided 2026-07-13).

### Phase 1: code (Claude)

- [x] Node decoupling refactor (decision 6): `cli.mjs`, `handoff-node.mjs`, workflow entry point update, import fixes in tests.
- [x] Companion Worker: `worker.mjs`, `wrangler.jsonc` with the three cron expressions, Copenhagen gate, `CRON_TOKEN`-gated fetch trigger, Discord-attachment handoff writer, healthchecks ping helper (also wired into `cli.mjs` for the GitHub path).
- [x] Tests for the new pieces; full `npm test` green (200 tests).
- [x] `deploy:cron` npm script.
- [x] Docs: voting-system.md scheduler section, deployment-guide.md, CLAUDE.md deploy-rule exception. (No roadmap entry existed for this; nothing to resolve there.)
- [ ] Commit and push after your review and explicit go-ahead (push deploys the Pages site, but nothing in this phase changes site behaviour; the Worker is already live from local code, identical to the tree under review).

### Phase 2: deploy and configure (Claude, with values and go-ahead from Kasper)

- [x] Generate `CRON_TOKEN`, set all Worker secrets via `wrangler secret put`. The token is saved on the maintainer's machine at `~/.gamestormers-cron-token` (not in the repo).
- [x] `npm run deploy:cron`; the Worker is live at `https://gamestormers-voting-cron.kkandersen01.workers.dev` with crons `0 7 * * *`, `0 8 * * *`, `30 12 * * *`.
- [x] Set `HEALTHCHECKS_PING_URL` on the Worker and as a GitHub repo secret; a manual pass returned `healthcheckPing: "ok"`.
- [x] Smoke test passed: authenticated `POST` returned `{"action":"noop","roundId":20,...,"healthcheckPing":"skipped"}`, wrong token 401, GET 404, no Discord posts.

### Phase 3: burn-in (both, roughly two weeks)

- [ ] Leave both clocks running. Round 20 voting opens 2026-07-21: expect the Worker to post the voting-open announcement at 09:00 sharp and the later GitHub pass to no-op. Verify exactly one `voting_opened` event and one announcement.
- [ ] Watch healthchecks stay green daily; optionally test the alarm once by pausing the Worker cron for a day (Kasper's call, since it fires a real alert email).
- [ ] Round 20 voting closes 2026-07-30: the reveal path exercises the Worker's handoff-as-attachment delivery if manual fields are missing.

### Phase 4: review (Kasper decides, Claude executes)

- [ ] Decide the GitHub workflow's future: keep daily (recommended, free redundancy), thin to weekly, or retire.
- [ ] Docs touch-up reflecting the decision.

## Rollback

`wrangler delete` on `gamestormers-voting-cron` (or redeploying it without cron triggers) returns the system exactly to today's state: GitHub Actions with the fixed gate as the only clock. The Phase 1 refactor is behaviour-neutral for the GitHub path and does not need reverting.

## Out of scope

Automatic round creation, Durable Object alarms for second-precision local-time firing, and Cloudflare Workflows modelling a whole round lifecycle were considered and set aside: the daily-pass model with two clocks and a watchdog gets the reliability without new paradigms. Revisit only if requirements change (for example announcements needed at exact minute precision).
