# Aarhus Gamestormers Website

Website for [Aarhus Gamestormers](https://www.gamestormers.dk), a monthly video game discussion club in Aarhus, Denmark. Like a book club, but for games.

## Live Site

**[www.gamestormers.dk](https://www.gamestormers.dk)**

Hosted on GitHub Pages. Changes pushed to `main` deploy automatically.

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

All content is hardcoded in HTML. There is no build step or CMS. The detailed maintenance guide lives in [CLAUDE.md](CLAUDE.md); read that before changing events, history cards, SEO metadata, or deployment details.

Common updates:

1. Edit upcoming events in both `index.html` and `en/index.html`.
2. Keep event cards, calendar links, ICS attributes, and JSON-LD `Event` blocks in sync.
3. Add past meetings to the history grid in both languages.
4. Update `sitemap.xml` `lastmod` for meaningful content changes.

## Automation

The GitHub Actions workflow in `.github/workflows/update-steam-sales.yml` refreshes Steam and GOG discount data for upcoming event store links and writes JSON files in `data/`.

## Deployment

No build process. Push to `main` and GitHub Pages deploys automatically.
