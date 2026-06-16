# Content Guide

All public content is hardcoded in HTML. Most content changes must be made in both `index.html` and `en/index.html`.

For the recurring "a new game has been chosen" workflow, follow [`../MEETING_WORKFLOW.md`](../MEETING_WORKFLOW.md). This guide documents the component details that workflow refers to.

## Upcoming Events

Edit the events section in both language files.

Update all of these fields together:

- Steam CDN banner URL and `alt` text.
- Event number badge.
- Event title.
- Genre row directly after `<h3 class="event-title">`.
- HowLongToBeat link as `.event-playtime`.
- Date, time, and venue tiles.
- Event description inside `<div class="event-desc">`.
- Store links.
- Calendar dropdown links and data attributes.
- Matching JSON-LD `Event` blocks in `<head>`.

Use Steam CDN banners:

```text
https://cdn.akamai.steamstatic.com/steam/apps/{STEAM_APP_ID}/header.jpg
```

Events usually run `18:30-~21:00` local Denmark time. Use `21:00` as the estimated calendar end, while visible copy should show that the end is approximate.

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
- GOG event links need `data-gog-id="{GOG_PRODUCT_ID}"` and are matched against `data/gog-sales.json`.
- `.github/workflows/update-steam-sales.yml` refreshes both JSON files by scanning upcoming event store-link blocks.
- If the workflow has not run yet, the JSON can be manually updated with `onSale`, `discountPercent`, and optional formatted prices.
- The same workflow posts a Discord message when a game newly goes on sale (an off-to-on transition versus the previous run, so it never spams while a sale lasts). It is gated on the repo secret `DISCORD_WEBHOOK_URL`; if the secret is unset, notification is skipped and sale data still updates.
- Steam prices Denmark in EUR, so the Discord message shows the EUR price plus an approximate DKK (fixed peg rate `7.46`). GOG already reports DKK and is shown as-is.

## Past Meetings

Add a `.history-card` block to the history grid in both language files.

Required structure:

```text
.history-card
|-- .history-card-banner
|   |-- img
|   `-- .history-num
|-- button.history-card-top.history-toggle
`-- .history-expand
    `-- .history-expand-inner
        |-- .history-genre-row
        |-- p.history-desc
        `-- store links
```

Rules:

- Genre tags live inside the expanded panel, not the card top.
- Store links use `class="history-link"` and are text-only.
- Include Steam and GOG only; omit other storefronts.
- Keep `history-desc` under about 160 characters.
- Keep history genre tags short enough to fit on one line; about 30 total characters is the practical ceiling.
- The accordion JS requires no changes.

## Pre-Publishing History Cards

Before a meeting has happened, the matching history card can be pre-published:

```html
<article class="history-card" hidden data-reveal="YYYYMMDDTHHmmSSZ">
```

Use the meeting's UTC end time. The value should match the event card's `.cal-ics[data-end]`.

`js/script.js` removes `hidden` automatically after that time. The `.history-sub` paragraph has a `data-count-template` that lets JS update the meeting count when a hidden card reveals.

When doing a later manual cleanup for a meeting that has passed:

- Remove `hidden` and `data-reveal`.
- Bump the hardcoded `.history-sub` fallback count in both language files.

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
- JSON-LD `Organization` and upcoming `Event` entries.

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
