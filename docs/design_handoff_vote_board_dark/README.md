# Handoff: Vote Board Redesign — Dark (Variation A)

## Overview

This is a redesign of the content board on `gamestormers.dk/vote` — everything below the existing green hero + cream phase-timeline strip. The board covers all three round phases: **Suggesting**, **Voting**, and **Revealed**. The design is a refinement within the existing Gamestormers brand (purple/green/cream, Barlow Condensed + DM Sans) — not a new visual direction.

The three focus areas are:
1. **Suggest-a-game form flow** — cleaner inline panel with segmented Steam/non-Steam path selector.
2. **Ranked-choice voting interaction** — two-column layout with a sticky ballot panel for building an ordered ranking.
3. **IRV results breakdown** — round-by-round instant-runoff display with bars, majority marker, transfer labels and eliminated states.

---

## Deviations from the prototype (read this first)

`Vote Board.dc.html` is a visual reference only. It leaves out three things the live page must keep, so where this section conflicts with the prototype or with detailed text further down, **this section wins**:

1. **The suggest panel is collapsible and closed by default.** The prototype shows it always open. In production it is wrapped in a `<details>` disclosure (`.vote-board-disclosure`) that starts collapsed. This replaces, not removes, the existing `.vote-disclosure` toggle. See *Phase: Suggesting → Collapsible board disclosures*.

2. **There is a second collapsible panel the prototype omits: "Your suggestions" (owner/management).** Members can edit their own pitches (while suggesting is open) and toggle whether their Discord name shows on each suggestion. This is the existing `ownerVisibilitySlot()` feature. It becomes a second `.vote-board-disclosure`, also closed by default, rendered only when the member owns at least one suggestion. See *Phase: Suggesting → Your-suggestions panel*.

3. **Not every game has cover art.** Manually-added (non-Steam) games have no `s.image`. The cover-art treatment needs a defined no-image fallback and a legibility scrim. See *Suggestion cards → Cover*.

Two more cross-cutting notes:

- **Reuse the existing class names**, don't introduce parallel ones. The prototype's `.vote-rank-badge` is the existing `.vote-rank-position`; its add/remove button is the existing `.vote-rank-toggle` (not `.vote-card-toggle`). Keep the existing names so we don't ship duplicate CSS.
- **Preserve the existing auth / non-member behavior.** Login + identity live in `.vote-auth` inside the green hero (unchanged). Non-members and logged-out visitors get read-only cards and no suggest/vote controls (`canParticipate()` gating). The collapsible panels only render for members. See *Existing features to preserve*.

---

## About the Design Files

The file `Vote Board.dc.html` in this folder is an **HTML design reference** — a high-fidelity interactive prototype. It is not production code to copy directly. The target is to **recreate this design in the existing codebase**:

- **Frontend**: vanilla JavaScript (`js/vote.js`) + CSS (`css/style.css`)
- **Backend**: unchanged — Cloudflare Pages Functions + D1 (same API)
- **No framework change needed** — all new UI is CSS classes added to `style.css` and DOM tweaks in `vote.js`

The prototype includes a bottom switcher (Stil A/B, Fase) that is **preview chrome only** — it does not ship.

---

## Fidelity

**High-fidelity.** Exact colors, type sizes, spacing, border radii, and interactions are specified. Recreate pixel-precisely using the existing `style.css`/`vote.js` patterns.

---

## What Stays Unchanged

- Purple sticky header (`<header class="gs-header">`)
- Green hero section (`.vote-ritual-hero`) — the green+cream poster countdown
- Cream phase-timeline strip (`.vote-timeline-section`)
- Footer
- All backend API routes and data shapes
- All existing class names used outside the board section

Only the **`.vote-content-section`** and its children are redesigned.

---

## Design Tokens

All tokens live in `:root` in `style.css`. No new tokens need to be added — the redesign references only existing ones plus a handful of new values listed below.

### Existing tokens (keep as-is)
```css
--purple:      #2B2436
--green:       #96C38D
--green-dark:  #7aaa71
--green-light: #c2dbbe
--cream:       #F7F4EE
--cream-dark:  #EDE8DF
--text:        #1C1826
--muted:       #5a5366
--shadow-sm:   0 2px 8px rgba(43,36,54,0.10)
--shadow-md:   0 8px 28px rgba(43,36,54,0.14)
--radius:      16px
```

