# Project Audit Review

Date: 2026-06-19

Scope: review-only audit of the static site, Pages Functions, D1 helpers, admin UI, scheduler, deployment scripts, and maintenance docs. No implementation has been done.

Validation run during audit:

- `npm test` passed: 131 tests, 0 failures.
- Latest `@cloudflare/workers-types` checked: `4.20260619.1`.
- Cloudflare Workers best-practices reference checked for request handling, `waitUntil`, secrets, compatibility dates, observability, and testing guidance.

## Summary

The project is in a healthy functional state: the voting workflow has focused unit coverage, the D1-backed homepage path is documented, and the deployment allowlist protects local-only files during manual Pages upload.

The main opportunities are not broad rewrites. They are small hardening passes around admin delete semantics, URL validation, request-size limits, secret comparison, and stale documentation. A few cleanup items would reduce future confusion, especially now that D1 is the source of truth for meeting content.

## Findings

### 1. Round deletion can leave public meeting content behind

Severity: High

Evidence:

- `functions/api/admin/[[route]].js:181-185` deletes only from `rounds`.
- `schema.sql:34-50` defines `meetings` as an independent table whose `id` should match `rounds.id`, but it is not a child table with `ON DELETE CASCADE`.
- `functions/_lib/db.js:589-660` reads homepage data from `meetings`, so a selected meeting can remain public after its round has been deleted.
- `vote-admin.html:458-462` warns about deleting the round, suggestions, and votes, but not the public meeting record.

Risk:

If the admin uses "Delete round" to clean up a mistaken or cancelled meeting, the voting round disappears but the homepage/public API may still show the matching meeting or selected game. That makes the admin state and public state diverge.

Suggested fix:

Decide the product semantics explicitly.

- If deleting a round should delete its public meeting, delete `meetings.id = round.id` in the same admin operation, ideally in a transaction.
- If public meeting data should survive, rename the action/copy to "Delete voting round only" and add a separate "Cancel public meeting" path that sets `meetings.status = 'cancelled'`.
- Add a test covering the selected behavior.

### 2. Admin-entered URLs are rendered publicly without server-side protocol validation

Severity: Medium

Evidence:

- Member-entered non-Steam store URLs are checked with `isHttpUrl()` in `functions/api/suggest.js:22-30` and `functions/api/suggest.js:125-126`.
- Admin edits store raw URL strings in `functions/api/admin/[[route]].js:491-498`, `functions/api/admin/[[route]].js:619-622`, and `functions/api/admin/[[route]].js:559-565`.
- The public renderer escapes HTML but still emits those strings into `href` and `src` attributes in `js/meetings.js:199-229`, `js/meetings.js:310-326`, and `js/meetings.js:344-350`.

Risk:

The admin UI uses `type="url"`, which helps in the browser, but the API accepts direct requests too. A malformed URL, `javascript:` URL, or non-image URL could be stored and later rendered into public links or images. This is mostly admin-trust hardening, but it is exactly the kind of bug that survives because all normal admin flows look fine.

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

- `wrangler.toml:19` sets `compatibility_date = "2024-11-01"`.
- `wrangler.toml` has no observability configuration.
- The current date is 2026-06-19, so the compatibility date is more than 19 months old.

Risk:

This is not breaking today. The code is mostly platform-standard JavaScript and the tests are green. Still, a stale compatibility date can hide runtime behavior changes until they are adopted under pressure. Missing observability also makes intermittent Pages Function failures harder to diagnose after deployment.

Suggested fix:

Plan a small platform-maintenance pass:

- Update the compatibility date after checking the Cloudflare changelog and running local/browser smoke tests.
- Evaluate whether Pages Functions support the desired observability settings for this project, then enable logs/traces if applicable.
- Consider `wrangler types` only if the project moves toward TypeScript or generated binding documentation.

### 6. `README.md` still describes the old manual HTML content workflow

Severity: Low

Evidence:

- `README.md:27-36` says all content is hardcoded in HTML and lists editing `index.html` and `en/index.html` as common updates.
- Current docs say homepage event/history content is D1-backed and entered through `vote-admin.html`: `docs/content-guide.md:1-15`, `docs/project-guide.md:56-61`, and `MEETING_WORKFLOW.md:1-7`.

