# Aarhus Gamestormers Website

A static HTML website for Aarhus Gamestormers, a monthly video game discussion club based in Aarhus, Denmark. The club is modeled after a book club: members play a selected game at home, then gather to discuss it.

## Project Structure

```
/
├── AGENTS.md           # Lightweight pointer for Codex/agent instructions; detailed guide is this file
├── MEETING_WORKFLOW.md # Step-by-step runbook for "a new game has been chosen for a meeting"
├── index.html          # Danish (primary) version
├── index_en.html       # Redirect → /en/ (kept for old links/bookmarks)
├── vote.html           # Danish suggestion + voting page (calls same-origin /api/*)
├── vote-admin.html     # Maintainer curation page (noindex, unlinked, ADMIN_TOKEN-gated)
├── scripts/
│   └── prepare-pages-deploy.mjs # Builds the safe direct-upload Pages artifact
├── en/
│   ├── index.html      # English version
│   └── vote.html       # English suggestion + voting page
├── robots.txt          # Crawl rules + sitemap reference (disallows /vote-admin.html)
├── sitemap.xml         # XML sitemap with DA/EN hreflang alternates
├── package.json        # Minimal npm manifest for Cloudflare's install/deploy phase
├── package-lock.json   # Synced lockfile; no application dependencies
├── css/style.css       # All styles (v9)
├── js/
│   ├── script.js       # Shared JS: copyright year, calendar dropdown, history accordion
│   └── vote.js         # Voting front end: phase-aware suggest/vote/result UI (bilingual)
├── functions/          # Cloudflare Pages Functions (same-origin /api/*) — voting backend
│   ├── _lib/           # Shared helpers: db, steam, turnstile, auth, http
│   └── api/            # round/current, suggest, vote, admin/[[route]]
├── schema.sql          # D1 (SQLite) schema: rounds, suggestions, votes
├── wrangler.toml       # Cloudflare Pages/Functions config + D1 binding (local dev)
├── data/
│   ├── steam-sales.json # Generated Steam sale data consumed by upcoming event links
│   └── gog-sales.json   # Generated GOG sale data consumed by upcoming event links
├── .github/workflows/
│   └── update-steam-sales.yml # Refreshes store sale data on schedule
├── img/
│   ├── logo.webp       # Header/footer logo (served; PNG source kept as logo.png)
│   ├── logo_hero.webp  # Large hero logo, LCP image (served; PNG source kept as logo_hero.png)
│   ├── OG_image_da.jpg # Danish Open Graph/Twitter image (1200x630)
│   ├── OG_image_en.jpg # English Open Graph/Twitter image (1200x630)
│   └── logo_square.png # Square logo used by structured data
├── favicon/
│   └── favicon.png     # 192×192 favicon (green tornado, no text)
├── CNAME               # GitHub Pages custom domain (inert on Cloudflare Pages)
├── .gitignore          # Excludes .claude/, design_handoff_gamestormers/, .wrangler/, .dev.vars, .deploy/
└── .htaccess           # Kept for reference; not active on GitHub Pages
```

## Technology

- **Static HTML/CSS** for the marketing pages: no build step, bundler, or framework
- **Minimal npm metadata**: `package.json`/`package-lock.json` exist so Cloudflare Pages can complete `npm clean-install`; the app itself has no npm dependencies
- **Google Fonts**: Barlow Condensed (headings) + DM Sans (body), loaded via `<link>` in `<head>`
- **Vanilla JS**: copyright year update + history accordion toggle + calendar dropdown + countdown timer + auto-hide past event cards + auto-reveal scheduled history cards + store sale badges from `data/steam-sales.json` and `data/gog-sales.json`
- **Voting system (the only dynamic part)**: a members-driven suggestion + approval-voting feature backed by **Cloudflare Pages Functions** (`functions/`, same-origin `/api/*`) and a **Cloudflare D1** database. See *Game suggestion & voting system* below.
- **Hosting**: the site is moving from GitHub Pages to **Cloudflare Pages** (`www.gamestormers.dk`) so the voting backend can run same-origin as Pages Functions. The static pages behave identically on either host; only the voting feature requires Cloudflare.
- Repo: `github.com/KasperKrog92/aarhus-gamestormers`; push to `main` deploys automatically