### New tokens to add to `:root`
```css
--board-ink:         #F7F4EE;
--board-ink-soft:    rgba(247,244,238,.74);
--board-ink-faint:   rgba(247,244,238,.50);
--board-card-bg:     rgba(247,244,238,.055);
--board-card-border: rgba(247,244,238,.14);
--board-panel-bg:    rgba(247,244,238,.045);
--board-hairline:    rgba(247,244,238,.12);
--board-chip-bg:     rgba(247,244,238,.08);
--board-winner-glow: rgba(150,195,141,.22);
```

### Typography
| Role              | Font                | Weight | Size (desktop)         | Letter-spacing |
|-------------------|---------------------|--------|------------------------|----------------|
| Section headings  | Barlow Condensed    | 800    | clamp(2rem,3.4vw,2.8rem) | -0.025em     |
| Round label       | Barlow Condensed    | 800    | 1.25rem                | 0.01em         |
| Ballot title      | Barlow Condensed    | 800    | 1.7rem                 | -0.01em        |
| Winner title      | Barlow Condensed    | 800    | clamp(2.6rem,5vw,4rem) | 0              |
| Winner votes      | Barlow Condensed    | 800    | 3rem                   | -0.02em        |
| Body / labels     | DM Sans             | 400–700| 0.78rem – 1.06rem      | —              |

---

## Section: `.vote-content-section` (the board)

```
background: #241f30   ← slightly deeper than --purple for contrast against the timeline
padding: 56px 0 80px
color: #F7F4EE
```

The wrap inside is unchanged: `max-width: 1160px; margin: 0 auto; padding: 0 32px`.

### Intro line
```
.vote-content-intro (existing class)
  color: var(--board-ink-soft)     ← #F7F4EE at 74% opacity
  font-size: 1.06rem
  max-width: 640px
  margin-bottom: 8px
```

---

## Phase: Suggesting

### Layout
Single-column stack:
1. **Suggest panel** — collapsible, closed by default (members only)
2. **Your-suggestions panel** — collapsible, closed by default (members who own suggestions only)
3. Section header + stats
4. Suggestion card grid (3-col, same as existing `.suggestion-grid`)

Both panels (1 and 2) share the collapsible disclosure shell below. The grid (3–4) renders for everyone, including non-members.

### Collapsible board disclosures — `.vote-board-disclosure`
A reusable disclosure for the dark board, built on native `<details>`/`<summary>` so keyboard, focus and ARIA come for free, and "closed by default" is just the absence of the `open` attribute. The suggest panel and the your-suggestions panel are both instances of it. (This replaces the old single-purpose `.vote-disclosure` button toggle.)

```css
.vote-board-disclosure {
  border: 1px solid var(--board-card-border);
  background: var(--board-panel-bg);
  border-radius: 18px;
  overflow: hidden;
}
.vote-board-disclosure + .vote-board-disclosure { margin-top: 14px; }
.vote-board-disclosure > summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 20px 24px;
  color: var(--board-ink);
}
.vote-board-disclosure > summary::-webkit-details-marker { display: none; }
.vote-board-disclosure-heading {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: clamp(1.6rem, 2.6vw, 2.1rem);
  letter-spacing: -.02em;
  line-height: 1;
}
.vote-board-disclosure-count {          /* "3" badge after the owner-panel title */
  color: var(--board-ink-faint);
  font-weight: 600;
  font-size: .9rem;
  margin-left: 8px;
}
.vote-board-disclosure-chevron {
  flex: none;
  width: 20px; height: 20px;
  color: var(--board-ink-soft);
  transition: transform .18s ease;
}
.vote-board-disclosure[open] .vote-board-disclosure-chevron { transform: rotate(180deg); }
.vote-board-disclosure-body { padding: 0 24px 24px; }
```

Reuse the existing `CHEVRON_GLYPH` SVG (already defined in `vote.js`) for `.vote-board-disclosure-chevron`.

### 1. Suggest Panel
The suggest panel is the **body** of a `.vote-board-disclosure`:

- `<summary>` holds the heading (`T.formTitle`, e.g. "Foreslå et spil") and the chevron.
- `.vote-board-disclosure-body` holds: the lead `<p>`, the guidelines chips, the Steam/manual tabs, and the two form bodies.

**Panel lead (first child of the body):**
```
p   font: DM Sans 400, 0.95rem, --board-ink-soft, max-width 560px, margin: 0 0 0
```

**Guidelines chips row** (replaces existing bullet list):
```css
.vote-suggest-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 18px 0 22px;
}
.vote-suggest-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border-radius: 999px;
  background: var(--board-chip-bg);
  color: var(--board-ink-soft);
  font-size: .82rem;
  font-weight: 600;
}
.vote-suggest-chip b { color: var(--green); }   /* PC, ~10t labels */
```

