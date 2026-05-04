# Aarhus Gamestormers Website

A static HTML website for Aarhus Gamestormers, a monthly video game discussion club based in Aarhus, Denmark. The club is modeled after a book club — members play a selected game at home, then gather to discuss it.

## Project Structure

```
/
├── index.html          # Danish (primary) version
├── index_en.html       # English version
├── css/style.css       # All styles (~514 lines)
├── img/                # Game covers, logos, store icons
├── favicon/            # Favicon set + site.webmanifest
├── .htaccess           # Apache: HTTP → HTTPS redirect
└── .well-known/        # ACME challenge dir (Let's Encrypt)
```

## Technology

- **Pure static HTML/CSS** — no build tools, no npm, no frameworks
- **Vanilla JS**: only one inline line to update the copyright year
- **Vanilla JS**: only one inline line to update the copyright year
- Hosted on Apache at **gamestormers.dk** with Let's Encrypt TLS

## Pages

| File | Language | Purpose |
|------|----------|---------|
| `index.html` | Danish | Primary landing page |
| `index_en.html` | English | For international Discord members |

Both pages share the same layout:
1. Sticky header — logo, nav links, language switcher
2. Hero — branding, CTA buttons (Discord + Facebook)
3. About (Om) — club description + practical info card (venue, frequency, Discord)
4. Upcoming events — next 2 meetings with game cover image
5. Past meetings — list of ~14 historical sessions
6. Footer — copyright year (auto-updated via JS) + credits

## CSS Architecture (`css/style.css`)

CSS custom properties defined on `:root`:

```css
--bg: #88B580          /* Primary green */
--bg-alt: #96C38D      /* Alternate green */
--panel: #ffffff       /* Card backgrounds */
--text: #1e1e1e        /* Primary text */
--brand: #2B2436       /* Deep purple */
--brand-2: #BC544B     /* Rust-red accent */
--header-h: 70px       /* 56px on mobile */
```

Responsive breakpoint: `max-width: 820px` (switches to single-column, hides nav links, adjusts header height).

Key component classes:
- `.btn`, `.btn.primary`, `.btn.ghost` — button variants
- `.grid-2` — two-column layout (1fr / 1.4fr–0.9fr split)
- `.event-card` — upcoming game card with cover image
- `.store-links` — Steam/GOG icon links with hover effects
- `.lang-switcher` — globe-emoji language toggle (hidden on mobile)

## Content Management

All content is **hardcoded in HTML**. To update:

- **Upcoming events**: Edit the events section in both `index.html` and `index_en.html`. Add/remove `.event-card` blocks with the game cover image, title, date, and description.
- **Past meetings**: Update the history list in both files.
- **Discord/Facebook links**: Search for the existing invite URLs and replace.
- **Venue info**: In the "Om" / "About" section's info card.

## Images

- **Game covers**: `img/covers/` — one file per upcoming event (e.g. `American.jpg`, `Dekker.jpg`)
- **Store icons**: `img/steam_icon.png`, `img/gog_icon.svg`
- **Brand assets**: `img/logo.png`, `img/logo_hero.png`, `img/web_logo.png` (also used for Open Graph)

## Deployment

No build step required — deploy by copying files to the Apache server. The `.htaccess` handles the HTTP→HTTPS redirect automatically.

The `.well-known/acme-challenge/` directory is used by Certbot for certificate renewal; do not delete it.

## i18n

Language switching is link-based: `index.html` ↔ `index_en.html`. Both files include `hreflang` meta tags for SEO. Keep content in sync between the two files when making changes.
