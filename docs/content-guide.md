# Content Guide

The page shell (hero, navigation, about copy, SEO `<head>`) is hardcoded in HTML and must be kept in sync between `index.html` and `en/index.html`. The homepage **upcoming-events and history sections are database-backed**: they render from D1 through `GET /api/meetings/public` (see [`project-guide.md`](project-guide.md) "Database-backed homepage"). Meeting content is entered through `vote-admin.html`, not by editing HTML.

For the recurring "a new game has been chosen" workflow, follow [`../MEETING_WORKFLOW.md`](../MEETING_WORKFLOW.md). This guide documents the data fields and the component details that workflow refers to.

## Meeting Data Model

Each meeting is one `meetings` row (id = meeting number) joined to one `games` row (the selected game) and up to two `meeting_copy` rows (localized `da`/`en` descriptions). The public API shapes these into the fields the renderer needs:

- `games`: `title`, `header_image`, `store_url`, `gog_url`, `gog_id`, `genres`, `platforms`, `price`, `playtime_hours`, `hltb_url`, `steam_appid`.
- `meetings`: `meeting_date`, `starts_at_utc`, `ends_at_utc`, `timezone`, `venue_name`, `venue_address`, `discord_invite`, `status`, `selected_game_id`.
- `meeting_copy`: `event_description` (used on the upcoming-event card) and `history_description` (used on the history card) per language. The renderer falls back to the game's own `description_da`/`description_en` when copy is absent.

The API groups meetings into `upcoming` (future, has a selected game), `history` (past, has a selected game, newest first), and `planned` (future, no selected game yet). A meeting moves from upcoming to history automatically once its `ends_at_utc` passes; there is no separate "pre-published history card" to manage.

## Upcoming Events

Add or edit upcoming events through the "Selected game" section of `vote-admin.html` (promote the winning suggestion, then fill in the game fields and localized copy). The renderer derives the event card from the database fields above; you do not hand-build the markup, calendar links, platform icons, or JSON-LD.

Field guidance still applies to the data you enter:

- Verify the Steam app ID from the canonical store URL; banners load from `https://cdn.akamai.steamstatic.com/steam/apps/{STEAM_APP_ID}/header.jpg`.
- Platforms: list only the platforms the game supports on Steam (Windows / macOS / Linux). The renderer maps these to `.platform-icons` and the `aria-label`.
- Provide the HowLongToBeat URL and whole-hour playtime (ask the maintainer; HLTB has no API). The renderer pins it as `.event-playtime`.
- Provide a Danish and an English event description. Separate paragraphs with a blank line; the renderer splits them into `<p>` blocks inside `.event-desc`.
- Genres are comma-separated.

Events run `18:30-~21:00` local Denmark time by default. The admin stores start/end as UTC; the renderer shows the approximate end with the `-~` separator and builds DST-correct calendar links and JSON-LD.

The static event cards in both language files remain only as a no-JS / empty-database fallback. They are not the live content path; do not treat hand-editing them as the way to publish a meeting.

## Calendar Data

Each event has three calendar options.

Google Calendar:

- Use `https://calendar.google.com/calendar/render?action=TEMPLATE&`.
- Update `text=`, `dates=`, and `details=`.
- `dates=` uses UTC: `YYYYMMDDTHHmmSSZ/YYYYMMDDTHHmmSSZ`.

Apple / ICS:

- Update `data-uid`, `data-start`, `data-end`, `data-title`, `data-description`, and `data-filename` on the `.cal-ics` link.
- `js/script.js` generates the ICS file and adds `DTSTAMP` at download time. Do not remove that behavior.

Outlook:

- Update `subject=`, `startdt=`, `enddt=`, and `body=`.
- Use ISO 8601 with the correct Denmark offset: `+02:00` for CEST, `+01:00` for CET.

Timezone quick reference:

| Season | UTC calendar start/end | Outlook/JSON-LD offset |
| --- | --- | --- |
| CEST, late Mar to late Oct | `T163000Z` / `T190000Z` | `+02:00` |
| CET, late Oct to late Mar | `T173000Z` / `T200000Z` | `+01:00` |

## Store Links And Sale Badges

- Store links are text-only pills.
- Use Steam and GOG only.
- Steam event links are matched against `data/steam-sales.json` by app ID.
- GOG event links need a numeric GOG product id (`games.gog_id` in D1, rendered as `data-gog-id`) and are matched against `data/gog-sales.json`.
- `.github/workflows/update-steam-sales.yml` refreshes both JSON files by reading the upcoming meetings from `GET /api/meetings/public` (D1-backed). When the API returns no upcoming meetings yet (for example before the production backfill), it falls back to scanning the static event store-link blocks in the HTML. The site base URL defaults to `https://www.gamestormers.dk` and can be overridden with the `SITE_BASE_URL` repository variable.
- If the workflow has not run yet, the JSON can be manually updated with `onSale`, `discountPercent`, and optional formatted prices.
- The same workflow posts a Discord message when a game newly goes on sale (an off-to-on transition versus the previous run, so it never spams while a sale lasts). The message names the game's meeting date and links the store page. It is gated on the repo secret `DISCORD_WEBHOOK_URL`; if the secret is unset, notification is skipped and sale data still updates.
- Steam prices Denmark in EUR, so the Discord message shows the EUR price plus an approximate DKK (fixed peg rate `7.46`). GOG already reports DKK and is shown as-is.

## Past Meetings

History cards are database-backed and require no per-meeting markup. A meeting appears in the history grid automatically once its `ends_at_utc` has passed; the renderer sorts history newest-first and updates the `.history-sub` count from `data-count-template`.

What you provide per meeting (through `vote-admin.html`): the selected game (title, banner, genres, Steam/GOG links) and a localized `history_description`. If no history description is set, the renderer falls back to the event description, then the game description.

Content rules for the history blurb still apply:

- Keep `history_description` under about 160 characters.
- Keep history genre text short enough to fit on one line; about 30 total characters is the practical ceiling.
- Store links use Steam and GOG only.

The static `.history-card` blocks in the HTML remain only as a no-JS / empty-database fallback. There is no longer a manual "pre-publish a hidden history card" or "bump the `.history-sub` count" step on the database path: the upcoming-to-history transition and the count are derived from `ends_at_utc` and the API response.

## Discord And Venue Changes

Discord invite changes require search-and-replace across:

- Navigation and CTA links.
- Footer links.
- Calendar details.
- JSON-LD `sameAs` values.

Venue changes require updating:

- Event cards.
- About/practical-info card.
- Calendar links.
- JSON-LD `location` and address blocks.

## SEO Metadata

Each public page should keep these in sync:

- Localized `<title>` and meta description.
- Canonical URL.
- Absolute `hreflang` alternates for `da`, `en`, and `x-default`.
- Open Graph metadata.
- Twitter/X `summary_large_image` metadata.
- JSON-LD `Organization` entry. The static JSON-LD also ships `Event` entries as a no-JS fallback, but once meetings load, `js/meetings.js` regenerates the `Event` nodes from `/api/meetings/public` and leaves the `Organization` node untouched. Do not maintain `Event` JSON-LD by hand on the database path; correct the meeting data instead.

Open Graph and Twitter descriptions should stay roughly 110-160 characters. OG/Twitter titles should stay roughly 50-60 characters when possible.

When publishing meaningful page or content changes, update `lastmod` in `sitemap.xml` for both language URLs.

## Verification Checklist

- Both language files have balanced tags.
- App IDs, calendar dates, reveal dates, card numbers, and JSON-LD match across languages.
- Genre rows and playtime links stay on one line on desktop and mobile.
- The banner is the correct game.
- The history count is right.
- `sitemap.xml` `lastmod` is current for meaningful content changes.
- Run the Cloudflare Pages dev server for browser verification when behavior, styling, or `/api/*` matters.