**Steam/manual path segmented control:**
```css
.vote-path-tabs {
  display: inline-flex;
  padding: 5px;
  gap: 4px;
  background: var(--board-chip-bg);
  border-radius: 12px;
  margin: 0 0 18px;   /* inside .vote-board-disclosure-body, which owns the side padding */
}
.vote-path-tab {
  padding: 9px 18px;
  border-radius: 9px;
  border: 0;
  background: transparent;
  color: var(--board-ink-soft);
  font-weight: 700;
  font-size: .88rem;
  cursor: pointer;
  font-family: inherit;
  transition: background .12s, color .12s;
}
.vote-path-tab.active {
  background: var(--green);    /* #96C38D */
  color: #241f30;
}
```

**Form body** (Steam and manual):
```css
.vote-suggest-form-body {
  padding: 4px 0 0;   /* horizontal + bottom padding come from .vote-board-disclosure-body */
  display: grid;
  gap: 18px;
  max-width: 620px;
}
```

Input/textarea styling:
```css
.vote-input, .vote-textarea {
  padding: 13px 15px;
  border-radius: 10px;
  border: 1px solid var(--board-card-border);
  background: var(--board-card-bg);
  color: var(--board-ink);
  font-size: .95rem;
  font-family: inherit;
  width: 100%;
}
.vote-input:focus, .vote-textarea:focus {
  outline: none;
  border-color: var(--green);
}
.vote-field-hint {
  color: var(--board-ink-faint);
  font-size: .8rem;
  margin-top: 4px;
}
```

Manual form: genres + store link in a 2-column grid (`grid-template-columns: 1fr 1fr; gap: 14px`).

**Label style for fields:**
```css
.vote-label {
  font-weight: 700;
  font-size: .86rem;
  color: var(--board-ink);
}
.vote-label span { color: var(--board-ink-faint); font-weight: 500; }   /* "(valgfri)" */
```

**CTA button (Send forslag / primary action):**
```css
.btn-board-cta {
  padding: 13px 22px;
  border-radius: 10px;
  border: 0;
  background: var(--green);    /* #96C38D */
  color: #241f30;
  font-weight: 700;
  font-size: .95rem;
  cursor: pointer;
  font-family: inherit;
}
.btn-board-cta:hover { background: var(--green-light); }
.btn-board-cta:disabled { opacity: .5; cursor: not-allowed; }
```

**JS change in `vote.js`**: the existing `showChoice()` → `showSteamForm()` / `showManualForm()` flow is replaced by:
- The panel lives in a `.vote-board-disclosure`, **collapsed by default** (do not set `open`).
- The old yes/no `showChoice()` step is removed; both form bodies are rendered once and switched by a `data-path="steam"|"manual"` attribute on the form container, shown via CSS (`[data-path="steam"] .vote-form-manual { display:none }`). No re-render on tab switch.
- The tabs (`role="tab"` / `aria-selected`, or a `radiogroup`) sit above the form bodies; clicking a tab only flips `data-path`.
- Guidelines move into the chip row at the top of the body (no separate `aside.vote-guidelines` in the suggesting phase). Because the panel is collapsed by default, the chips are only visible once a member expands it — that is acceptable; the page leads with the suggestion grid.

### 1b. Your-suggestions (owner/management) panel
This is the existing `ownerVisibilitySlot()` / `renderOwnerPanelInto()` feature, restyled as a second `.vote-board-disclosure` directly below the suggest panel. It is rendered **only when `mySuggestions.length > 0`** and is **collapsed by default**.

- `<summary>`: heading `T.managePitchTitle` ("Dine forslag" / "Your suggestions") + a `.vote-board-disclosure-count` showing the count + chevron.
- `.vote-board-disclosure-body`: the existing hint `T.managePitchHint` followed by the existing `.vote-owner-list` markup (`.vote-owner-item` rows with the name-visibility checkbox and, while suggesting is open, the pitch editor). **No new card CSS is needed** — `.vote-owner-list` / `.vote-owner-item` already exist in `style.css`; only the outer shell changes to the disclosure.

**Re-render rule (important):** `renderOwnerPanelInto()` currently clears and rebuilds the whole slot, which would collapse an open `<details>` whenever a member toggles a name. Refactor so the `<details>` element is created once and stays mounted; on refresh, only the inner `.vote-owner-list` is rebuilt and the whole `<details>` is hidden (or removed) when the member has no suggestions. This preserves the open/closed state across the in-place updates triggered by `refreshOwnerPanels()`.

