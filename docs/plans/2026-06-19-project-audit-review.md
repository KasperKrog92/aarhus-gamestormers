# Project Audit Review

Date: 2026-06-19 (re-reviewed 2026-06-20)

Scope: review-only audit of the static site, Pages Functions, D1 helpers, admin UI, scheduler, deployment scripts, and maintenance docs. No implementation has been done.

Validation run during audit:

- `npm test` passed: 146 tests, 0 failures (was 131 at first audit; new tests cover the `clean`/`cleanLine` text hardening and the round-only delete semantics).
- Latest `@cloudflare/workers-types` checked: `4.20260620.1`.
- Cloudflare Workers best-practices reference checked for request handling, `waitUntil`, secrets, compatibility dates, observability, and testing guidance.

## Re-review status (2026-06-20)

Since the first audit, two commits landed that touch these findings:

- `ac2a6f8 Fix doc-accuracy drift and complete schedule-column migration helper` resolved Finding 6 (README workflow) and Finding 8 (`voting_closes_at` migration helper).
- `fdf876b Harden user text fields against control/invisible characters` added shared `clean()`/`cleanLine()` helpers (`functions/_lib/http.js:40-60`) now used across admin and member input. This partially mitigates Finding 2 (control/invisible characters are stripped) but does not add protocol validation.

Remaining open findings, by current severity: Findings 2, 3, 4 (Medium); Findings 1, 5, 7, 9 (Low). Some line-number references below have shifted with the new code and are corrected in place.

Finding 1 product semantics were decided on 2026-06-20: round deletion deletes the voting round only and leaves the public meeting record live. The current code already behaves this way, so Finding 1 drops from High to a Low copy-clarity item, with broader public-meeting management deferred to a future admin section.

## Summary

The project is in a healthy functional state: the voting workflow has focused unit coverage, the D1-backed homepage path is documented, and the deployment allowlist protects local-only files during manual Pages upload.

The main opportunities are not broad rewrites. They are small hardening passes around admin delete semantics, URL validation, request-size limits, secret comparison, and stale documentation. A few cleanup items would reduce future confusion, especially now that D1 is the source of truth for meeting content.

## Findings

### 1. Round deletion can leave public meeting content behind

Severity: Low (semantics decided 2026-06-20 — behavior is correct, copy clarity remains)

Decision (2026-06-20): Deleting a round should delete the voting round only. The public meeting record must remain public. There is no "cascade into meetings" requirement. Managing or removing public meetings is deferred to the future-scope admin section below.

This makes the current code behavior correct: `adminDeleteRound` already deletes only from `rounds` (`functions/api/admin/[[route]].js:181-185`), so the surviving `meetings` row is now intended, not a bug. What remains is a copy-clarity gap so the maintainer is not surprised that the homepage meeting persists.

Evidence:

- `functions/api/admin/[[route]].js:181-185` deletes only from `rounds`, which matches the decision.
- `schema.sql:34-50` defines `meetings` as an independent table whose `id` matches `rounds.id`; keeping it free of `ON DELETE CASCADE` from `rounds` is now the intended design.
- `functions/_lib/db.js:589-660` reads homepage data from `meetings`, so a selected meeting stays public after its round is deleted (intended).
- `vote-admin.html:451` confirms "Delete round #N and ALL its suggestions and votes? This cannot be undone." and the button label is "Delete round" (`vote-admin.html:455`); neither states that the public meeting record survives.

Remaining fix (small, in scope) — DONE 2026-06-20:

- Button renamed to "Delete voting round only" and the confirm copy now states the public meeting/homepage card is not removed (`vote-admin.html:450-455`).
- Comment added near `adminDeleteRound` documenting the deliberate round-only semantics so a future change does not add a meetings cascade (`functions/api/admin/[[route]].js:181-191`).
- Test added asserting a round delete hits only `rounds` and never touches `meetings` (`test/admin-round-meeting.test.mjs`, "deleting a round removes only the round and leaves the public meeting row").
- Documented the round-delete endpoint and its round-only semantics in `docs/voting-system.md` (admin endpoints table).

The broader public-meeting management work (a dedicated admin section to cancel or remove public meetings independently of voting rounds) is tracked in [`docs/roadmap.md`](../roadmap.md).

### 2. Admin-entered URLs are rendered publicly without server-side protocol validation

Severity: Medium (partially mitigated 2026-06-20)

Update: `fdf876b` routes admin URL fields through `cleanLine()` (`functions/_lib/http.js:52-60`), which strips control and invisible characters and collapses whitespace. That closes the invisible-character vector but does not validate the URL scheme, so the protocol concern below still stands.

