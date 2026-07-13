# Roadmap

Future work that is intentionally out of scope for current changes. Each item should explain the goal and any constraints that the current code already assumes.

Candidate features from the July 2026 audit (ICS calendar feed, public voting archive, "already played" suggestion guard) are outlined in [`plans/2026-07-13-recommended-features.md`](plans/2026-07-13-recommended-features.md).

## Admin section for past and upcoming games / public meetings

Add a dedicated admin area for managing public meeting records (the homepage event/history cards) independently of voting rounds.

Scope:

- List past and upcoming public meetings.
- Edit a public meeting's details outside the voting flow.
- Cancel a public meeting (set `meetings.status = 'cancelled'`).
- Remove a public meeting independently of any voting round.

Why it is separate:

Deleting a voting round is round-only by design: it removes the round and (via `ON DELETE CASCADE`) its suggestions and votes, but deliberately leaves the matching `meetings` row live so the homepage card survives. Meeting lifecycle (cancel/remove) belongs in this admin section instead of being coupled to round deletion. See the round-delete notes in [`voting-system.md`](voting-system.md) and the `adminDeleteRound` comment in `functions/api/admin/[[route]].js`.

Origin: Finding 1 of [`plans/2026-06-19-project-audit-review.md`](plans/2026-06-19-project-audit-review.md).

## Winning animation on the reveal

Add a celebratory animation when the winner is revealed on the vote page, on top of the existing "the winner is" card and round-by-round breakdown.

Scope:

- A lightweight reveal animation for the winner card (for example a brief highlight, count-up, or confetti burst) when `renderRevealed` shows the winner.
- Respect `prefers-reduced-motion`: fall back to the current static reveal with no motion.
- Vanilla CSS/JS only, no heavy animation libraries; keep it consistent with the existing card styling and the `.vote-winner-reveal` markup.