The same `.vote-board-disclosure` owner panel is reused in the **voting** and **revealed** phases (see those sections), where the pitch editor is omitted (`pitchEditable` is false) and only the name-visibility toggles remain.

### 2. Section header + stats
```css
.vote-list-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin: 8px 0 18px;
}
/* .vote-list-title already defined */
.vote-stats-summary { color: var(--board-ink-faint); font-size: .95rem; }
.vote-stats-summary b { color: var(--board-ink-soft); }
```

### 3. Suggestion cards (list mode)
Cards use existing `.suggestion-card` with the overrides already in `.gs-vote-page .suggestion-card`:
```css
border-color: var(--board-card-border);
border-radius: 13px → 14px  /* slight increase */
background: var(--board-card-bg);
```

New card structure (replaces current where title is in `.suggestion-head`):

**Cover** (new):
```css
.suggestion-cover-art {
  position: relative;
  aspect-ratio: 16 / 8.3;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  /* Steam art set inline via background-image when s.image exists (see below) */
}
/* No-image fallback: manually-added games have no s.image. Add a .is-placeholder
   modifier and render a brand gradient so the cover still reads as a cover. */
.suggestion-cover-art.is-placeholder {
  background: linear-gradient(150deg, var(--purple) 0%, #3a3147 100%);
}
/* Legibility scrim: the title is white text over arbitrary capsule art, so a
   bottom-up dark gradient guarantees contrast regardless of the image. */
.suggestion-cover-art::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 55%);
  pointer-events: none;
}
.suggestion-cover-art h3,
.suggestion-cover-art .suggestion-cover-store { position: relative; z-index: 1; }
.suggestion-cover-art h3 {
  position: absolute;
  bottom: 14px; left: 15px;
  margin: 0;
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 1.65rem;
  color: #fff;
  text-transform: uppercase;
  line-height: .92;
  text-shadow: 0 2px 14px rgba(0,0,0,.45);
}
/* Store badge (Steam / GOG) */
.suggestion-cover-store {
  position: absolute;
  top: 11px; right: 11px;
  padding: 4px 9px;
  border-radius: 6px;
  background: rgba(0,0,0,.45);
  color: #fff;
  font-size: .66rem;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
}
```

> **Note:** In production, set `background-image: url(s.image)` on `.suggestion-cover-art` when `s.image` exists (already fetched in the suggestions data). When it does not (manual/non-Steam games), add the `.is-placeholder` modifier instead — never leave the title floating on a bare panel background. The prototype's inline gradients simulate both states.

**Body:**
```css
.suggestion-body {
  padding: 15px 16px 17px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}
.suggestion-meta {         /* genres · playtime */
  color: var(--board-ink-faint);
  font-size: .8rem;
  font-weight: 600;
}
.suggestion-description {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--board-ink-soft);
  font-size: .9rem;
  line-height: 1.5;
  margin: 0;
}
.suggestion-pitch-block {
  padding-top: 11px;
  border-top: 1px solid var(--board-hairline);
}
.suggestion-pitch-label {
  display: block;
  color: var(--green);
  font-size: .65rem;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.suggestion-pitch {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--board-ink-soft);
  font-size: .85rem;
  line-height: 1.5;
  margin: 0;
}
.suggestion-by {
  margin: 6px 0 0;
  color: var(--board-ink-faint);
  font-size: .8rem;
}
.suggestion-by b { color: var(--board-ink-soft); }
```

---

## Phase: Voting

### Layout — two-column
```css
.vote-voting-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(290px, 1fr);
  gap: 26px;
  align-items: start;
}
@media (max-width: 860px) {
  .vote-voting-layout { grid-template-columns: 1fr; }
}
```

### Turnout line
```css
.vote-participation-line {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 14px 0 26px;
  color: var(--board-ink-soft);
  font-size: .9rem;
  font-weight: 600;
}
.vote-participation-line::before {
  content: '';
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--green);
  flex: none;
}
```

### Game card grid (vote mode) — 2-column slate
```css
.vote-slate-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
@media (max-width: 860px) {
  .vote-slate-grid { grid-template-columns: 1fr; }
}
```

**Vote-mode card extras:**