## Agent Guide

`AGENTS.md` is intentionally a short pointer for Codex-style tools. Keep this `CLAUDE.md` file as the canonical, detailed project overview and update it whenever workflows, content rules, or deployment assumptions change.

## Pages

| File | Language | Purpose |
|------|----------|---------|
| `index.html` | Danish | Primary landing page |
| `en/index.html` | English | For international Discord members |
| `vote.html` | Danish | Game suggestion + voting page |
| `en/vote.html` | English | Game suggestion + voting page |
| `vote-admin.html` | English | Maintainer curation tool (unlisted, `noindex`) |

Both pages share the same layout:
1. Sticky header: logo, nav links (Events -> Om/About -> Historik/History), language toggle, Discord button
2. Hero: green background with curved bottom edge, two-column grid (text + logo)
3. How it works: 3 white cards on cream background
4. Upcoming events: cards on purple background with Steam CDN banners (typically 2–3 at a time)
5. About (Om): club description + practical info card
6. History: 4-column banner grid (desktop) / 2-column (mobile); each card shows the Steam banner upfront, and the title button expands description + store links
7. Footer: logo + copyright/Discord grouped left, small logo credit right

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

Base reset includes `[hidden] { display: none !important; }` — this overrides any component-level `display:` rule (e.g. `display: flex` on `.event-card`) so the JS `element.hidden = true` pattern works reliably everywhere.

Key component classes:
- `.btn-primary`, `.btn-ghost`, `.btn-green`: button variants
- `.gs-hero`, `.gs-how`, `.gs-events`, `.gs-about`, `.gs-history`, `.gs-footer`: section wrappers
- `.event-card`, `.event-cover`, `.event-body`: upcoming event cards
- `.event-details`, `.event-detail`, `.event-detail-label`, `.event-detail-value`: date/time/venue tiles inside event cards
- `.event-detail-time`: keeps approximate time ranges such as `18:30-~21:00` on one line
- `.event-venue-link`: linked venue text inside event cards
- `.event-store-links a`: small green text pill store links (Steam and GOG only — text only, no icons)
- `.event-desc`: game description inside event cards — near-white (`rgba(255,255,255,0.9)`), justified, hyphenated; use `<div class="event-desc">` wrapping one or more `<p>` tags (not a bare `<p>`) so paragraph spacing works via `.event-desc p + p`
- `.history-grid`: CSS grid, 4 columns desktop / 2 columns mobile; `align-items: start` so expanding one card does not stretch its row-siblings
- `.history-card`, `.history-card.open`: banner-first grid cards (JS toggles `.open`)
- `.history-card-banner`: always-visible banner wrapper with `.history-num` badge overlay
- `.history-card-top`, `.history-toggle`: native button row (name + chevron) that expands the card; do not put store links inside the button
- `.history-expand`: collapsible panel (max-height animation)
- `.history-banner`: full-width Steam header image (460/215 aspect ratio), zooms on hover
- `.history-genre-row`: flex row of genre pills; used inside `.history-expand-inner` (history cards) and directly after `.event-title` (event cards); `flex-wrap: nowrap; overflow: hidden` — genre tags are always one line
- `.history-genre`: individual green pill tag (uppercase, small); multiple per game are allowed. **History cards: total characters across all tags must not exceed ~30** (Little Nightmares — Horror + Puzzle-Platformer + Stealth — is the reference max). Remove the least-specific tag if needed.
- `.event-playtime`: muted HowLongToBeat link at the right end of the `.history-genre-row` on event cards (not history cards); shows approximate playtime as `⏱ ~X t.` (DA) / `⏱ ~X hrs.` (EN); uses `margin-left: auto` to pin right
- `.hero-countdown`: countdown strip in the hero, below `.hero-cta`; contains `.countdown-label`, `.countdown-units` > `.countdown-unit` > `.countdown-num` + `.countdown-unit-lbl`. The `data-today` attribute holds the localised "meeting is today" string shown when the countdown reaches zero. Driven entirely by JS reading `.cal-ics[data-start]` — no separate date to maintain.
- `.cal-wrap`: calendar dropdown container; `align-self: flex-start` + `margin-top: auto` pins it to the bottom-left of each event card
- `.cal-btn`: toggle button (ghost style, green-tinted border); `.cal-wrap.open .cal-btn` is the active state
- `.cal-chevron`: chevron SVG inside the button; rotates 180° when open
- `.cal-dropdown`: absolutely positioned list that appears below the button; `min-width: 190px`
- `.cal-option`: individual option link/button inside the dropdown
- `.info-card`, `.info-row`: practical info card in About section
- `.gs-lang a.active`: active language in DA/EN toggle
- `.footer-left`: flex group containing the logo + copyright line
- `.footer-copy`: copyright + Discord link text (left side of footer)
- `.footer-credit`: small, dimmed logo attribution text (right side of footer)

