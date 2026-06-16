# Aarhus Gamestormers Website

This is the canonical agent memory entry point for the Aarhus Gamestormers website.

Before changing code or content, read the relevant docs below. Keep this file lightweight: update the focused docs when workflow, content, SEO, voting, or deployment assumptions change.

## What This Project Is

A static HTML website for Aarhus Gamestormers, a monthly video game discussion club in Aarhus, Denmark. The club is modeled after a book club: members play a selected game at home, then gather to discuss it.

The repo is `github.com/KasperKrog92/aarhus-gamestormers`. The live site is `https://www.gamestormers.dk`.

## Memory Map

- [`docs/project-guide.md`](docs/project-guide.md): project structure, technology, pages, CSS component contracts, images, and i18n.
- [`docs/content-guide.md`](docs/content-guide.md): event cards, history cards, calendar links, store links, SEO metadata, and content verification.
- [`docs/voting-system.md`](docs/voting-system.md): Cloudflare Pages Functions, D1 schema/API, suggestion curation, voting phases, Turnstile, and admin behavior.
- [`docs/deployment-guide.md`](docs/deployment-guide.md): local preview, Cloudflare Pages settings, manual deploy safety, and D1 setup.
- [`MEETING_WORKFLOW.md`](MEETING_WORKFLOW.md): step-by-step runbook when a new game has been chosen for a meeting.

`AGENTS.md` is intentionally a short pointer for Codex-style tools. Do not duplicate detailed workflow guidance there.

## High-Priority Rules

- Content is hardcoded in HTML. Keep `index.html` and `en/index.html` structurally synchronized.
- Writing style: avoid em dashes in site copy and agent-authored prose. Keep wording plain and specific, not generic AI-sounding filler.
- When a new game has been chosen, follow [`MEETING_WORKFLOW.md`](MEETING_WORKFLOW.md).
- Always verify Steam app IDs from the canonical Steam store URL before using banners or links.
- Ask the maintainer for the HowLongToBeat link and hours; this project does not fetch HLTB automatically.
- For meaningful content changes, update `sitemap.xml` `lastmod` for both language URLs.
- When changing `css/style.css`, bump its `?v=N` query string on affected pages.
- Do not commit or push unless explicitly asked. Pushing to `main` deploys the live site.

## Local Preview

Use the Cloudflare Pages dev server for real verification:

```powershell
npm run dev
```

Open `http://127.0.0.1:8788/`.

Use the dev server instead of a raw-file preview. Raw-file preview breaks absolute asset paths and cannot run `/api/*` Pages Functions.

For `vote-admin.html`, use the `ADMIN_TOKEN` from `.dev.vars`; the local value is expected to be `local-admin-token`.

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