Rank position badge (shown when card is selected). **Use the existing class `.vote-rank-position`** (already created by `card(s, 'vote')` in `vote.js`); apply these styles to it rather than adding a `.vote-rank-badge`:
```css
.vote-rank-position {   /* existing class — restyle, don't rename */
  position: absolute;
  top: 11px; left: 11px;
  width: 32px; height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--green);
  color: #241f30;
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 1.15rem;
  box-shadow: 0 2px 10px rgba(0,0,0,.3);
}
```

Selected card state:
```css
.suggestion-card.selected {
  border-color: var(--green);
  background: rgba(150,195,141,.10);
}
```

Add/remove toggle button. **Use the existing class `.vote-rank-toggle`** (created by `card(s, 'vote')`), not a new `.vote-card-toggle`. The `is-ranked` state and `✓` prefix already exist in `vote.js` / `style.css`; restyle them to match:
```css
.vote-rank-toggle {
  margin-top: auto;
  padding: 10px 12px;
  border-radius: 9px;
  font-weight: 700;
  font-size: .85rem;
  cursor: pointer;
  font-family: inherit;
  border: 1px solid var(--board-card-border);
  background: transparent;
  color: var(--board-ink);
  transition: border-color .12s, background .12s, color .12s;
}
.vote-rank-toggle.is-ranked {
  border-color: var(--green);
  background: rgba(150,195,141,.14);
  color: var(--green-light);
}
.vote-rank-toggle.is-ranked::before { content: '✓ '; }
```

### Sticky ballot panel — `.vote-ballot-panel`
```css
.vote-ballot-panel {
  position: sticky;
  top: calc(var(--header-h) + 16px);   /* --header-h is 72px desktop / 60px mobile; +16px gap */
  border: 1px solid var(--board-card-border);
  background: var(--board-panel-bg);
  border-radius: 16px;
  padding: 20px;
}
```

**Panel heading:**
```
h2  Barlow Condensed 800 1.7rem  letter-spacing -.01em  --board-ink
p   DM Sans .84rem  --board-ink-soft  line-height 1.5  margin-top 6px  margin-bottom 16px
```

**Ballot item list — `.vote-ranking-list`:**
```css
.vote-ranking-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 16px;
}
.vote-ranking-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px 9px 9px;
  border-radius: 11px;
  background: var(--board-card-bg);
  border: 1px solid var(--board-card-border);
}
.vote-ranking-pos {
  flex: none;
  width: 28px; height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--green);
  color: #241f30;
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 1.05rem;
}
.vote-ranking-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--board-ink);
  font-weight: 600;
  font-size: .9rem;
}
.vote-ranking-controls {
  display: flex;
  gap: 3px;
  flex: none;
}
.vote-ranking-move, .vote-ranking-remove {
  width: 28px; height: 28px;
  border: 1px solid var(--board-card-border);
  background: transparent;
  color: var(--board-ink-soft);
  border-radius: 7px;
  cursor: pointer;
  font-size: .85rem;
}
.vote-ranking-move:disabled { opacity: .35; cursor: default; }
```

**Empty state** (shown when ranking is empty):
```css
.vote-ballot-empty {
  margin: 0 0 16px;
  padding: 18px;
  border: 1px dashed var(--board-card-border);
  border-radius: 12px;
  color: var(--board-ink-faint);
  font-size: .86rem;
  text-align: center;
}
```

**Vote submit button:**
```css
.vote-submit-btn {
  width: 100%;
  padding: 14px;
  border-radius: 11px;
  border: 0;
  background: var(--green);
  color: #241f30;
  font-weight: 800;
  font-size: 1rem;
  cursor: pointer;
  font-family: inherit;
}
.vote-submit-btn:disabled { opacity: .5; cursor: not-allowed; }
.vote-submit-btn:hover:not(:disabled) { background: var(--green-light); }
```

**Post-vote thanks message:**
```css
.vote-thanks {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(150,195,141,.16);
  color: #bfe0b7;
  font-size: .85rem;
  font-weight: 600;
  text-align: center;
}
```

**IRV footnote** (bottom of panel):
```
⚖︎  Vinderen findes med ranglisteafstemning (instant-runoff).
font-size: .78rem   color: --board-ink-faint   margin-top: 14px   line-height: 1.45
```

---

## Phase: Revealed

### Winner reveal block — `.vote-winner-reveal` (redesigned)
```css
.vote-winner-block {
  margin-top: 24px;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 0;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid var(--board-card-border);
  background: var(--board-panel-bg);
  box-shadow: 0 0 0 1px var(--green), 0 24px 60px var(--board-winner-glow);
}
@media (max-width: 700px) {
  .vote-winner-block { grid-template-columns: 1fr; }
}
```