## Content Management

> **Recurring task — "a new game has been chosen for meeting #N"?** Follow the end-to-end checklist in
> [`MEETING_WORKFLOW.md`](MEETING_WORKFLOW.md). It covers verifying the Steam app ID, **asking the maintainer
> for the HowLongToBeat link**, adding the event card + JSON-LD + pre-published history card in both language
> files, finalizing the meeting that just passed (incl. the `.history-sub` count bump), and updating the sitemap.

All content is **hardcoded in HTML**. To update:

- **Upcoming events**: Edit the events section in both `index.html` and `en/index.html`. Use Steam CDN banners: `https://cdn.akamai.steamstatic.com/steam/apps/{STEAM_APP_ID}/header.jpg`. Update the event-num badge, event-title, genre row (`.history-genre-row` with one or more `.history-genre` spans followed by an `<a class="event-playtime">⏱ ~X t.</a>` / `⏱ ~X hrs.` HowLongToBeat link, placed directly after `<h3 class="event-title">`), `.event-details` date/time/venue tiles, event-desc, store link URLs, and the `.cal-dropdown` links. Verify playtime on HowLongToBeat before publishing. For each calendar option update:
  - **Google**: the full `href` — use `https://calendar.google.com/calendar/render?action=TEMPLATE&` (not `r/eventedit` — the render format works on mobile); change `text=`, `dates=` (format: `YYYYMMDDTHHmmSSZ/YYYYMMDDTHHmmSSZ` in UTC), and `details=`
  - **Apple / ICS**: the `data-uid`, `data-start`, `data-end` (UTC, same format), `data-title`, `data-description`, and `data-filename` attributes on the `.cal-ics` link. The ICS file is generated by `js/script.js` — `DTSTAMP` (required by RFC 5545) is added dynamically at download time; do not remove it or Apple Calendar will reject the file
  - **Outlook**: the full `href` — change `subject=`, `startdt=`/`enddt=` (ISO 8601 with `+02:00` offset for CEST), and `body=`
  - Events run 18:30–21:00 CEST = 16:30–19:00 UTC (`T163000Z`/`T190000Z`). Events start at 18:30 and use 21:00 as the estimated calendar end time; visible copy should communicate that the end is approximate, e.g. `18:30-~21:00`. Venue text in the cards links to Google Maps. Always verify Steam app IDs; wrong IDs are common. Also update the matching `Event` JSON-LD blocks in both files, including both `startDate` and `endDate`.
  - **Auto-hide**: event cards are automatically hidden at page load once their `.cal-ics` `data-end` time has passed — no manual removal needed immediately after a meeting. The countdown timer in the hero also reads `data-start` from these same elements to target the nearest future event; keeping `data-start`/`data-end` accurate is therefore important for both features.
  - **Store sale badges**: upcoming-event Steam links inside `.event-store-links` are matched by app ID against `data/steam-sales.json`. Upcoming-event GOG links need a `data-gog-id="{GOG_PRODUCT_ID}"` attribute and are matched against `data/gog-sales.json`. `.github/workflows/update-steam-sales.yml` refreshes both JSON files once per day and on relevant pushes by scanning upcoming event store-link blocks only. If the action has not run yet, either JSON can be manually edited with `onSale`, `discountPercent`, and optional formatted prices.