Risk:

New contributors or future agents may follow the README and edit fallback HTML instead of the D1/admin path.

Suggested fix:

Update the README structure and "Making Changes" section so it points to D1/admin as the live meeting-content path, while still noting that static HTML cards are fallback content.

### 7. The admin page is documented as unlisted but is linked from public footers

Severity: Low

Evidence:

- `docs/voting-system.md:17` and `docs/project-guide.md:72` call `vote-admin.html` unlisted.
- `vote-admin.html:6` has `noindex,nofollow`, and `robots.txt:3` disallows `/vote-admin`.
- Public pages include a footer anchor to `/vote-admin/` in `index.html:744`, `en/index.html:744`, `vote.html:86`, and `en/vote.html:86`.

Risk:

This is not a direct security issue because the admin API is token-gated, but the docs and page source disagree. Crawlers and curious users can discover the admin URL.

Suggested fix:

Either remove the public footer anchor or update the docs to say the admin is token-gated and hidden from navigation/search, not truly unlisted.

### 8. Runtime schema helpers do not fully mirror the current round schema

Severity: Low

Evidence:

- `schema.sql:21-26` includes `suggestions_open_months_before`, `voting_opens_months_before`, `voting_closes_months_before`, `suggestions_open_at`, `voting_opens_at`, and `voting_closes_at`.
- `functions/_lib/db.js:31-39` ensures all of those except `voting_closes_at`.

Risk:

This may be harmless if `voting_closes_at` existed before the recent scheduling changes. Still, the lazy migration helper is now an incomplete mirror of the documented schedule columns, which makes future migrations easier to misunderstand.

Suggested fix:

Add `voting_closes_at` to `ensureRoundScheduleColumns()` or add a short comment explaining why it is intentionally omitted.

### 9. Local Wrangler dev logs are untracked and not ignored

Severity: Low

Evidence:

- `git status --short` showed `.wrangler-dev.err.log` and `.wrangler-dev.out.log` as untracked.
- `.gitignore:5-11` ignores `.wrangler/`, `.dev.vars`, `.deploy/`, and `automation-output/`, but not `.wrangler-dev*.log`.

Risk:

Tiny housekeeping issue, but these logs will keep showing up in status and could be accidentally committed later if they grow useful-looking.

Suggested fix:

Add `.wrangler-dev*.log` or `*.log` to `.gitignore`, depending on whether broader log ignoring is acceptable for this repo.

## Refactor Opportunities

These are not urgent, but they would pay down complexity:

- Introduce shared server-side validators for date, time, HTTP URL, Discord event URL, and positive integer fields. Right now validation is split between `schedule.js`, `suggest.js`, and admin route branches.
- Extract admin route handlers into smaller modules once the next feature lands. `functions/api/admin/[[route]].js` is doing routing, validation, meeting shaping, selected-game editing, Discord posting, and automation-event writes in one 600+ line file.
- Add a small API error wrapper for Pages Functions so unexpected exceptions become structured JSON logs and structured JSON responses.
- Consider a Workers-runtime test layer for the Pages Functions later. The current Node tests are fast and useful, but they do not exercise real runtime constraints like request body handling, bindings, and compatibility flags.

## Suggested Order

1. Fix or clarify round deletion semantics.
2. Add backend URL validation for admin-edited public fields.
3. Add guarded JSON parsing and tests.
4. Replace admin token comparison with Web Crypto hash comparison.
5. Update README and the admin "unlisted" wording.
6. Do the compatibility-date and observability maintenance pass.
7. Clean up `.wrangler-dev*.log` ignores and schema-helper completeness.

## Non-Findings

- The current test suite is green.
- The manual deploy path uses `scripts/prepare-pages-deploy.mjs` and an allowlist, which keeps `.dev.vars`, Markdown docs, schema files, package metadata, and local project folders out of manual Pages uploads.
- Public vote tallies remain hidden until revealed, and the public current-round API omits the storm code.
- Public text rendering uses escaping or `textContent` in the reviewed dynamic paths; the URL issue above is about protocol validation, not raw HTML injection.