**Left: cover panel**
```css
.vote-winner-cover {
  position: relative;
  min-height: 300px;
  /* background: Steam capsule image (s.image) */
  display: flex;
  align-items: flex-end;
  padding: 26px;
}
.vote-winner-badge {   /* ★ Vinder pill */
  position: absolute;
  top: 18px; left: 18px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border-radius: 999px;
  background: var(--green);
  color: #2B2436;
  font-weight: 800;
  font-size: .78rem;
  letter-spacing: .04em;
  text-transform: uppercase;
}
.vote-winner-cover h2 {
  margin: 0;
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: clamp(2.6rem, 5vw, 4rem);
  color: #fff;
  text-transform: uppercase;
  line-height: .9;
  text-shadow: 0 3px 18px rgba(0,0,0,.5);
}
```

**Right: copy panel**
```css
.vote-winner-copy {
  padding: 30px 30px 32px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
}
.vote-winner-eyebrow {    /* "Vinderen er" */
  color: var(--green);
  font-size: .78rem;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
  margin: 0;
}
.vote-winner-tally {      /* "12 stemmer i sidste runde" */
  display: flex;
  align-items: flex-end;
  gap: 11px;
}
.vote-winner-tally strong {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 3rem;
  line-height: .78;
  color: var(--board-ink);
  flex: none;
}
.vote-winner-tally span {
  color: var(--board-ink-soft);
  font-weight: 600;
  padding-bottom: 4px;
}
.vote-winner-meta {    /* genres · playtime */
  color: var(--board-ink-faint);
  font-size: .85rem;
  font-weight: 600;
}
.vote-winner-pitch {
  color: var(--board-ink-soft);
  font-size: .95rem;
  line-height: 1.55;
  margin: 0;
}
```

Winner copy panel CTA row:
```css
.vote-winner-actions { display: flex; gap: 8px; margin-top: 4px; }
/* Primary: .btn-board-cta (see above) */
/* Secondary: */
.btn-board-secondary {
  padding: 9px 16px;
  border-radius: 9px;
  border: 1px solid var(--board-card-border);
  color: var(--board-ink);
  font-weight: 700;
  font-size: .88rem;
  background: transparent;
  cursor: pointer;
}
```

### IRV Breakdown — `.vote-breakdown` (redesigned)
```css
.vote-breakdown { margin-top: 46px; }
.vote-breakdown-title {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: clamp(2rem, 3.6vw, 2.9rem);
  font-weight: 800;
  letter-spacing: -.025em;
  color: var(--board-ink);
  margin: 0;
}
.vote-breakdown-intro {
  max-width: 660px;
  margin: 8px 0 26px;
  color: var(--board-ink-soft);
  font-size: .95rem;
  line-height: 1.6;
}
.vote-breakdown-rounds {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
}
```

**Round card** (`.vote-breakdown-round`):
```css
.vote-breakdown-round {
  border: 1px solid var(--board-card-border);
  border-radius: 14px;
  padding: 18px 20px;
  background: var(--board-card-bg);
}
.vote-breakdown-round.is-final {
  background: rgba(150,195,141,.07);
  box-shadow: 0 0 0 1px var(--green);
}
```

**Round header:**
```css
.vote-breakdown-round-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.vote-breakdown-round-num {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 1.25rem;
  color: var(--board-ink);
  letter-spacing: .01em;
  white-space: nowrap;
  flex: none;
}
.vote-breakdown-meta {
  color: var(--board-ink-faint);
  font-size: .82rem;
  font-weight: 600;
}
```

**Candidate list:**
```css
.vote-breakdown-candidates {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 0;
}
```

**Candidate row:**
```css
.vote-breakdown-candidate-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 5px;
}
.vote-breakdown-name {
  font-weight: 700;
  font-size: .9rem;
  color: var(--board-ink);
}
.vote-breakdown-candidate.is-eliminated .vote-breakdown-name {
  color: var(--board-ink-faint);
  text-decoration: line-through;
  text-decoration-color: var(--board-ink-faint);
}
.vote-breakdown-transfer {
  flex: none;
  color: var(--green);
  font-size: .74rem;
  font-weight: 700;
}
/* vote count right-aligned */
.vote-count {
  flex: none;
  margin-left: auto;
  color: var(--board-ink-soft);
  font-weight: 700;
  font-size: .85rem;
}
```

