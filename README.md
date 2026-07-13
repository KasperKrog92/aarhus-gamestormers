# Aarhus Gamestormers Website

Website for [Aarhus Gamestormers](https://www.gamestormers.dk), a monthly video game discussion club in Aarhus, Denmark. Like a book club, but for games.

## Live Site

**[www.gamestormers.dk](https://www.gamestormers.dk)**

Hosted on Cloudflare Pages. Changes pushed to `main` deploy automatically.

## Structure

```
/
├── index.html          # Danish landing page (primary)
├── en/index.html       # English landing page
├── privacy.html        # Danish privacy policy (en/privacy.html is the English one)
├── vote.html           # Danish suggestion & voting page (en/vote.html is English)
├── vote-admin.html     # Maintainer curation tool, token-gated
├── 404.html            # Danish not-found page (en/404.html is English)
├── _redirects          # Cloudflare Pages redirects (e.g. old /index_en.html -> /en/)
├── css/style.css       # All styles
├── js/script.js        # Calendar dropdowns, countdown, history, sale badges
├── js/meetings.js      # Renders homepage event/history cards from the D1 API
├── js/vote.js          # Suggestion & voting UI
├── functions/          # Cloudflare Pages Functions (/api/*) for voting + meetings
├── schema.sql          # Cloudflare D1 (SQLite) schema
├── automation/voting/  # Daily voting scheduler (GitHub Actions, not Pages)
├── scripts/            # Backfill SQL generator + manual-deploy prep
├── backfill-meetings.sql  # One-time historical meeting backfill for D1
├── data/               # Generated Steam/GOG sale data for upcoming events
├── img/                # Logos and social images
├── favicon/            # Favicon image
├── docs/               # Focused maintenance guides (see CLAUDE.md)
├── wrangler.toml       # Cloudflare Pages/D1 config
├── robots.txt
└── sitemap.xml
```

## Making Changes

There is no build step or CMS. The page shell (hero, navigation, about copy, SEO `<head>`) is hardcoded in HTML, but the homepage **upcoming-events and history sections are database-backed**: they render from Cloudflare D1 through `GET /api/meetings/public`. Meeting content is entered through `vote-admin.html`, not by editing HTML. The static event/history cards in the page are only a no-JS / empty-database fallback.

Agent maintenance guidance starts in [CLAUDE.md](CLAUDE.md), which links to focused docs under `docs/`; read the relevant guide before changing events, history cards, SEO metadata, voting, or deployment details.

Common updates:

1. Add or edit a meeting and its selected game through `vote-admin.html`; the renderer (`js/meetings.js`) builds the event/history cards, calendar links, and JSON-LD for both languages. When a new game is chosen, follow [MEETING_WORKFLOW.md](MEETING_WORKFLOW.md).
2. Keep the hardcoded page shell (and any static fallback cards) in sync between `index.html` and `en/index.html`.
3. Update `sitemap.xml` `lastmod` for meaningful content changes.

## Automation

Two GitHub Actions workflows handle background work:

- `.github/workflows/update-steam-sales.yml` refreshes Steam and GOG discount data for upcoming event store links and writes JSON files in `data/`.
- `.github/workflows/voting-automation.yml` runs the voting scheduler (`automation/voting/`) once a day (around 09:00 Copenhagen) and on demand: it announces suggestions, opens voting on the scheduled date, keeps the public Discord phase posts rolling by deleting the previous phase's webhook message, reveals the winner from the D1 tallies after voting closes, posts the final Discord reveal only when setup is complete, sends private maintainer alerts for blocked or incomplete rounds, and uploads a maintainer handoff when fields are missing. It is idempotent and never edits HTML or commits to the repo. Final homepage publication stays manual via [MEETING_WORKFLOW.md](MEETING_WORKFLOW.md). See [docs/voting-system.md](docs/voting-system.md) for the runner flow and [docs/deployment-guide.md](docs/deployment-guide.md) for the required secrets.

## Deployment

No app build process beyond an allowlist copy. Push to `main` and Cloudflare Pages deploys automatically; the Pages build command runs `npm run prepare:deploy-pages`, which copies only the public files into `.deploy/pages` so repo internals (schema, docs, tests, automation source) are never served as public assets. Manual direct upload (`npm run deploy`) uses the same artifact. See [docs/deployment-guide.md](docs/deployment-guide.md).
