# Ranked-Choice Voting Implementation Plan

Date: 2026-06-22

Status: implementation in progress. Progress is tracked per step in the [Implementation Steps](#implementation-steps) section (`[ ]` todo, `[~]` in progress/blocked, `[x]` done) and must be updated there as work lands. Target: in place before the first real voting phase opens on **2026-06-29** (no votes have been cast yet, so this is a clean cutover, not a live migration).

## Goal

Replace the current **approval voting** (tick every game you'd play, most ticks wins) with **ranked-choice / instant-runoff voting (IRV)** for current and future rounds:

- Voters rank suggested games in order of preference (partial rankings allowed).
- Count first choices; eliminate the lowest candidate each round; transfer each ballot to its next still-standing ranked game; repeat until one game holds a majority of the still-active (non-exhausted) ballots.
- One editable ballot per authenticated Discord member per round.
- The vote page shows live participation during voting: how many members have submitted a ranking (turnout only, not who is winning).
- Public winner reveal shows a round-by-round explanation.
- Admin sees aggregate results only; no individual ballots by default.

This is a focused change. The auth, scheduling, phase pipeline, meeting/homepage, suggestion, and Discord-announcement machinery all stay as they are. The work concentrates on: the `votes` table shape, the vote API, a new counting module, the vote-page UI, the reveal UI, and the scheduler's winner decision.

## Current System (what we are replacing)

- **Storage** (`schema.sql`, `votes` table): one row per `(ballot_id, suggestion_id)` a member ticks, carrying `round_id`, `voter_name`, `discord_user_id`. A ballot = all rows sharing a `ballot_id`. Tally = `COUNT(*) GROUP BY suggestion_id` (`getTallies` in [functions/_lib/db.js:456](../../functions/_lib/db.js)).
- **Cast vote** (`functions/api/vote.js`): `POST /api/vote` with `{ suggestionIds: number[] }`. Gated by phase `voting`, the schedule window (`roundScheduleState`), and `requireMemberSession`. Re-submitting deletes the member's previous rows (`DELETE ... WHERE round_id = ? AND discord_user_id = ?`) and inserts the new set under a reused `ballot_id`.
- **Public read** (`functions/api/round/current.js`): returns approved-suggestion cards; attaches `votes` per card **only when revealed/closed**; otherwise `null` (anti-bandwagon).
- **Reveal UI** (`js/vote.js` `renderRevealed` + `card(..., 'result')`): sorts by `votes`, draws a bar per game, tags `winnerSuggestionId` (falls back to top tally).
- **Vote UI** (`js/vote.js` `renderVoting`): a checkbox per card, one submit button, posts `suggestionIds`.
- **Admin** (`functions/api/admin/[[route]].js` + `vote-admin.html`): payload includes `tallies`, `ballots` (`getBallots`, GROUP_CONCAT of suggestion ids per ballot). The Votes section shows aggregate approval counts only; individual ballots are stored but not displayed. `DELETE /api/admin/ballot/:ballotId` removes one ballot.
- **Scheduler** (`automation/voting/scheduler.mjs` `decideRoundActions`): consumes `tallies`, picks the single highest, returns `reveal_winner` with `winnerSuggestionId`, or `blocked` on `no_votes` / first-place `tie`. Runner (`run-scheduler.mjs`) patches the round to `revealed` with that id.
- **Handoff** (`automation/voting/handoff.mjs`): renders a "Vote tally" section from `tallies`.
- **Discord** (`automation/voting/discord.mjs` `votingOpenedMessage`): copy says "You can vote for as many games as you like."

## Design Decisions

### 1. Ballot model: extend `votes` with a `rank`, do not add new tables

Keep the existing `votes` table and add a single nullable `rank INTEGER` column. One row per `(ballot, suggestion, rank)`; a member's ballot is the set of rows for `(round_id, discord_user_id)` ordered by `rank` ascending (`rank` = 1 is the first preference).

Why this over new `ballots` / `ballot_rankings` tables:
- The replace-on-resubmit semantics, `ballot_id` deletion key, `discord_user_id` association, cascade-on-round-delete, `voter_name` diagnostic, and `DELETE /api/admin/ballot/:id` all already work against `votes` and keep working unchanged.
- "One editable ballot per member per round" is already enforced by the `DELETE WHERE round_id+discord_user_id` then re-insert pattern. Ranking just adds an ordered `rank` to each inserted row.
- Minimal migration surface; no foreign-key/relationship rework.

The only conceptual change: an approval ballot stored N unordered rows; an RCV ballot stores N rows with `rank` 1..N. `getTallies` (count by suggestion) stops being the source of truth for the winner; first-preference counts and the full IRV count come from rank-ordered ballots.

### 2. Counting lives in one pure, shared module

Create `functions/_lib/rcv.js` exporting a pure `runIrv({ ballots, candidateIds })` function (no D1, no network). It returns the full round-by-round result. Putting it under `functions/_lib/` means **both** the Pages Functions and the Node scheduler can import it (the scheduler already imports `functions/_lib/schedule.js`), so there is exactly one counting implementation and one set of tie rules.

`ballots`: array of ordered, de-duplicated `suggestionId[]` (each voter's preference list, already filtered to approved candidates). `candidateIds`: the approved suggestions on the ballot (so a candidate with zero first-preferences still appears in round 1 with 0).

Return shape (aggregate only, safe to expose publicly):

```js
{
  winnerId: number | null,
  blocked: null | { reason: 'no_ballots' | 'tie', tied: [{ id, votes }] },
  majorityThresholdNote: 'more than half of active ballots',
  totalBallots: number,
  rounds: [
    {
      round: 1,
      counts: [{ id, votes }],          // for every still-standing candidate, desc
      activeBallots: number,            // non-exhausted ballots this round
      exhausted: number,                // ballots with no remaining ranked candidate
      majority: number,                 // floor(activeBallots/2) + 1
      eliminatedId: number | null,      // null on the winning round
      winnerId: number | null,          // set on the final round
      transfersInto: { [id]: number }   // optional, for the explanation
    },
    ...
  ]
}
```

### 3. Counting algorithm (IRV)

1. Seed each candidate's pile from ballots whose first still-standing preference is that candidate. Ballots that rank none of the standing candidates are **exhausted** and excluded from `activeBallots`.
2. `majority = floor(activeBallots / 2) + 1`. If any candidate reaches `majority`, it wins; record the winning round and stop.
3. Otherwise eliminate the lowest candidate (see tie rules), and redistribute each of its ballots to that ballot's next still-standing preference; ballots with no further preference become exhausted.
4. Repeat from step 2. With one candidate left it wins by default.

Edge cases handled explicitly: zero ballots (`blocked: no_ballots`), a single candidate (immediate winner), all-exhausted-but-no-majority resolves to the remaining top candidate, and partial rankings (a ballot simply exhausts when its list runs out).

### 4. Tie handling rules (deterministic, with one human-in-the-loop fallback)

**Elimination tie** (two or more candidates tied for lowest):
1. Eliminate the one with the fewest **first-preference** votes (round-1 counts).
2. Still tied → eliminate the one whose votes were lowest in the **most recent prior round** where they differed (backward tiebreak).
3. Still tied → eliminate the **lower suggestion `id`** (oldest suggestion). This guarantees the count always terminates without a coin flip, and `id` order is arbitrary-but-stable and not voter-influenced.

**Final / decisive tie** (the last standing candidates have exactly equal votes and none can reach majority, e.g. a 2-way tie on the final round): do **not** auto-pick. Return `blocked: { reason: 'tie', tied: [...] }`. This mirrors the existing scheduler behavior, where a top tie is left for the maintainer to break in `vote-admin.html` by selecting the winner manually. Rationale: an elimination order is a low-stakes internal step (safe to break by rule), but the actual winner of a tied final is a real decision the maintainer should own.

Document both rules in `docs/voting-system.md` and surface the final-tie case in the admin UI and the blocked Discord alert (reusing the existing `blocked` path).

### 5. Recompute on read; do not persist results

The IRV result is derived from stored ballots, so compute it server-side on each revealed read rather than adding result tables. This keeps schema changes to the single `rank` column, keeps the algorithm authoritative, and lets the maintainer fix a miscounted edge case by re-running rather than migrating stored results. `winner_suggestion_id` on `rounds` stays the single persisted outcome (set at reveal by the scheduler or admin), exactly as today.

## Schema Changes

`schema.sql` — `votes` table:
- Add `rank INTEGER` (nullable). Document: RCV ballots write `rank` 1..N (1 = first preference); pre-RCV approval rows (none exist in production) leave it `NULL`.
- Add index `idx_votes_ballot_rank ON votes(round_id, ballot_id, rank)` to read ballots in preference order efficiently.
- Update the `votes` table comment block to describe ranked ballots instead of approval rows.

Lazy migration helper in `functions/_lib/db.js`, matching the existing `ensure*` pattern (`ensureRoundScheduleColumns`, `ensureSuggestionVisibilityColumn`):
- Add `ensureVoteRankColumn(db)` that `addColumnIfMissing(db, 'votes', 'rank', 'INTEGER')` and creates the new index. Call it from `vote.js`, `round/current.js`, and the admin route before reading/writing votes.

No changes to `rounds`, `meetings`, `games`, `suggestions`, `discord_users`, `auth_sessions`, `automation_events`.

## Migration & Rollout Strategy

Because no votes exist yet and the first phase opens 2026-06-29, this is a clean cutover, but keep it non-breaking for already-revealed/closed historical rounds:

1. **Schema is additive only** (one nullable column). Applying it locally and to remote D1 (`wrangler d1 execute gamestormers --remote --file=./schema.sql`) is safe; the lazy `ensureVoteRankColumn` also patches remote on first request, so deploy order does not matter.
2. **Backward-compatible reads.** The reveal path and admin payload treat a round with rank-bearing ballots as RCV. A round whose ballots all have `NULL` rank (or none) falls back to the existing aggregate-count display, so nothing that is already `revealed`/`closed` breaks. In practice there are no such ballots, but the fallback keeps the change defensive.
3. **`winner_suggestion_id` semantics are unchanged**, so the homepage promotion flow (`adminSelectGame`, `getPublicMeetings`, `js/meetings.js`) is untouched.
4. **Deploy sequence:** ship backend (schema + `rcv.js` + API + scheduler) and frontend together in one push, since `main` auto-deploys. The vote page only renders ranking UI when `phase === 'voting'`; suggesting phase for meeting #-next is unaffected, giving slack before voting opens.
5. **Verification before 2026-06-29:** run the full local flow on the Pages dev server (suggest → open voting → rank → reveal) plus `npm test`.

## API Changes

`functions/api/vote.js` — `POST /api/vote`:
- Accept `{ rankings: number[] }` (ordered list of approved suggestion ids; first = top preference). Keep accepting the old `suggestionIds` only as a transitional alias if convenient, otherwise drop it.
- Validate: coerce to integers, drop non-approved ids (reuse the existing approved-set check), de-duplicate **preserving first occurrence order**, cap length to the number of approved suggestions. Reject empty.
- Replace ballot as today: `DELETE FROM votes WHERE round_id=? AND discord_user_id=?`, then batch-insert one row per ranked id with `rank = index + 1`, reusing the prior `ballot_id` when present.
- Keep all gating (`phase==='voting'`, `votingHasStarted`, `votingIsOpen`, `requireMemberSession`). Call `ensureVoteRankColumn`.

New `GET /api/vote/mine` (authenticated, member-only), in `functions/api/vote/mine.js` (or fold into the existing `vote.js` as `onRequestGet`):
- Return the logged-in member's current ranking for the current round: `{ rankings: number[] }` ordered by `rank`. Lets the vote UI pre-fill and edit an existing ballot. Never returns other members' ballots.

`functions/api/round/current.js`:
- When revealed/closed, compute `runIrv` from the round's rank-ordered ballots and approved candidate ids; include `rcvResult` (the aggregate shape above) in the response. Keep a per-card first-preference `votes` count for the simple bar, computed from round-1 counts.
- When **not** revealed, expose nothing about tallies or rankings (unchanged anti-bandwagon rule). The member's own ballot comes from `/api/vote/mine`, not this public route.
- **Participation count:** always include `round.ballotCount` (total distinct ballots submitted for the round). This is turnout, not a tally, so it is safe to expose during the `voting` phase without creating a bandwagon effect (it says how many people voted, never which game is ahead). Compute with `COUNT(DISTINCT ballot_id)` so a ranked ballot's multiple rows count once.

Admin route `functions/api/admin/[[route]].js` (`roundPayload`):
- Replace/augment `tallies` with `rcvResult` (computed via `runIrv`). Keep `ballots` from `getBallots` for the count and the deletion key, but **order suggestion ids by rank** (see below) and continue **not** surfacing individual ranked lists in the default UI.
- `winnerSuggestionId` selection, `adminSelectGame`, `adminAnnounceWinner` unchanged.

`functions/_lib/db.js`:
- `getBallots`: change `GROUP_CONCAT(suggestion_id)` to order by rank. SQLite: `GROUP_CONCAT(suggestion_id ORDER BY rank)` is not portable across all builds, so prefer fetching `(ballot_id, suggestion_id, rank)` rows ordered by `ballot_id, rank` and grouping in JS, returning `rankings: number[]` per ballot instead of an unordered `suggestionIds`.
- Add a small helper `getRankedBallots(db, roundId)` returning `[{ ballotId, rankings: number[] }]` for `runIrv`; `getTallies` can stay for first-preference counts or be derived from the IRV round-1 result.
- Add `getBallotCount(db, roundId)` returning `COUNT(DISTINCT ballot_id)` for the participation count (cheap; uses the existing `idx_votes_ballot` index).

## Vote-Page UI (`js/vote.js`, both languages via `STRINGS`)

Replace the checkbox grid in `renderVoting` with a ranking interface. Constraints: vanilla JS, accessible, works on mobile, matches existing card styling.

Approach (click-to-rank with reorder, no external drag library):
- Each suggestion card in voting mode gets an "Add to my ranking" / "Remove" toggle. Adding appends the game to an ordered **"Your ranking"** list and shows its position number.
- The ranking list supports reordering via up/down buttons on each entry (keyboard-accessible) and a remove button. (Optional progressive enhancement: pointer drag-and-drop on top of the buttons; buttons remain the accessible baseline.)
- Partial rankings are allowed; the helper text explains that unranked games simply aren't on your ballot and that lower ranks only matter if higher choices are eliminated.
- Pre-fill from `GET /api/vote/mine` on load so an existing ballot is shown and editable; the submit button reads "Update ranking" when a ballot exists (reuse existing `btnVote`/`btnUpdateVote` strings).
- Submit posts `{ rankings: [...] }`. On success show the thanks message and keep the ranking editable until voting closes.
- **Participation count:** during the `voting` phase, render `round.ballotCount` near the ballot panel, e.g. "12 members have submitted their ranking" (singular/plural and da/en variants). Re-fetch it when the member submits/updates their own ballot so their own vote is reflected; otherwise it reflects the count at page load (no live polling of other voters is needed, and deliberately so, to keep it as turnout rather than a live scoreboard). Optionally show it in the revealed phase too ("X members voted").
- New/changed `STRINGS` keys (da + en): ranking intro, "Your ranking", "Add to ranking", move up/down, remove, partial-ranking hint, update/submit labels, and the participation count ("{n} members have submitted their ranking" / "{n} member has..."). Remove/repurpose approval-specific copy (`introVoting`, `approve`, `alreadyVoted`).

`renderRevealed`:
- Keep the headline winner card. Below it, render the **round-by-round explanation** from `rcvResult.rounds`: for each IRV round, list standing candidates with their vote counts and bars, mark who was eliminated, show exhausted-ballot and majority numbers, and highlight the round where the winner crossed the majority line. Add `STRINGS` for "Round 1", "Eliminated", "Majority needed", "Transferred", "Exhausted ballots", "Winner reached a majority".
- Keep the existing fallback (sort by `votes`, tag `winnerSuggestionId`) when `rcvResult` is absent, so historical rounds still render.

`meetingFlow` / intro copy: update the "Vote" step text from "tick every game" to "rank the games in your order of preference."

## Admin UI (`vote-admin.html`)

- **Votes section**: replace the approval-count list with (a) first-preference counts and (b) a compact round-by-round IRV summary rendered from `rcvResult` (eliminations, transfers, final winner, majority line). Aggregate only.
- Keep the existing privacy note ("Individual ballots are stored for vote integrity but are not shown in the default admin UI") and keep ballot count + `DELETE /api/admin/ballot/:id`.
- Surface the **final-tie blocked** state explicitly: when `rcvResult.blocked.reason === 'tie'`, show the tied games and prompt the maintainer to break it by selecting the winner in the Selected-game section (existing flow). No new endpoint needed.
- `renderRound` / `renderSuggestions` continue to show per-suggestion first-preference counts for at-a-glance context.

## Scheduler & Automation

`automation/voting/scheduler.mjs` `decideRoundActions`:
- Replace the `tallies` input with `rcvResult` (precomputed by the admin API and passed through `api-client`), keeping the function pure and testable. Decision logic:
  - `rcvResult.blocked.reason === 'no_ballots'` → `blocked: no_votes` (reuse existing blocker label/flow).
  - `rcvResult.blocked.reason === 'tie'` → `blocked: tie` with the tied games (reuse existing message).
  - otherwise `reveal_winner` with `winnerSuggestionId = rcvResult.winnerId` and the winner's title/first-pref votes for the announcement.
- The date gates (`voting_opens_at`, `voting_closes_at`, inclusivity) and idempotency (`automation_events`) are unchanged.

`automation/voting/api-client.mjs`:
- The admin `GET /api/admin/round` already drives the scheduler reads; it now returns `rcvResult`, so the client just passes it into `decideRoundActions`. No new endpoint.

`automation/voting/handoff.mjs`:
- Replace the flat "Vote tally" section with: final IRV standing + winner, and a short round-by-round summary (counts, eliminations). Reuse `rcvResult` rather than recomputing.

`automation/voting/discord.mjs`:
- `votingOpenedMessage`: change "You can vote for as many games as you like" to ranking copy ("Rank the games in your order of preference. You don't have to rank them all."). Winner and suggestions-open messages need no logic change. Update `discord.test.mjs` expectations accordingly.

## Privacy Considerations

- **Never expose individual ranked ballots publicly.** `/api/round/current` exposes only `rcvResult` aggregates (per-round counts, transfers, exhausted totals) and only after reveal.
- **Participation count is turnout, not a tally.** `round.ballotCount` (a single distinct-ballot total) is the only vote-derived number exposed during the `voting` phase. It reveals how many people voted, never which game leads, so it does not create a bandwagon effect and is distinct from the per-candidate counts that stay hidden until reveal. Document this distinction in `docs/voting-system.md`.
- **Admin sees aggregates by default.** Ordered ballots exist server-side only for the count and the `ballot_id` deletion key; the default admin UI shows aggregate IRV results, not per-voter preference lists. Keep the existing note.
- **Small-electorate caveat:** with a small club, even aggregate transfer patterns can hint at individual preferences, and ranked data is more revealing than approval. Document this in `docs/voting-system.md` as an accepted trade-off, and keep first-preference/transfer reporting coarse (counts, not cross-tabs). Do not add any endpoint that returns voter-attributed rankings.
- `voter_name` / `discord_user_id` handling is unchanged (diagnostics + one-ballot enforcement); they are never returned to the public reveal.

## Testing Strategy

New `functions/_lib/rcv.test.mjs` (run by `npm test` / `node --test`) covering the pure counter:
- First-round majority winner.
- Multi-round elimination with transfers to next preference.
- Exhausted ballots when a partial ranking runs out; majority recomputed against shrinking active total.
- Candidate with zero first-preferences still listed in round 1.
- Single candidate → immediate winner.
- No ballots → `blocked: no_ballots`.
- Elimination-tie rules in order: first-preference tiebreak, prior-round backward tiebreak, then lowest-`id`; assert determinism.
- Final decisive tie → `blocked: tie` with the tied set.
- Stability: same input always yields the same elimination order and winner.

Update existing tests:
- `test/vote-ballot-replacement.test.mjs`: assert ranked rows are written with correct `rank` and replaced on resubmit.
- `automation/voting/scheduler.test.mjs`: feed `rcvResult` instead of `tallies`; cover reveal, tie-blocked, no-votes-blocked.
- `automation/voting/handoff.test.mjs` and `discord.test.mjs`: updated tally section and voting-open copy.
- Add a vote-API test for `rankings` validation (dedupe, order preservation, approved-only filtering, empty rejection) and `GET /api/vote/mine`.
- Add a test that `round.ballotCount` counts distinct ballots once (not per-ranked-row), updates on resubmit rather than double-counting, and is present during `voting` while per-candidate tallies remain hidden.

Manual verification on the Pages dev server (`npm run dev`, admin token `test`): open a round, suggest games, open voting, submit and edit a ranking from two accounts, reveal, and confirm the round-by-round explanation and the admin aggregate match a hand-computed result.

## Docs To Update (same commit as code)

- `docs/voting-system.md`: rewrite the `votes` description, the `/api/vote` and `/api/round/current` sections, the admin Votes section, the scheduler winner decision, and add a "Ranked-choice counting & tie rules" section. Note the privacy caveat.
- `schema.sql` comments (votes table).
- `MEETING_WORKFLOW.md`: if it references "most votes," update to IRV winner.
- `CLAUDE.md` / `docs/roadmap.md`: move ranked-choice out of any future-work framing; bump `css/style.css` `?v=N` if vote-page styles change, and `sitemap.xml` `lastmod` only if public copy changes meaningfully.

## Implementation Steps

Ordered so the repo stays working and testable after each step. Each step ends green (`npm test` passes); the public site behavior only changes once the frontend step ships, so backend steps can land first.

**Keep this plan updated as you go.** After completing each step, edit this file before moving on: flip the step's `Status` from `[ ]` (todo) to `[x]` (done) — or `[~]` if partially done/blocked — and append a dated one-line note under that step recording what landed, the commit/PR if any, and anything that diverged from the plan. Add new steps here if the work uncovers them rather than doing undocumented work. The plan is the source of truth for progress, so a reader can tell at a glance what is done and what remains.

1. `[x]` **Schema + lazy migration.** Add `rank INTEGER` and `idx_votes_ballot_rank` to `schema.sql`; update the `votes` comment block. Add `ensureVoteRankColumn(db)` to `functions/_lib/db.js`. Apply locally (`wrangler d1 execute gamestormers --local --file=./schema.sql`). No behavior change yet.
   - *2026-06-22:* Added the nullable rank column, ballot-rank index, and lazy migration helper; upgraded the existing local D1 database additively and reapplied the full schema successfully. Included in the ranked-choice foundation commit with no divergence from the plan.
   - *Verify:* column and index exist locally; existing tests still pass.

2. `[x]` **Pure counter `functions/_lib/rcv.js` + tests.** Implement `runIrv({ ballots, candidateIds })` with the algorithm and tie rules from this plan. Write `functions/_lib/rcv.test.mjs` covering every case listed under Testing Strategy. This is self-contained and unblocks both API and scheduler.
   - *2026-06-22:* Added the pure aggregate `runIrv` counter with active-ballot majority recalculation, transfer/exhaustion reporting, deterministic elimination tiebreaks, final-tie blocking, and 12 focused tests. Included in the ranked-choice foundation commit with no divergence from the plan.
   - *Verify:* `npm test` green, including all RCV cases.

3. `[x]` **DB helpers.** Add `getRankedBallots(db, roundId)` and `getBallotCount(db, roundId)`; change `getBallots` to return rank-ordered `rankings` per ballot (group in JS). Keep `getTallies` for first-preference counts.
   - *2026-06-22:* Added rank-ordered ballot grouping, distinct-ballot turnout counting, and first-preference tallies with legacy NULL-rank fallback. Updated the existing admin summary reads to consume `rankings` so the intermediate step remains functional; no other divergence from the plan.
   - *Verify:* helper-level coverage or via the API tests in the next steps.

4. `[x]` **Vote API.** Update `POST /api/vote` to accept `{ rankings }`, validate (dedupe/order/approved-only/non-empty), and write rank rows under the replace-on-resubmit pattern. Add `GET /api/vote/mine`. Call `ensureVoteRankColumn` on these routes.
   - *2026-06-22:* Added ordered ranked-ballot validation and rank persistence, retained `suggestionIds` as a temporary frontend alias, added the member-only `/api/vote/mine` read route, and covered replacement, filtering, ordering, alias, and private-read behavior in API tests.
   - *Verify:* update `test/vote-ballot-replacement.test.mjs`; add the `rankings` validation + `/api/vote/mine` tests.

5. `[x]` **Public read.** In `functions/api/round/current.js`, add `round.ballotCount` (always) and `rcvResult` + per-card first-preference `votes` (revealed only). Keep tallies hidden pre-reveal.
   - *2026-06-22:* Added distinct-ballot turnout to every current-round payload, revealed-only aggregate IRV results and first-preference card counts, and an all-NULL-rank fallback for historical approval rounds. Added route tests covering the pre-reveal privacy boundary, ranked reveal, distinct turnout, and legacy reveal.
   - *Verify:* add/extend a `round/current` test asserting `ballotCount` is present during voting while per-candidate counts are not, and `rcvResult` appears only when revealed.

6. `[x]` **Admin payload + scheduler.** Add `rcvResult` to `roundPayload`; switch `decideRoundActions` from `tallies` to `rcvResult` (reveal / tie-blocked / no-votes-blocked); confirm `api-client.mjs` passes it through. Update `automation/voting/scheduler.test.mjs`.
   - *2026-06-22:* Added aggregate IRV results to admin round payloads, including explicit no-ballot results and legacy NULL-rank fallback. Switched the scheduler runner and pure decision logic to `rcvResult`, preserving existing blocker labels and using round-one votes in winner metadata.
   - *Verify:* scheduler tests cover reveal, final-tie block, no-ballots block.

7. `[x]` **Handoff + Discord copy.** Rewrite the handoff "Vote tally" section from `rcvResult`; update `votingOpenedMessage` to ranking copy. Update `handoff.test.mjs` and `discord.test.mjs`.
   - *2026-06-22:* Replaced the flat tally with a `## Vote results` section rendered from `rcvResult` (final standing + round-by-round counts, eliminations, exhausted/majority lines), keeping a legacy approval-tally fallback when `rcvResult` is null and a no-ballots line. Surfaced the final-tie blocked state in the handoff. Updated `votingOpenedMessage` to ranking copy ("Rank the games in your order of preference. You don't have to rank them all.") and the vote-block intro to "Cast your ranking here:". Extended `handoff.test.mjs` (ranked standing, round-by-round, legacy fallback, tie) and `discord.test.mjs`. No divergence from the plan.
   - *Verify:* `npm test` green (174 tests).

8. `[ ]` **Vote-page UI (`js/vote.js`).** Replace the checkbox grid with the click-to-rank + reorder interface; pre-fill from `/api/vote/mine`; submit `{ rankings }`; render `ballotCount` during voting; add/repurpose `STRINGS` (da + en). Update the meeting-flow "Vote" copy.
   - *Verify:* on `npm run dev`, rank/edit a ballot from two accounts, see the participation count increment on submit, both languages.

9. `[ ]` **Reveal UI (`js/vote.js`).** Render the round-by-round explanation from `rcvResult.rounds` under the winner card; keep the legacy fallback for ballot-less rounds.
   - *Verify:* on dev, reveal a round and confirm the breakdown matches a hand-computed result; check the fallback path on a round with no ballots.

10. `[ ]` **Admin UI (`vote-admin.html`).** Replace approval counts with first-preference + IRV round-by-round summary (aggregate only); surface the final-tie blocked state; keep ballot count, the privacy note, and ballot deletion.
    - *Verify:* admin view matches the public reveal and the hand-computed result; tie state prompts manual selection.

11. `[ ]` **Docs + cache busting.** Update `docs/voting-system.md`, `schema.sql` comments, `MEETING_WORKFLOW.md`, and any roadmap/CLAUDE notes; bump `css/style.css` `?v=N` if vote styles changed; update `sitemap.xml` `lastmod` only if public copy changed meaningfully. Land docs in the same commit as the code per repo rules.

12. `[ ]` **End-to-end dry run + remote schema.** Full local flow (suggest → open voting → rank from multiple accounts → reveal) and `npm test`. Apply the additive schema to remote D1 intentionally (`--remote`) ahead of 2026-06-29; the lazy migration also self-heals on first request. Ship backend + frontend together (push to `main` deploys live).

## Out Of Scope

- Persisting computed results or a public archive of past voting rounds.
- Weighted/Condorcet/STV multi-winner methods (single-winner IRV only).
- Changing auth, the round pipeline, schedule math, or the homepage/meeting promotion flow.
- Drag-and-drop as the sole input method (buttons are the accessible baseline; drag is optional enhancement).