**Tag chips:**
```css
/* Winner tag */
.vote-winner-tag {
  flex: none;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--green);
  color: #2B2436;
  font-size: .68rem;
  font-weight: 800;
  letter-spacing: .04em;
  text-transform: uppercase;
}
/* Eliminated tag */
.vote-breakdown-elim-tag {
  flex: none;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--board-chip-bg);
  color: var(--board-ink-faint);
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
}
```

**Bar track:**
```css
.vote-bar-track {
  position: relative;
  height: 11px;
  border-radius: 6px;
  background: var(--board-chip-bg);
  overflow: visible;
}
.vote-bar-fill {
  height: 100%;
  border-radius: 6px;
  width: 0;                  /* animated from 0 → final width */
  transition: width .6s ease;
}
/* Default fill color for standing candidates */
.vote-bar-fill { background: #bfe0b7; }
/* Winner fill */
.vote-breakdown-candidate.is-winner .vote-bar-fill { background: var(--green); }
/* Eliminated fill */
.vote-breakdown-candidate.is-eliminated .vote-bar-fill { background: var(--board-ink-faint); }

/* Majority marker — vertical tick */
.vote-breakdown-majority {
  position: absolute;
  top: -3px; bottom: -3px;
  width: 2px;
  background: var(--board-ink-faint);
  /* left is set inline: (majority / active * 100)% */
}
```

**Bar animation (JS):**
Set `fill.style.width = '0'` on insert, then after one frame: `fill.style.width = pct + '%'`. Current `vote.js` already does this with `setTimeout(..., 30)` — keep that pattern.

**Final-round note:**
```css
.vote-breakdown-winner-note {
  margin: 13px 0 0;
  color: #bfe0b7;
  font-size: .85rem;
  font-weight: 700;
}
```

### Next Round Notice — `.vote-next-round` (redesigned)
```css
.vote-next-round {
  margin-top: 40px;
  border: 1px solid var(--board-card-border);
  background: var(--board-panel-bg);
  border-radius: 16px;
  padding: 24px 26px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: center;
}
.vote-next-round-eyebrow {
  display: block;
  color: var(--green);
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.vote-next-round h3 {
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 1.7rem;
  color: var(--board-ink);
  margin: 0 0 4px;
}
.vote-next-round p {
  color: var(--board-ink-soft);
  font-size: .9rem;
  margin: 0;
}
/* Countdown chip (right side) */
.vote-next-round-countdown {
  text-align: center;
  padding: 14px 22px;
  border-radius: 14px;
  background: var(--board-chip-bg);
}
.vote-next-round-countdown strong {
  display: block;
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  font-size: 2.6rem;
  line-height: 1;
  color: var(--board-ink);
}
.vote-next-round-countdown span {
  color: var(--board-ink-faint);
  font-size: .76rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
}
```

---

## Responsive Breakpoints

| Breakpoint | Change |
|---|---|
| `≤ 860px` | Voting: single-column (ballot below slate, sticky drops). Suggesting: 2-col card grid → 1-col. Winner block: single column. |
| `≤ 560px` | Vote cards: 1-col. Ballot panel: no sticky. Manual form: 2-col fields stack 1-col. |

---

## JS Changes in `vote.js`

### Suggesting phase (`renderSuggesting`)
1. Keep a collapsible disclosure, but swap the old `.vote-disclosure` button for a `.vote-board-disclosure` (`<details>`) wrapping the suggest panel; **do not set `open`** (closed by default).
2. Replace `panel.appendChild(suggestionGuidelines())` with the chips row inside the disclosure body.
3. Replace the `showChoice()` Steam/manual yes-no question with the tab control:
   - Render both form bodies once; add a `data-path` attribute to the form container and update it on tab click.
   - Show/hide Steam and manual form bodies via CSS on that attribute (no re-render).
4. Render the your-suggestions owner panel as a second `.vote-board-disclosure` (closed by default), only when `mySuggestions.length`. See *§1b* for the in-place re-render rule.
5. `.vote-list-header` + grid render below the panels (no longer nested inside any toggle). The grid renders for non-members too.

### Voting phase (`renderVoting`)
1. Wrap slate grid + ballot panel in `.vote-voting-layout` grid.
2. `participationText()` output renders in `.vote-participation-line` (outside grid, above it).
3. Ballot panel uses the new classes above instead of `.vote-panel`.
4. The sticky vote panel does **not** apply at ≤ 860px.
5. The owner panel (`ownerVisibilitySlot()`) renders as a `.vote-board-disclosure` (closed by default) **below** the `.vote-voting-layout` grid, so it never pushes the ballot down. Pitch editing is off here; only name-visibility toggles show.
6. Non-members / logged-out: keep the existing read-only path — render `card(s, 'list')` cards, no ballot panel.

