# Aarhus Gamestormers Website

Website for [Aarhus Gamestormers](https://www.gamestormers.dk), a monthly video game discussion club in Aarhus, Denmark. Like a book club, but for games.

## Live Site

**[www.gamestormers.dk](https://www.gamestormers.dk)**

Hosted on Cloudflare Pages. Changes pushed to `main` deploy automatically.

## Structure

```
/
├── index.html          # Danish version (primary)
├── en/index.html       # English version
├── index_en.html       # Redirect to /en/ for old links
├── css/style.css       # All styles
├── js/script.js        # Calendar dropdowns, countdown, history, sale badges
├── data/               # Generated Steam/GOG sale data for upcoming events
├── img/                # Logos and social images
├── favicon/            # Favicon image
├── robots.txt
└── sitemap.xml
```

## Making Changes

All content is hardcoded in HTML. There is no build step or CMS. Agent maintenance guidance starts in [CLAUDE.md](CLAUDE.md), which links to focused docs under `docs/`; read the relevant guide before changing events, history cards, SEO metadata, voting, or deployment details.

Common updates:

1. Edit upcoming events in both `index.html` and `en/index.html`.
2. Keep event cards, calendar links, ICS attributes, and JSON-LD `Event` blocks in sync.
3. Add past meetings to the history grid in both languages.
4. Update `sitemap.xml` `lastmod` for meaningful content changes.

## Automation

Two GitHub Actions workflows handle background work:

- `.github/workflows/update-steam-sales.yml` refreshes Steam and GOG discount data for upcoming event store links and writes JSON files in `data/`.
- `.github/workflows/voting-automation.yml` runs the voting scheduler (`automation/voting/`) once a day (around 09:00 Copenhagen) and on demand: it announces suggestions, opens voting on the scheduled date, reveals the winner from the D1 tallies after voting closes, posts the final Discord reveal only when setup is complete, and uploads a maintainer handoff when fields are missing. It is idempotent and never edits HTML or commits to the repo. Final homepage publication stays manual via [MEETING_WORKFLOW.md](MEETING_WORKFLOW.md). See [docs/voting-system.md](docs/voting-system.md) for the runner flow and [docs/deployment-guide.md](docs/deployment-guide.md) for the required secrets.

## Deployment

No app build process. Push to `main` and Cloudflare Pages deploys automatically. For a manual direct upload, use `npm run deploy`; it prepares a clean `.deploy/pages` artifact so local secrets and project notes are not uploaded as public assets.
