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

`.dev.vars` must include `TURNSTILE_SECRET` and `ADMIN_TOKEN`.

Local preview uses Cloudflare's always-pass Turnstile test sitekey automatically. If the local admin token or Turnstile secret changes, restart the dev server so Wrangler reloads `.dev.vars`.

## Cloudflare Pages Settings

- Project root: `/`
- Build command: empty
- Pages build output directory: `.`
- D1 binding: `DB`
- Required encrypted environment variables: `TURNSTILE_SECRET`, `ADMIN_TOKEN`

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

## Legacy Files

- `CNAME` is kept for the previous GitHub Pages setup.
- `.htaccess` is kept for reference.

Both are inert on Cloudflare Pages.

## Commit And Push Safety

Do not commit or push unless explicitly asked. Pushing to `main` deploys the live site.