### Revealed phase (`renderRevealed`)
1. Replace existing winner card (`card(winner, 'result', ...)`) with `.vote-winner-block` markup.
2. Keep `rcvBreakdown()` function; update its returned DOM to use the new CSS classes.
3. Replace `.vote-next-round` existing aside with the redesigned 2-column chip layout.
4. The owner panel renders as a `.vote-board-disclosure` (closed by default) below the breakdown and above the next-round notice, matching the current order.

---

## Existing features to preserve

The prototype omits these; the redesign must not drop them.

- **Auth / identity.** Login button, logged-in identity, logout, and the non-member warning all live in `.vote-auth` inside the green hero (`layout.heroActions`). Unchanged by this redesign.
- **Non-member & logged-out read-only view.** `canParticipate()` gates the suggest and vote controls. Non-members and logged-out visitors still see the suggestion grid / slate as read-only `card(s, 'list')` cards, with no collapsible panels and no ballot.
- **Pitch editing.** While suggesting is open (`pitchEditable === true`), each owned suggestion in the your-suggestions panel has a pitch editor; outside that phase only the name-visibility toggle shows. Driven by existing `buildPitchEditor()`.
- **In-place sync helpers.** `syncSuggestionBylines()` and `syncSuggestionPitch()` update visible cards after an owner edit without a full reload — keep them working against the new card markup (they target `[data-suggestion-card-id]` and `.suggestion-by` / `.suggestion-pitch`, which the new cards retain).

---

## New i18n strings (`STRINGS.da` / `STRINGS.en`)

Most copy already exists. New keys the redesign introduces:

| Key | DA | EN |
|---|---|---|
| `pathSteam` | På Steam | On Steam |
| `pathManual` | Ikke på Steam | Not on Steam |
| `chipPc` | Spilbart på PC | Playable on PC |
| `chipLength` | ~10t eller mindre | ~10 hrs or less |
| `ballotIrvNote` | Vinderen findes med ranglisteafstemning (instant-runoff). | The winner is decided by ranked-choice voting (instant-runoff). |
| `winnerTallySuffix` | stemmer i sidste runde | votes in the final round |

Reuse existing keys where possible: `formTitle` (suggest panel heading), `managePitchTitle` / `manageNamesTitle` + `managePitchHint` / `manageNamesHint` (owner panel), `winnerReveal` ("Vinderen er"), `winnerTag` (winner pill), the `guidelines*` keys (chip "check upcoming & previous" links). The winner-block CTA row ("View on Steam" / "Add to calendar") is **optional** — only add it if those links are available in the round data; otherwise omit the `.vote-winner-actions` row.

---

## Assets

| Asset | Source | Notes |
|---|---|---|
| `img/logo.webp` | Existing project | Green wordmark; no change |
| `img/logo.png` | Existing project | PNG fallback |
| Game cover images | `s.image` field from `/api/round/current` response | Steam capsule art, 460×215. Used as `background-image` on `.suggestion-cover-art`. The prototype uses CSS gradient placeholders. |

---

## Files in This Package

| File | Purpose |
|---|---|
| `README.md` | This document |
| `Vote Board.dc.html` | High-fidelity interactive prototype. Open in a browser. Use the bottom pill (Stil A · Mørk / Fase: Foreslå, Stem, Resultat) to explore all 6 states. |

---

## Implementation Order

Suggested order to minimise risk of breaking the live page:

1. Add new CSS tokens to `:root` in `style.css` (and migrate the existing hardcoded `rgba(247,244,238,…)` board literals onto them while you're there).
2. Add the new CSS classes, including `.vote-board-disclosure` (non-breaking — existing class names unchanged).
3. Add the new `STRINGS` keys listed above to both `da` and `en`.
4. Update `renderSuggesting()` — collapsible suggest disclosure + tab control, collapsible owner panel.
5. Update `renderVoting()` — two-column layout + ballot panel, owner disclosure below the grid.
6. Update `renderRevealed()` — winner block + IRV breakdown classes, owner disclosure.
7. Bump the `css/style.css?v=N` query string on `vote.html` and `en/vote.html`.
8. QA all three phases in both languages (DA/EN), as a member, non-member, and logged-out, with both Steam and manual (no-image) suggestions present.