Evidence:

- Member-entered non-Steam store URLs are checked with `isHttpUrl()` in `functions/api/suggest.js:23-30` and `functions/api/suggest.js:136`.
- Admin now cleans, but does not scheme-validate, store URL strings via `cleanLine()` in `functions/api/admin/[[route]].js:488-495` (`image`, `storeUrl`, `gogUrl`, `hltbUrl`) and `functions/api/admin/[[route]].js:556-563` (`discordInvite`, `discordEventUrl`).
- The public renderer escapes HTML but still emits those strings into `href` and `src` attributes in `js/meetings.js:203-225`, `js/meetings.js:312`, `js/meetings.js:326`, and `js/meetings.js:346-355`.

Risk:

The admin UI uses `type="url"`, which helps in the browser, but the API accepts direct requests too. `escapeHtml()` neutralizes HTML metacharacters but not a scheme such as `javascript:`, so a malformed URL, `javascript:` URL, or non-image URL could be stored and later rendered into public links or images. This is mostly admin-trust hardening, but it is exactly the kind of bug that survives because all normal admin flows look fine.

Suggested fix:

Move URL validation into a shared backend helper, for example `cleanHttpUrl(value, maxLen)`, and use it for admin `storeUrl`, `gogUrl`, `hltbUrl`, `image`, `discordInvite`, and `discordEventUrl`. Consider stricter host allowlists for Steam, GOG, HowLongToBeat, Discord event URLs, and Steam CDN image URLs.

### 3. JSON request bodies are parsed without size or content-type guardrails

Severity: Medium

Evidence:

- `functions/_lib/http.js:19-24` calls `request.json()` directly.
- Public and admin write endpoints use it in `functions/api/vote.js:19`, `functions/api/suggest.js:37`, and multiple admin handlers in `functions/api/admin/[[route]].js`.
- Cloudflare's current Workers guidance recommends enforcing a maximum size before consuming request bodies when reading JSON payloads.

Risk:

The app trims individual fields after parsing, but a client can still send an oversized JSON body. In Workers, buffering large bodies can waste memory before the app reaches field-level caps.

Suggested fix:

Replace `readJson(request)` with a guarded version:

- Reject unexpected `content-type` for write endpoints.
- Check `content-length` when present.
- Read text up to a small maximum, for example 16-64 KB depending on admin copy needs.
- Return a clear `413 Payload too large` for oversized bodies.

Add focused tests for invalid content type, invalid JSON, and oversized payloads.

### 4. Admin token comparison should use Web Crypto fixed-size comparison

Severity: Medium

Evidence:

- `functions/_lib/auth.js:4-17` uses a custom character-code comparison and returns early on length mismatch.
- Current Workers types expose `crypto.subtle.timingSafeEqual()`, and Cloudflare's best-practices docs recommend hashing both secret values to a fixed size before comparing.

Risk:

The current code is better than a plain `===`, but it still leaks length and relies on a custom implementation. Because this protects the admin API, it is worth using the platform primitive.

Suggested fix:

Make `isAdmin` async, hash the provided and expected tokens with SHA-256, compare the fixed-size hashes with `crypto.subtle.timingSafeEqual()`, and update the admin route/tests accordingly.

### 5. Wrangler compatibility date and observability are stale or absent

Severity: Low

Evidence:

- `wrangler.toml:23` sets `compatibility_date = "2024-11-01"`.
- `wrangler.toml` has no observability configuration.
- The current date is 2026-06-20, so the compatibility date is more than 19 months old.

Risk:

This is not breaking today. The code is mostly platform-standard JavaScript and the tests are green. Still, a stale compatibility date can hide runtime behavior changes until they are adopted under pressure. Missing observability also makes intermittent Pages Function failures harder to diagnose after deployment.

Suggested fix:

Plan a small platform-maintenance pass:

- Update the compatibility date after checking the Cloudflare changelog and running local/browser smoke tests.
- Evaluate whether Pages Functions support the desired observability settings for this project, then enable logs/traces if applicable.
- Consider `wrangler types` only if the project moves toward TypeScript or generated binding documentation.

### 6. `README.md` still describes the old manual HTML content workflow

Severity: Low — RESOLVED 2026-06-20 (`ac2a6f8`)

The README "Making Changes" section (`README.md:39-49`) now states the homepage event/history sections are database-backed via `GET /api/meetings/public` and are entered through `vote-admin.html`, with static HTML cards noted as the no-JS / empty-database fallback. No further action needed.

