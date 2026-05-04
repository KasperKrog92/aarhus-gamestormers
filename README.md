# Aarhus Gamestormers Website

Website for [Aarhus Gamestormers](https://www.gamestormers.dk) — a monthly video game discussion club in Aarhus, Denmark. Like a book club, but for games.

## Live site

**[www.gamestormers.dk](https://www.gamestormers.dk)**

Hosted on GitHub Pages. Changes pushed to `main` go live automatically.

## Structure

```
/
├── index.html          # Danish version (primary)
├── index_en.html       # English version
├── css/style.css       # All styles
├── img/
│   ├── covers/         # Game cover images (one per upcoming event)
│   └── ...             # Logos and store icons
└── favicon/            # Favicon set
```

## Making changes

All content is hardcoded in HTML — there is no build step or CMS.

### Adding a new upcoming event

1. Add the game cover image to `img/covers/`
2. Copy an existing `<li class="event">` block in both `index.html` and `index_en.html`
3. Update the date, title, store links, description, and image path
4. Commit and push — the site updates automatically

### Moving an event to history

1. Remove the `<li class="event">` block from the events section
2. Add a new `<li>` entry to the history list (`<ol class="ticks">`)
3. Update both `index.html` and `index_en.html`

### Updating text or links

Edit the relevant section directly in `index.html` (Danish) and `index_en.html` (English). Keep both files in sync.

## Deployment

No build process. Push to `main` and GitHub Pages deploys automatically.
