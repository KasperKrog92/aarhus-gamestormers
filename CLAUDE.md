# Aarhus Gamestormers Website

This is the canonical agent memory entry point for the Aarhus Gamestormers website.

Before changing code or content, read the relevant docs below. Keep this file lightweight: update the focused docs when workflow, content, SEO, voting, or deployment assumptions change.

## What This Project Is

A static HTML website for Aarhus Gamestormers, a monthly video game discussion club in Aarhus, Denmark. The club is modeled after a book club: members play a selected game at home, then gather to discuss it.

The repo is `github.com/KasperKrog92/aarhus-gamestormers`. The live site is `https://www.gamestormers.dk`.

## Memory Map

- [`docs/project-guide.md`](docs/project-guide.md): project structure, technology, pages, CSS component contracts, images, and i18n.
- [`docs/content-guide.md`](docs/content-guide.md): event cards, history cards, calendar links, store links, SEO metadata, and content verification.
- [`docs/voting-system.md`](docs/voting-system.md): Cloudflare Pages Functions, D1 schema/API, suggestion curation, voting phases, Discord login, and admin behavior.
- [`docs/deployment-guide.md`](docs/deployment-guide.md): local preview, Cloudflare Pages settings, manual deploy safety, and D1 setup.
- [`docs/roadmap.md`](docs/roadmap.md): future work that is intentionally out of scope for current changes.
- [`MEETING_WORKFLOW.md`](MEETING_WORKFLOW.md): step-by-step runbook when a new game has been chosen for a meeting.

`AGENTS.md` is intentionally a short pointer for Codex-style tools. Do not duplicate detailed workflow guidance there.

## High-Priority Rules

- The page shell (hero, nav, about copy, SEO `<head>`) is hardcoded in HTML; keep `index.html` and `en/index.html` structurally synchronized. Homepage event/history content is D1-backed and entered through `vote-admin.html`, not by hand-editing HTML. The static event/history cards remain only as a no-JS/empty-database fallback. See [`docs/content-guide.md`](docs/content-guide.md).
- Writing style: avoid em dashes in site copy and agent-authored prose. Keep wording plain and specific, not generic AI-sounding filler.
- When a new game has been chosen, follow [`MEETING_WORKFLOW.md`](MEETING_WORKFLOW.md).
- Always verify Steam app IDs from the canonical Steam store URL before using banners or links.
- Ask the maintainer for the HowLongToBeat link and hours; this project does not fetch HLTB automatically.
- For meaningful content changes, update `sitemap.xml` `lastmod` for both language URLs.
- When changing `css/style.css`, bump its `?v=N` query string on affected pages.
- Do not commit or push unless explicitly asked. Pushing to `main` deploys the live site.
- When asked to "commit and push" (or to commit), first update any Markdown docs affected by the change (`CLAUDE.md`, `docs/*.md`, `MEETING_WORKFLOW.md`, `README`, etc.) so documentation lands in the same commit as the code.

## Local Preview

Use the Cloudflare Pages dev server for real verification:

```powershell
npm run dev
```

Open `http://127.0.0.1:8788/`.

Use the dev server instead of a raw-file preview. Raw-file preview breaks absolute asset paths and cannot run `/api/*` Pages Functions.

For `vote-admin.html`, use the `ADMIN_TOKEN` from `.dev.vars`; the local value is expected to be `test`.

To exercise the member-gated suggest/vote flow without real Discord OAuth, visit `http://127.0.0.1:8788/api/auth/dev-login`. It mints a fake member session and redirects to `/vote`. Add `?member=0` to test the non-member path, or `?returnTo=/en/vote` to land on the English page. This endpoint only works locally: it is gated behind `DEV_LOGIN=true` in `.dev.vars` (absent in production) and a localhost host check. Log out again with the normal "Log out" button. Requires `SESSION_SECRET` in `.dev.vars`.

If `/api/*` reports missing D1 tables, run:

```powershell
wrangler d1 execute gamestormers --local --file=./schema.sql
```

## Dynamic Feature

The game suggestion and voting feature lives in:

- `vote.html`
- `en/vote.html`
- `vote-admin.html`
- `js/vote.js`
- `functions/`
- `schema.sql`

Read [`docs/voting-system.md`](docs/voting-system.md) before changing it.

## Deployment

Cloudflare Pages deploys automatically from `main`.

For manual direct upload, use:

```powershell
npm run deploy
```

Never deploy the repo root with `wrangler pages deploy .`, because local-only files such as `.dev.vars` can be uploaded as public assets. Do not use `wrangler deploy`; that targets Workers, not Pages.
