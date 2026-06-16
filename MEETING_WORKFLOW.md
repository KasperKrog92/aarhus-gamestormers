# Runbook — "A new game has been chosen for a meeting"

Follow this checklist whenever the maintainer says a new game has been picked for meeting **#N**
(usually with a Discord announcement: game title, date, time, venue, banner). The goal is to add
the meeting as an **upcoming event** and a **pre-published history card**, in **both** language files,
fully in sync.

This is the canonical step-by-step; the per-component HTML details live in
[`docs/content-guide.md`](docs/content-guide.md). Keep both files (`index.html` = Danish,
`en/index.html` = English) in sync at every step.

---

## 0. Inputs to collect from the announcement

| Field | Default if not stated |
|---|---|
| Meeting number **N** | — |
| Game title | — |
| Date | "Typically the first Monday of the month" — confirm the weekday |
| Time | **18:30–~21:00** (start 18:30, ~21:00 estimated end) |
| Venue | **Folkehuset Møllestien, Grønnegade 10, 8000 Aarhus C** — only change if the announcement differs |
| Discord | General invite `discord.gg/N2h6DJxVDF` (used in calendar details — **not** per-event Discord event links) |

## 1. Verify the game on Steam (don't trust the title alone)

- Find the **Steam App ID** — the ID in the store URL is authoritative. Wrong/duplicate IDs are common.
- **Sanity-check it's the right game**: titles collide. Compare the announcement's banner art and premise
  against the Steam page before committing to an ID.
- Banners and store links use the ID:
  `https://cdn.akamai.steamstatic.com/steam/apps/{APP_ID}/header.jpg`
- Check **GOG**: include a GOG link (+ `data-gog-id` on the event-card link) only if a GOG page actually exists.
- Read the Steam premise/genres/tags to write **accurate** copy. If the announcement's wording conflicts
  with the real game, lean on Steam — and flag the mismatch to the maintainer before publishing.

## 2. ⚠️ Ask the maintainer for the HowLongToBeat link

HowLongToBeat blocks automated fetching, so the canonical `howlongtobeat.com/game/{id}` link and the
playtime **cannot be looked up or verified automatically — always ask the maintainer for the specific
HowLongToBeat link (and the hours).**

- Display as `⏱ ~X t.` (DA) / `⏱ ~X hrs.` (EN), **rounded to whole hours** to match house style
  (e.g. 9.5 h → `~10 t.`). Goes in the `.event-playtime` link inside the event card's `.history-genre-row`.

## 3. Compute the date/time fields

Denmark uses **CEST (UTC+2) ~late Mar–late Oct**, **CET (UTC+1) ~Nov–Mar**. Pick the right column for the meeting's month:

| Field | CEST (summer) | CET (winter) |
|---|---|---|
| ICS / Google `dates` start–end (UTC) | `…T163000Z` / `…T190000Z` | `…T173000Z` / `…T200000Z` |
| Outlook / JSON-LD offset | `+02:00` | `+01:00` |

- Visible date text: DA `D. måned` (e.g. `3. august`), EN `D Month` (e.g. `3 August`).
- The history card's `data-reveal` and the event's `data-end` are the **same UTC end time**.

## 4. Add the upcoming **event card** #N (both files)

Copy the previous event card as a template, append it at the end of the events grid, and update:
banner img + alt · `event-num` (`N. møde` / `Meeting N`) · store links · title · genre pills + `event-playtime`
HLTB link · date/time/venue tiles · `event-desc` (DA/EN paragraphs, wrapped in `<div class="event-desc">`) ·
calendar dropdown — unique id `cal-menu-gsN` (`-en` in English) + matching `aria-controls`, Google href,
ICS `data-*` (incl. `data-uid="gsN-YYYYMMDD@gamestormers.dk"`, `data-filename="gamestormers-N.ics"`), Outlook href.

## 5. Add the matching **JSON-LD `Event`** (both files)

In `<head>`, append after the previous event (before the array `]`). Update `@id`, `name`, `description`,
`startDate`/`endDate` (ISO + offset), `image`, `url` (DA `…/#events`, EN `…/en/#events`). Location/organizer unchanged.

## 6. Pre-publish the **history card** #N (both files)

Append to the history grid, copying an existing card. Add `hidden data-reveal="YYYYMMDDT190000Z"`
(= meeting end UTC). Update num, banner + alt, title, genre pills (history total ≤ ~30 chars),
`history-desc` (≤ ~160 chars, DA/EN), Steam (+GOG) `history-link`s (text-only).

## 7. Backfill the previous meeting's history card if missing

Every meeting needs a history card so the numbers stay **contiguous** (no gap when cards reveal).
When announcing #N, make sure **#N-1** already has a (pre-published) history card; if not, add it now with
`data-reveal` = its meeting's end time.

## 8. Finalize the meeting that just passed (cleanup)

Usually done at the same time a new game is announced, for the meeting that already happened:

- On its history card, **remove `hidden` and `data-reveal`** (it's now permanently visible).
- **⚠️ Bump the `.history-sub` hardcoded count** to the new number of always-visible cards in **both** files
  (`{n} møder, {n} spil` / `{n} meetings, {n} games`).
  **Why this matters:** `js/script.js` only recomputes the count when a `data-reveal` card reveals on load.
  Once the passed card is no longer reveal-gated and the remaining pre-published cards are still in the future,
  nothing recomputes — the **static fallback number is what shows**, so it must be correct. Forgetting this
  leaves the count one too low.
- The passed **event card auto-hides** via its `data-end` (JS), so no manual removal is required;
  optionally delete very old event cards / JSON-LD events to keep the files tidy.

## 9. Update `sitemap.xml`

Set `lastmod` to today's date on **both** URL entries.

## 10. Verify

- Both HTML files have **balanced tags**; key markers (app ID, ids, reveal dates, card counts) **match between DA and EN**.
- Preview locally (`python -m http.server`) and/or DOM-check: the new event card renders, genre row + playtime
  sit on **one line**, the banner is the correct game, the history **count is right**, and there are **no console errors**.
- Reconfirm venue / Discord / time defaults unless the announcement changed them.

## 11. Do **not** commit or push unless explicitly asked

Pushing to `main` **auto-deploys to the live site**. Leave commit/push to the maintainer's go-ahead.