Original evidence (for history):

- `README.md:27-36` said all content was hardcoded in HTML and listed editing `index.html` and `en/index.html` as common updates.
- Current docs say homepage event/history content is D1-backed and entered through `vote-admin.html`: `docs/content-guide.md:1-15`, `docs/project-guide.md:56-61`, and `MEETING_WORKFLOW.md:1-7`.

### 7. The admin page is documented as unlisted but is linked from public footers

Severity: Low

Evidence:

- `docs/voting-system.md:17` and `docs/project-guide.md:72` call `vote-admin.html` unlisted.
- `vote-admin.html:6` has `noindex,nofollow`, and `robots.txt:3` disallows `/vote-admin`.
- Public pages include a disguised footer anchor to `/vote-admin/` (a single styled `o` in "Gamestormers" with `style="all:unset"`, an easter-egg-style link rather than a visible nav item) in `index.html:744`, `en/index.html:744`, `vote.html:86`, `en/vote.html:86`, and now also `privacy.html:177` and `en/privacy.html:177` (the privacy pages added in `e87b273`).

Risk:

This is not a direct security issue because the admin API is token-gated, but the docs and page source disagree. The link is visually hidden, yet crawlers and anyone reading the source can still discover the admin URL.

Suggested fix:

Either remove the public footer anchor or update the docs to say the admin is token-gated and hidden from navigation/search, not truly unlisted.

### 8. Runtime schema helpers do not fully mirror the current round schema

Severity: Low — RESOLVED 2026-06-20 (`ac2a6f8`)

`ensureRoundScheduleColumns()` now adds `voting_closes_at` alongside the other schedule columns (`functions/_lib/db.js:40-50`), so the lazy migration helper mirrors the documented round schema. No further action needed.

### 9. Local Wrangler dev logs are untracked and not ignored

Severity: Low

Evidence:

- At the first audit, `git status --short` showed `.wrangler-dev.err.log` and `.wrangler-dev.out.log` as untracked. As of 2026-06-20 the working tree is clean and those files are not present, but they will reappear whenever `npm run dev` is run.
- `.gitignore:5-8` ignores `.wrangler/`, `.dev.vars`, and `.deploy/`, and line 11 ignores `automation-output/`, but still not `.wrangler-dev*.log`.

Risk:

Tiny housekeeping issue, but these logs will keep showing up in status whenever the dev server runs and could be accidentally committed later if they grow useful-looking.

Suggested fix:

Add `.wrangler-dev*.log` or `*.log` to `.gitignore`, depending on whether broader log ignoring is acceptable for this repo.

## Refactor Opportunities

These are not urgent, but they would pay down complexity:

- Introduce shared server-side validators for date, time, HTTP URL, Discord event URL, and positive integer fields. Right now validation is split between `schedule.js`, `suggest.js`, and admin route branches.
- Extract admin route handlers into smaller modules once the next feature lands. `functions/api/admin/[[route]].js` is doing routing, validation, meeting shaping, selected-game editing, Discord posting, and automation-event writes in one 600+ line file.
- Add a small API error wrapper for Pages Functions so unexpected exceptions become structured JSON logs and structured JSON responses.
- Consider a Workers-runtime test layer for the Pages Functions later. The current Node tests are fast and useful, but they do not exercise real runtime constraints like request body handling, bindings, and compatibility flags.

## Suggested Order

Remaining open items only (Findings 6 and 8 are resolved):

1. Add backend URL scheme validation for admin-edited public fields, on top of the existing `cleanLine()` character stripping (Finding 2).
2. Add guarded JSON parsing and tests (Finding 3).
3. Replace admin token comparison with Web Crypto hash comparison (Finding 4).
4. Reconcile the admin "unlisted" wording with the disguised footer link (Finding 7).
5. Do the compatibility-date and observability maintenance pass (Finding 5).
6. Add `.wrangler-dev*.log` to `.gitignore` (Finding 9).

Future scope from Finding 1 (a full admin section for past and upcoming games / public meetings) now lives in [`docs/roadmap.md`](../roadmap.md).

## Non-Findings

- The current test suite is green (146 tests as of 2026-06-20).
- The manual deploy path uses `scripts/prepare-pages-deploy.mjs` and an allowlist, which keeps `.dev.vars`, Markdown docs, schema files, package metadata, and local project folders out of manual Pages uploads.
- Public vote tallies remain hidden until revealed, and the public current-round API omits the storm code.
- Public text rendering uses escaping or `textContent` in the reviewed dynamic paths; the URL issue above is about protocol validation, not raw HTML injection.
