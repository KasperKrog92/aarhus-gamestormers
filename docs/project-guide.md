# Project Guide

Aarhus Gamestormers is a mostly static HTML website for a monthly video game discussion club in Aarhus, Denmark. The club works like a book club: members play the selected game at home, then meet to discuss it. The page shell is static; the homepage event/history sections and the voting feature are database-backed through Cloudflare D1.

## Structure

```text
/
|-- AGENTS.md
|-- CLAUDE.md
|-- MEETING_WORKFLOW.md
|-- README.md
|-- index.html
|-- index_en.html
|-- vote.html
|-- vote-admin.html
|-- css/
|   `-- style.css
|-- js/
|   |-- script.js
|   |-- meetings.js
|   `-- vote.js
|-- en/
|   |-- index.html
|   `-- vote.html
|-- functions/
|   |-- _lib/
|   `-- api/
|-- data/
|   |-- steam-sales.json
|   `-- gog-sales.json
|-- img/
|-- favicon/
|-- scripts/
|   |-- build-backfill-sql.mjs
|   `-- prepare-pages-deploy.mjs
|-- backfill-meetings.sql
|-- schema.sql
|-- wrangler.toml
|-- robots.txt
`-- sitemap.xml
```

## Technology

- Static HTML/CSS for the public page shell. There is no bundler, framework, or CMS.
- Minimal npm metadata exists so Cloudflare Pages can run its install/deploy phase.
- Vanilla JS in `js/script.js` handles the copyright year, calendar dropdowns, countdown timer, history reveal behavior, and store sale badges. Its first-load behaviors are re-runnable through `window.GS.refresh()` so they also apply to dynamically injected cards.
- `js/meetings.js` renders the homepage event and history cards from `GET /api/meetings/public` (see "Database-backed homepage" below).
- `js/vote.js` drives the suggestion and voting UI.
- The voting feature and the meetings data both use Cloudflare Pages Functions under `functions/` and D1 via the `DB` binding.
- Hosting is Cloudflare Pages at `www.gamestormers.dk`; pushing to `main` deploys automatically.

## Database-backed Homepage

The homepage upcoming-events and history sections are database-backed. D1 is the source of truth for meetings and their selected games (tables `meetings`, `games`, `meeting_copy`; see [`voting-system.md`](voting-system.md) and `schema.sql`).

- `js/meetings.js` is an ES module loaded just before `js/script.js`. On load it fetches `GET /api/meetings/public` and, when the API returns meetings, replaces the `.events-grid` and `.history-grid` contents with rendered cards, then calls `window.GS.refresh()` so countdown, calendar dropdowns, history accordion, and sale badges re-bind. It also rewrites the page's JSON-LD `@graph`, replacing the `Event` nodes with ones generated from the same data while leaving the `Organization` node intact.
- The renderer is bilingual: it picks `da`/`en` from `document.documentElement.lang` and mirrors the static card markup exactly, so the CSS component contracts below are unchanged.
- The static event/history cards in `index.html` and `en/index.html` remain as a no-JS and empty-database fallback. The renderer leaves them in place only while D1 has no selected meeting content. Once D1 returns selected meetings, it treats D1 as the active source of truth and clears stale fallback cards for empty `upcoming` or `history` groups. Backfill the live database before relying on the dynamic path (see [`deployment-guide.md`](deployment-guide.md)).
- Maintainers add and edit meeting content through `vote-admin.html`, not by hand-editing HTML. See [`../MEETING_WORKFLOW.md`](../MEETING_WORKFLOW.md).

## Pages

| File | Language | Purpose |
| --- | --- | --- |
| `index.html` | Danish | Primary landing page |
| `en/index.html` | English | English landing page |
| `index_en.html` | Redirect | Legacy redirect to `/en/` |
| `vote.html` | Danish | Game suggestion and voting page |
| `en/vote.html` | English | Game suggestion and voting page |
| `vote-admin.html` | English | Unlisted maintainer curation tool, `noindex`, admin-token gated |

The landing pages share the same structure: sticky header, hero, how-it-works cards, upcoming events, about/practical info, history grid, and footer.

## CSS Architecture

All styles live in `css/style.css`. The core custom properties are defined on `:root`:

```css
--purple: #2B2436;
--green: #96C38D;
--green-dark: #7aaa71;
--green-light: #c2dbbe;
--cream: #F7F4EE;
--cream-dark: #EDE8DF;
--text: #1C1826;
--muted: #5a5366;
--white: #ffffff;
--header-h: 72px;
--radius: 16px;
```

The main responsive breakpoint is `max-width: 860px`.

The base reset includes `[hidden] { display: none !important; }`. Keep that rule: JS relies on `element.hidden = true` to hide event and history cards even when their component CSS uses flex or grid.

## Component Contracts

- `.btn-primary`, `.btn-ghost`, `.btn-green`: button variants.
- `.gs-hero`, `.gs-how`, `.gs-events`, `.gs-about`, `.gs-history`, `.gs-footer`: section wrappers.
- `.event-card`, `.event-cover`, `.event-body`: upcoming event cards.
- `.event-details`, `.event-detail`, `.event-detail-label`, `.event-detail-value`: date, time, and venue tiles inside event cards.
- `.event-detail-time`: keeps approximate ranges such as `18:30-~21:00` on one line.
- `.platform-icons` / `.platform-icon`: Steam platform availability icons (Windows / macOS / Linux). Shared by upcoming event cards and voting suggestion cards. Icons are `<use>` references to the `#gs-icon-windows`, `#gs-icon-apple`, and `#gs-icon-linux` `<symbol>`s in the per-page SVG sprite placed just after `<body>`. The wrapper carries `role="img"` and an `aria-label` listing the platforms; on event cards it sits in `.event-badge`, on suggestion cards it is the last item in `.suggestion-tags` (pushed right via `margin-left:auto`).
- `.event-store-links a`: text-only store link pills. Use Steam and GOG only.
- `.event-desc`: wrapper around one or more paragraphs in event cards. Do not use a bare paragraph when multiple paragraphs are needed.
- `.history-grid`: history card grid; cards must not stretch their row siblings when expanded.
- `.history-card`, `.history-card.open`: history cards toggled by JS.
- `.history-card-banner`: always-visible banner wrapper with `.history-num` badge overlay.
- `.history-toggle`: native button row that expands the card. Do not put store links inside the button.
- `.history-expand`: collapsible panel.
- `.history-genre-row`: one-line genre pill row. It appears in event cards and history cards.
- `.history-genre`: individual genre pill. In history cards, keep total genre text to about 30 characters.
- `.event-playtime`: HowLongToBeat link pinned to the right of the event-card genre row.
- `.hero-countdown`: countdown strip. JS reads the nearest future `.cal-ics[data-start]`.
- `.cal-wrap`, `.cal-btn`, `.cal-dropdown`, `.cal-option`: calendar dropdown components.
- `.vote-title-row` and `#vote-flow-slot`: vote-page heading row. Keep the "Sådan foregår et møde" / "How a meeting works" closed details pill aligned with the page title and mounted in this slot, not in the content stack.
- `.vote-round-hero`, `.vote-countdown`, `.vote-phase-timeline`: public vote-page round overview. It shows the meeting number, meeting date, a phase-aware countdown, and a timeline driven by `suggestionsOpenAt`, `votingOpensAt`, `votingClosesAt`, and `meetingDate`.
- `.vote-guidelines`: member-facing suggestion criteria on the vote page. Keep it compact and link to frontpage upcoming events plus history.
- `.suggestion-description`: localized Steam-imported description on voting suggestion cards. It is wrapped in `.suggestion-copy` with a `.suggestion-copy-label` so it stays visually distinct from the suggester's pitch.
- `.suggestion-pitch`: optional member pitch on voting suggestion cards. It is wrapped and labelled separately from the game description.

When editing `css/style.css`, bump the `?v=N` query string on affected pages so local preview and browsers do not serve stale CSS.

## Images

Game banners load from Steam CDN:

```text
https://cdn.akamai.steamstatic.com/steam/apps/{STEAM_APP_ID}/header.jpg
```

Always verify the Steam app ID from the canonical Steam store URL before using it.

Active social images:

- `img/OG_image_da.jpg`
- `img/OG_image_en.jpg`

Both should remain `1200x630` and under about 600 KB for broad sharing compatibility.

Store icons were removed. Store links are text-only pills.

## i18n

Language switching is link-based:

- Danish: `index.html`
- English: `en/index.html`

Keep the Danish and English static shells structurally synchronized. The shared renderer in `js/meetings.js` keeps the dynamic event/history cards in sync across languages automatically, so meeting data lives in D1 (one record per meeting) rather than being duplicated per language. Localized event/history descriptions live in `meeting_copy`. For any remaining static fallback cards, event IDs, dates, app IDs, calendar data, JSON-LD, reveal dates, and sitemap freshness must still match across the two files.
