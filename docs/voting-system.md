# Game Suggestion And Voting System

The voting feature is a members-driven flow for choosing the next meeting's game:

```text
suggestions open -> maintainer curates -> voting opens -> result revealed
```

It is the site's only dynamic feature. It runs on Cloudflare Pages Functions and D1, same-origin under `/api/*`. The design is privacy-first: no third-party cookies and no stored IPs.

## Architecture

- Frontend: `vote.html`, `en/vote.html`, and `js/vote.js`.
- Backend: Cloudflare Pages Functions in `functions/api/*`.
- Shared backend helpers: `functions/_lib/`.
- Storage: Cloudflare D1 with schema in `schema.sql`.
- Admin UI: `vote-admin.html`, unlisted, `noindex`, gated by Bearer `ADMIN_TOKEN`.

`js/vote.js` is bilingual via `STRINGS[lang]`. It renders suggestion, voting, and result states based on the current round phase.

## D1 Tables

- `rounds`: meeting round, phase, winner, and storm code.
- `suggestions`: submitted games and imported metadata.
- `votes`: approval-voting rows, one row per selected game, with optional self-reported `voter_name`.

## API Routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/round/current` | GET | Current round and approved cards. Tallies are only exposed when revealed. The storm code is never exposed. |
| `/api/suggest` | POST | Submit a suggestion. Steam suggestions are imported server-side and auto-approved. Non-Steam suggestions are pending until maintainer approval. |
| `/api/vote` | POST | Cast an approval ballot with optional voter name. |
| `/api/admin/round` | GET/POST/PATCH | Read full round, open a new round, change phase, winner, or code. |
| `/api/admin/suggestion/:id` | PATCH/DELETE | Approve, reject, edit, or delete a suggestion. |
| `/api/admin/ballot/:ballotId` | DELETE | Remove a single ballot and all its votes. |

## Phases

Valid `rounds.phase` values:

```text
suggesting -> voting -> revealed -> closed
```

The current round is the row with the highest `id`, which also maps to the meeting number.

## Vote Integrity

The system deliberately uses lightweight safeguards:

- Per-round storm code as a soft Discord gate.
- Cloudflare Turnstile for bot checks.
- Random `ballot_id` returned to the client and stored in localStorage only for "you already voted" UX.

The `ballot_id` is not an identity system and is not enforced server-side as one-vote-per-person. That is intentional. Stronger enforcement would require identity such as Discord login, which is out of scope.

Admin moderation compensates for the low-friction flow:

- Admin can see full per-ballot breakdown at any phase.
- Admin can see live tallies.
- Admin can delete suspicious ballots.
- Ballot names are rendered with `textContent`, never `innerHTML`.

## Suggestion Curation

Member-facing suggestion guidelines:

- Games must be playable on PC.
- The usual target is about 10 hours or less to finish.
- Longer games and open-ended games are allowed when the pitch clearly says so.
- The vote page links to upcoming games and the history section so members can avoid suggesting games already scheduled or played.

Steam suggestions:

- User submits a Steam store URL.
- Backend imports title, banner, genres, platforms, price, and short descriptions.
- Descriptions are fetched in English and Danish and stored as `description_en` and `description_da`.
- Suggestions are auto-approved and visible immediately.
- Admin can still edit, reject, or delete them.

Non-Steam suggestions:

- User enters title, store link, genres, and pitch.
- Suggestion is stored as `pending`.
- It stays hidden until the maintainer verifies it and adds/approves an image.

HowLongToBeat has no API in this project. `playtime_hours` is filled manually by the maintainer during curation.

## Turnstile

`vote.html` and `en/vote.html` carry the public production `data-turnstile-sitekey` on `#vote-app`.

`js/vote.js` overrides that sitekey on `localhost`, `127.0.0.1`, and `0.0.0.0` with Cloudflare's always-pass visible test sitekey, `1x00000000000000000000AA`.

Keep the matching secret in Cloudflare Pages as `TURNSTILE_SECRET`. Local development can use Cloudflare's always-pass test secret in `.dev.vars`.

## Local Development

```powershell
wrangler d1 create gamestormers
wrangler d1 execute gamestormers --local --file=./schema.sql
npm run dev
```

Create `.dev.vars` with:

```text
TURNSTILE_SECRET=...
ADMIN_TOKEN=test
```

Open:

- `http://127.0.0.1:8788/vote.html`
- `http://127.0.0.1:8788/en/vote.html`
- `http://127.0.0.1:8788/vote-admin.html`

Use `test` for the admin page when using the local `.dev.vars` value.

Apply the schema to production only when intentionally changing production D1:

```powershell
wrangler d1 execute gamestormers --remote --file=./schema.sql
```

## Planned Phase 2

Not built yet: scheduler automation for phase changes, Discord announcements, and generation of event-card/history-card values for the winning game. A Cloudflare Cron Trigger or GitHub Action could handle this later. Playtime should stay manual unless a reliable source becomes available.
