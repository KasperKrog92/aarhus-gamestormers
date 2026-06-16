# Agent Instructions

This repository's agent memory entry point lives in [CLAUDE.md](CLAUDE.md).

Before changing code or content, read `CLAUDE.md` and the focused docs it links to. Keep `AGENTS.md` lightweight; update the relevant file in `docs/` when the actual project workflow changes.

When a new game has been chosen for a meeting, follow the runbook in [MEETING_WORKFLOW.md](MEETING_WORKFLOW.md).

For the game suggestion & voting feature (Cloudflare Pages Functions + D1, under `functions/` and the `vote*.html` pages), see [docs/voting-system.md](docs/voting-system.md).

## Local preview / dev server

To actually see the site rendered, run the Cloudflare Pages dev server and open it in a **real browser** — do **not** rely on the IDE/agent "Preview" panel:

```
npm run dev   # = npx wrangler pages dev .  → http://127.0.0.1:8788
```

The agent Preview panel renders the raw `.html` file directly. That breaks two things:

- **Absolute asset paths** like `/css/style.css` have no server to resolve against, so the page shows up unstyled.
- **The `/api/*` calls** (voting + `vote-admin.html`) have no backend, so the token gate and any dynamic data never load.

`wrangler pages dev` fixes both: it serves the static files, runs the Pages Functions under `/api/*`, and binds the **local** D1 database. Then:

- Open `http://127.0.0.1:8788/` (or `/vote.html`, `/vote-admin.html`) in a browser to verify styling and behaviour.
- For `vote-admin.html`, connect with the `ADMIN_TOKEN` from `.dev.vars` (local value is `test`).
- First-time setup (if `/api/*` errors with a missing-table error) needs the local D1 schema applied once:
  `wrangler d1 execute gamestormers --local --file=./schema.sql`. `.dev.vars` must hold `TURNSTILE_SECRET` (Turnstile test secret) and `ADMIN_TOKEN`.

When changing `css/style.css`, bump its `?v=N` query string on the affected page(s) so the dev server / browser doesn't serve a stale stylesheet.
