# Deployment And Preview Guide

The site is hosted on Cloudflare Pages. Pushing to `main` deploys automatically.

## Local Preview

Use the Cloudflare Pages dev server when you need to see the rendered site or test `/api/*`:

```powershell
npm run dev
```

On Windows, you can also double-click `dev-preview.cmd` in the repo root. It starts the same dev server and opens `http://127.0.0.1:8788/` in your browser.

This runs:

```powershell
npx wrangler pages dev .
```

Open:

```text
http://127.0.0.1:8788/
```

Also useful:

- `http://127.0.0.1:8788/vote.html`
- `http://127.0.0.1:8788/en/vote.html`
- `http://127.0.0.1:8788/vote-admin.html`

Do not rely on an IDE or agent raw-file preview for verification. Raw-file preview breaks absolute asset paths such as `/css/style.css` and cannot run the Pages Functions under `/api/*`.

For `vote-admin.html`, use the local `ADMIN_TOKEN` from `.dev.vars`. The current local value is expected to be `test`.

If `/api/*` fails with a missing-table error, apply the local D1 schema once:

```powershell
wrangler d1 execute gamestormers --local --file=./schema.sql
```

`.dev.vars` must include `TURNSTILE_SECRET` and `ADMIN_TOKEN`. `DISCORD_SUGGESTIONS_WEBHOOK_URL` is optional and enables new-suggestion notifications.

Local preview uses Cloudflare's always-pass Turnstile test sitekey automatically. If the local admin token or Turnstile secret changes, restart the dev server so Wrangler reloads `.dev.vars`.

## Cloudflare Pages Settings

- Project root: `/`
- Build command: empty
- Pages build output directory: `.`
- D1 binding: `DB`
- Required encrypted environment variables: `TURNSTILE_SECRET`, `ADMIN_TOKEN`
- Optional encrypted environment variable: `DISCORD_SUGGESTIONS_WEBHOOK_URL` (enables new-suggestion Discord notifications; distinct from the sales workflow's GitHub Actions secret `DISCORD_WEBHOOK_URL`)

Before production deployment, replace any placeholder D1 `database_id` in `wrangler.toml`.

## Manual Direct Upload

Use:

```powershell
npm run deploy
```

This prepares `.deploy/pages` with only public static assets plus `functions/`, then deploys that clean artifact.

Do not run:

```powershell
wrangler pages deploy .
```

Deploying the repo root can upload local-only files such as `.dev.vars` as public assets.

Do not run:

```powershell
wrangler deploy
```

That command targets Workers, not Pages.

## Cloudflare Install Phase

Cloudflare runs `npm clean-install`, so `package.json` and `package-lock.json` must stay in sync even though the app has no runtime npm dependencies.

## Hosting

Cloudflare Pages is the sole host of `www.gamestormers.dk` (confirm with the `Server: cloudflare` response header). GitHub Pages was retired on 2026-06-16: the `CNAME` file was removed and GitHub Pages was disabled in repo settings, so the `pages-build-deployment` workflow no longer runs. Do not re-add a `CNAME` file or re-enable GitHub Pages.

## Legacy Files

- `.htaccess` is kept for reference. It is inert on Cloudflare Pages.

## Commit And Push Safety

Do not commit or push unless explicitly asked. Pushing to `main` deploys the live site.
