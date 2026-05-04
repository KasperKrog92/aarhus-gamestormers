# Aarhus Gamestormers Website

A static HTML website for Aarhus Gamestormers, a monthly video game discussion club based in Aarhus, Denmark. The club is modeled after a book club: members play a selected game at home, then gather to discuss it.

## Project Structure

```
/
├── index.html          # Danish (primary) version
├── index_en.html       # English version
├── robots.txt          # Crawl rules + sitemap reference
├── sitemap.xml         # XML sitemap with DA/EN hreflang alternates
├── css/style.css       # All styles (v5)
├── img/
│   ├── logo.png        # Header/footer logo
│   ├── logo_hero.png   # Large hero logo
│   ├── OG_image_da.jpg # Danish Open Graph/Twitter image (1200x630)
│   ├── OG_image_en.jpg # English Open Graph/Twitter image (1200x630)
│   ├── steam_icon.png  # Used in history store links
│   └── gog_icon.svg    # Used in history store links
├── favicon/            # Favicon set + site.webmanifest
├── CNAME               # GitHub Pages custom domain
├── .gitignore          # Excludes .claude/ and design_handoff_gamestormers/
└── .htaccess           # Kept for reference; not active on GitHub Pages
```

## Technology

- **Pure static HTML/CSS**: no build tools, no npm, no frameworks
- **Google Fonts**: Barlow Condensed (headings) + DM Sans (body), loaded via `<link>` in `<head>`
- **Add to Calendar Button**: upcoming event cards use the `add-to-calendar-button` web component from jsDelivr
- **Vanilla JS**: copyright year update + history accordion toggle
- **Hosted on GitHub Pages** at [www.gamestormers.dk](https://www.gamestormers.dk)
- Repo: `github.com/KasperKrog92/aarhus-gamestormers`; push to `main` deploys automatically

## Pages

| File | Language | Purpose |
|------|----------|---------|
| `index.html` | Danish | Primary landing page |
| `index_en.html` | English | For international Discord members |

Both pages share the same layout:
1. Sticky header: logo, nav links (Events -> Om/About -> Historik/History), language toggle, Discord button
2. Hero: green background with curved bottom edge, two-column grid (text + logo)
3. How it works: 3 white cards on cream background
4. Upcoming events: 2 cards on purple background with Steam CDN banners
5. About (Om): club description + practical info card
6. History: 4-column banner grid (desktop) / 2-column (mobile); each card shows the Steam banner upfront, clicking expands description + store links
7. Footer: copyright, credits, logo

## CSS Architecture (`css/style.css`)

CSS custom properties defined on `:root`:

```css
--purple:     #2B2436  /* Header, footer, events bg, history bg */
--green:      #96C38D  /* Hero bg, accents, step numbers, genre tags */
--green-dark: #7aaa71  /* Info card labels, hover states */
--green-light:#c2dbbe  /* Button hover states */
--cream:      #F7F4EE  /* Main page background */
--cream-dark: #EDE8DF  /* Card borders, info row separators */
--text:       #1C1826  /* Primary text */
--muted:      #5a5366  /* Secondary text */
--white:      #ffffff  /* Card backgrounds */
--shadow-sm/md/lg      /* Purple-tinted box shadows */
--header-h:   72px     /* 60px on mobile */
--radius:     16px     /* Card border radius */
```

Responsive breakpoint: `max-width: 860px` (single-column, hides nav text links, adjusts spacing).

Key component classes:
- `.btn-primary`, `.btn-ghost`, `.btn-green`: button variants
- `.gs-hero`, `.gs-how`, `.gs-events`, `.gs-about`, `.gs-history`, `.gs-footer`: section wrappers
- `.event-card`, `.event-cover`, `.event-body`: upcoming event cards
- `.event-details`, `.event-detail`, `.event-detail-label`, `.event-detail-value`: date/time/venue tiles inside event cards
- `.event-detail-time`: keeps approximate time ranges such as `18:30-~21:00` on one line
- `.event-venue-link`: linked venue text inside event cards
- `.event-calendar`: bottom-aligned wrapper for the add-to-calendar web component
- `.event-store-links a`: small green text pill store links (Steam/GOG)
- `.history-grid`: CSS grid, 4 columns desktop / 2 columns mobile
- `.history-card`, `.history-card.open`: banner-first grid cards (JS toggles `.open`)
- `.history-card-banner`: always-visible banner wrapper with `.history-num` badge overlay
- `.history-expand`: collapsible panel (max-height animation)
- `.history-banner`: full-width Steam header image (460/215 aspect ratio), zooms on hover
- `.info-card`, `.info-row`: practical info card in About section
- `.gs-lang a.active`: active language in DA/EN toggle

## Content Management

All content is **hardcoded in HTML**. To update:

- **Upcoming events**: Edit the events section in both `index.html` and `index_en.html`. Use Steam CDN banners: `https://cdn.akamai.steamstatic.com/steam/apps/{STEAM_APP_ID}/header.jpg`. Update the event-num badge, event-title, `.event-details` date/time/venue tiles, event-desc, store link URLs, and the matching `add-to-calendar-button` attributes. Events start at 18:30 and use 21:00 as the estimated calendar end time; visible copy should communicate that the end is approximate, e.g. `18:30-~21:00`. Venue text in the cards links to Google Maps. Always verify Steam app IDs; wrong IDs are common. Also update the matching `Event` JSON-LD blocks in both files.
- **Past meetings (history)**: Add a new `.history-card` block to the history grid in both files. Structure: `.history-card-banner` (img + `.history-num` badge) -> `.history-card-top` (name, genre, chevron) -> `.history-expand > .history-expand-inner` (desc + links). Include the Steam app ID for the banner and store link, the genre tag, and both DA and EN descriptions (different per file). The accordion JS requires no changes.
- **Discord link**: Search and replace the existing invite URL in both files and JSON-LD `sameAs` values.
- **Venue info**: Update the `.info-card` inside the About section and the `Event` JSON-LD location/address blocks.
- **Sitemap freshness**: When publishing meaningful page/content changes, update `lastmod` in `sitemap.xml`.

## SEO

Each page includes:
- A localized `<title>` and meta description
- A canonical URL (`/` for Danish, `/index_en.html` for English)
- Absolute `hreflang` alternates for `da`, `en`, and `x-default`
- Open Graph metadata
- Twitter/X `summary_large_image` metadata
- JSON-LD structured data for `Organization` and the upcoming `Event` entries

Root SEO files:
- `robots.txt` allows crawling and points to `https://www.gamestormers.dk/sitemap.xml`
- `sitemap.xml` lists both language URLs and their hreflang alternates

Keep SEO metadata in sync between both HTML files. The Open Graph and Twitter descriptions should stay roughly 110-160 characters, and OG/Twitter titles should stay roughly 50-60 characters where possible.

## Images

Game banners (both events and history) load from the **Steam CDN**:

```
https://cdn.akamai.steamstatic.com/steam/apps/{STEAM_APP_ID}/header.jpg
```

No local cover images are used or needed. Always verify the Steam app ID before using it; the ID in a game's store URL is authoritative.

- **Social images**: `img/OG_image_da.jpg` and `img/OG_image_en.jpg` are the active Open Graph/Twitter images. They should remain 1200x630 and under 600 KB for broad platform compatibility, especially WhatsApp.
- **Store icons**: `img/steam_icon.png`, `img/gog_icon.svg`; used only in history store link buttons
- **Brand assets**: `img/logo.png`, `img/logo_hero.png`

## Deployment

Push to `main`; GitHub Pages deploys automatically. No build step required.

HTTPS is handled by GitHub Pages natively. The `.htaccess` file is inert on GitHub Pages but kept in the repo.

## i18n

Language switching is link-based: `index.html` (DA) <-> `index_en.html` (EN). Both files include `hreflang` meta tags for SEO. Keep content in sync between the two files when making changes; the history section in particular has language-specific game descriptions.