- **Past meetings (history)**: Add a new `.history-card` block to the history grid in both files. Structure: `.history-card-banner` (img + `.history-num` badge) -> `<button class="history-card-top history-toggle">` (name + chevron, no genre tag here) -> `.history-expand > .history-expand-inner` (`.history-genre-row` with genre pills, then `<p class="history-desc">` — near-white, justified, hyphenated — then links). Genre tags live inside the expanded panel, not the card top. Include the Steam app ID for the banner and store link, and both DA and EN descriptions (different per file). The accordion JS requires no changes. Store links use `class="history-link"` and are **text-only** (no icon images). Only include Steam and GOG links; omit other storefronts even when confirmed. **`history-desc` must stay under ~160 characters** — one or two short sentences that capture the premise, no plot details. Existing cards average ~140 characters; use them as a benchmark. Genre tags and store links are `flex-wrap: nowrap` — they must fit on one line; trim tags or links if needed.
  - **Pre-publishing a card before the meeting**: add `hidden` and `data-reveal="YYYYMMDDTHHmmSSZ"` (UTC end time of the meeting, matching the event card's `data-end`) to the `.history-card` element. JS removes `hidden` automatically once that time passes. The `.history-sub` paragraph already has `data-count-template` set — the JS uses it to update the meeting count automatically when the card reveals; no changes needed there. Once you do a proper manual update, remove `hidden` and `data-reveal` from the card.
- **Discord link**: Search and replace the existing invite URL in both files and JSON-LD `sameAs` values.
- **Venue info**: Update the `.info-card` inside the About section and the `Event` JSON-LD location/address blocks.
- **Sitemap freshness**: When publishing meaningful page/content changes, update `lastmod` in `sitemap.xml`.

## SEO

Each page includes:
- A localized `<title>` and meta description
- A canonical URL (`/` for Danish, `/en/` for English)
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
- **Store icons**: `img/steam_icon.png` and `img/gog_icon.svg` have been removed — all store links are text-only pills
- **Brand assets**: `img/logo.png`, `img/logo_hero.png`

## Game suggestion & voting system

A members-driven flow for choosing the next meeting's game:
**suggestions open → maintainer curates → voting opens (approval voting) → result revealed**. This is the
only dynamic part of the site and the reason hosting moved to Cloudflare Pages. Everything is first-party;
**no third-party cookies and no stored IPs**.

**Architecture**
- **Frontend**: `vote.html` (DA) + `en/vote.html` (EN), driven by `js/vote.js` (bilingual via
  `STRINGS[lang]`). The page is phase-aware: it renders a suggestion form, an approval ballot, or results
  depending on the current round's `phase`. Reuses the site's card styling (`.suggestion-card`, etc.).
- **Backend**: Cloudflare Pages Functions in `functions/api/*`, served same-origin under `/api/*`
  (no CORS). Shared helpers in `functions/_lib/` (`db`, `steam`, `turnstile`, `auth`, `http`).
- **Storage**: Cloudflare **D1** (SQLite), schema in `schema.sql` — `rounds`, `suggestions`, `votes` (the latter carries an optional self-reported `voter_name`).
- **Admin**: `vote-admin.html` — unlisted, `noindex`, gated by a Bearer `ADMIN_TOKEN`.

**API** (`functions/api`)
| Route | Method | Purpose |
|---|---|---|
| `/api/round/current` | GET | Current round + approved cards (tallies only when `revealed`; never exposes the storm code). |
| `/api/suggest` | POST | Submit a suggestion; imports the game from Steam server-side; **auto-approved** (visible immediately). |
| `/api/vote` | POST | Cast an approval ballot (one `votes` row per ticked game); optional self-reported `voterName`. |
| `/api/admin/round` | GET/POST/PATCH | Read full round (incl. per-ballot list + live tallies); open a new round; change phase / winner / code. |
| `/api/admin/suggestion/:id` | PATCH/DELETE | Approve / reject / edit or delete a suggestion. |
| `/api/admin/ballot/:ballotId` | DELETE | Remove a single ballot (all its votes) — for pruning funky behaviour. |

**Phases** (`rounds.phase`): `suggesting` → `voting` → `revealed` → `closed`. The current round is the one
with the highest `id` (= meeting number). The maintainer advances phases in `vote-admin.html`.

**Vote integrity (deliberately lightweight, privacy-first)**: a per-round **storm code** (soft Discord
gate) + **Cloudflare Turnstile** (bot check). **No IP is stored and no cookie is used.** A random
`ballot_id` is echoed to the client and kept in `localStorage` only for "you already voted" UX — it is
*not* enforced server-side. This deters casual abuse, not a determined attacker; that trade-off was chosen
on purpose to stay cookie-free and PII-free. True one-vote-per-person would need identity (e.g. Discord
login), which was explicitly out of scope.

**Curation & moderation**: suggestions are **auto-approved** — they appear on the board as soon as they're
submitted; the maintainer can still edit, reject (hide), or delete them in `vote-admin.html`. Voting is
intentionally low-friction, so to compensate the admin sees the **full per-ballot breakdown at any phase**
(optional voter name, which games each ballot approved, and timestamp) plus live tallies, and can **delete
any ballot** (`/api/admin/ballot/:ballotId`) if a vote looks suspicious. Ballot names are rendered with
`textContent` (never `innerHTML`) in the admin tool so a crafted name can't XSS the maintainer.

**Steam import**: `functions/_lib/steam.js` parses the app id from a store URL and calls
`store.steampowered.com/api/appdetails` (same endpoint as the sales Action) for title, banner, genres,
platforms and price. **HowLongToBeat has no API** — `playtime_hours` is filled by the maintainer during
curation, consistent with `MEETING_WORKFLOW.md`.

**Turnstile site key**: `vote.html` / `en/vote.html` carry the public production `data-turnstile-sitekey`
on `#vote-app`. Keep the matching Turnstile widget secret in the Cloudflare Pages `TURNSTILE_SECRET`
environment variable; local development can still use Cloudflare's always-pass test key/secret in
`.dev.vars`.

**Local development**
```
wrangler d1 create gamestormers                              # once; paste the id into wrangler.toml
wrangler d1 execute gamestormers --local --file=./schema.sql
# create .dev.vars with TURNSTILE_SECRET (Turnstile test secret) and ADMIN_TOKEN
wrangler pages dev                                           # (or npm run dev) serves site + /api/* + local D1
```
Open `/vote.html` and `/vote-admin.html`; use the admin page to open a round, approve suggestions, and flip
phases. Apply the schema to production with `wrangler d1 execute gamestormers --remote --file=./schema.sql`.

**Phase 2 (planned, not built)**: a scheduler (Cloudflare Cron Trigger or a GitHub Action like the sales
one) that advances phases from a list of meeting dates, posts Discord announcements via a webhook, and
generates the event-card + pre-published history-card values for the winner per `MEETING_WORKFLOW.md`
(playtime stays manual). The existing date-driven JS then handles event/history transitions unchanged.

## Deployment

Push to `main`; Cloudflare Pages deploys automatically. No build step is required.

For Cloudflare Pages, keep the project root set to `/`, leave the build command empty, and use `pages_build_output_dir = "."` in `wrangler.toml` for local Pages development. For manual direct uploads, run `npm run deploy`: it first builds `.deploy/pages` with only public static assets plus `functions/`, then runs `wrangler pages deploy .deploy/pages --project-name aarhus-gamestormers-site --branch main`. Do not deploy the repo root with `wrangler pages deploy .`, because local-only files such as `.dev.vars` can be uploaded as public assets. Do not use plain `wrangler deploy`; that command targets Workers, not Pages.

Cloudflare's install phase runs `npm clean-install`, so `package.json` and `package-lock.json` must stay in sync even though there are no application dependencies. Local Pages Functions development can use `npm run dev`.

Before production Cloudflare deploys, replace the placeholder D1 `database_id` in `wrangler.toml`, bind the D1 database as `DB`, and set `TURNSTILE_SECRET` and `ADMIN_TOKEN` as encrypted environment variables in the Cloudflare Pages project settings.

The previous GitHub Pages setup required no build step; `CNAME` and `.htaccess` are inert on Cloudflare Pages but kept for reference/history.

## i18n

Language switching is link-based: `index.html` (DA) <-> `en/index.html` (EN). Both files include `hreflang` meta tags for SEO. Keep content in sync between the two files when making changes; the history section in particular has language-specific game descriptions.
