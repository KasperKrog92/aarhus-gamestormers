# Recommended Features

Date: 2026-07-13

Status: proposal only, nothing implemented. Feature ideas from the July 2026 project audit, kept small on purpose. Ordered by value for effort. See [`../roadmap.md`](../roadmap.md) for previously planned work (admin meetings section, winner reveal animation).

## 1. ICS calendar feed

A Pages Function (for example `GET /api/meetings/ics`) that emits an iCalendar feed of upcoming meetings, so members subscribe once in Google/Apple/Outlook Calendar and every future meeting appears automatically.

- The data is already in D1: `meetings` has the date, UTC start/end, venue name and address, and the selected game via `games`.
- One feed serves both languages; keep the summary short ("Aarhus Gamestormers: <game title>") with venue and the Discord invite in the description.
- Give each meeting a stable `UID` (for example `meeting-<id>@gamestormers.dk`) so calendar apps update events in place instead of duplicating them.
- Emit `STATUS:CANCELLED` for cancelled meetings so subscribed calendars drop them.
- Serve with `content-type: text/calendar` and modest caching (`max-age` of an hour is plenty). Link it from the homepage calendar dropdowns as "Subscribe to all meetings".

This is the highest member-facing value per line of code in the backlog.

## 2. Public voting archive

A read-only archive of closed rounds: each with its meeting, winning game, and the round-by-round instant-runoff breakdown members already see on reveal.

- Needs a small read endpoint (for example `GET /api/rounds/archive`) returning revealed/closed rounds with their aggregate `rcvResult`. Reuse the IRV renderer that `js/vote.js` already has for the reveal view.
- Privacy is unchanged from the reveal view: aggregates only, never individual ballots. See the privacy rules in [`../voting-system.md`](../voting-system.md).
- Placement can start simple: a section below the winner on the vote page, or a dedicated page linked from the vote page. A dedicated page adds long-term SEO content.
- The scheduler stays out of scope; this is purely a read view (the "public archive of closed voting rounds" item listed as out of scope in `voting-system.md` refers to scheduler automation, not a read page).

## 3. "Already played" suggestion guard

`/api/suggest` already rejects duplicate suggestions within a round, but nothing stops a member suggesting a game the club already played or has scheduled. The guidelines just link to the history and ask members to check manually.

- On submit, compare the Steam app id (and, for non-Steam suggestions, a normalized title) against the `games` table joined to meetings.
- On a hit, reject with a friendly bilingual message naming the meeting, for example "The club played this in March 2026".
- Keep an escape hatch: the maintainer can still add any game manually through `vote-admin.html`, so a deliberate replay stays possible.

## Parked technical follow-ups

Not features, listed here so they are not forgotten:

- Split the admin console CSS out of `style.css`. Blocked on visual verification of `vote-admin.html` at narrow widths, because the shared 860px media query mixes admin and public selectors (see [`../project-guide.md`](../project-guide.md)).
- Thin out the GitHub Actions backstop crons after the cron Worker burn-in review (Phase 4 of [`2026-07-13-reliable-voting-announcements.md`](2026-07-13-reliable-voting-announcements.md)).
- The WAF rule blocking repo-internal paths can be slimmed after 2026-07-20 (when the stale Pages cache entries expire), but keeping it as permanent defense in depth is recommended.
- Optional rate limiting on `/api/suggest`, `/api/vote`, and `/api/auth/discord/start` via a Cloudflare WAF rate-limiting rule (dashboard, no code).
