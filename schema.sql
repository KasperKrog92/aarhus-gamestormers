-- ============================================================================
-- Aarhus Gamestormers — game suggestion & approval-voting system
-- Cloudflare D1 (SQLite) schema. Apply with:
--   wrangler d1 execute gamestormers --file=./schema.sql            (local)
--   wrangler d1 execute gamestormers --remote --file=./schema.sql   (production)
-- ============================================================================

-- A voting round maps 1:1 to an upcoming meeting (id = meeting number).
-- Exactly one round is "current": the one with the highest id. The admin opens
-- a new round to advance the cycle; phases move suggesting -> voting -> revealed.
CREATE TABLE IF NOT EXISTS rounds (
  id                   INTEGER PRIMARY KEY,            -- = meeting number (e.g. 19)
  title                TEXT,                           -- optional human label
  meeting_date         TEXT,                           -- YYYY-MM-DD meeting date
  storm_code           TEXT NOT NULL,                  -- soft Discord gate, e.g. "storm19"
  phase                TEXT NOT NULL DEFAULT 'suggesting'
                         CHECK (phase IN ('suggesting','voting','revealed','closed')),
  suggestions_open_months_before REAL NOT NULL DEFAULT 2.5, -- shown publicly, editable in admin
  voting_closes_months_before    REAL NOT NULL DEFAULT 2,   -- shown publicly, editable in admin
  suggestions_open_at  TEXT,                           -- YYYY-MM-DD, defaults to meeting_date - 2.5 months
  voting_closes_at     TEXT,                           -- YYYY-MM-DD, defaults to meeting_date - 2 months
  winner_suggestion_id INTEGER,                        -- set when phase = revealed/closed
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One suggested game. New suggestions land as 'pending' for maintainer curation.
CREATE TABLE IF NOT EXISTS suggestions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id       INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  steam_appid    TEXT,                                 -- nullable: non-Steam games allowed
  title          TEXT NOT NULL,
  header_image   TEXT,                                 -- Steam header.jpg URL (or custom)
  store_url      TEXT,                                 -- Steam store page
  gog_url        TEXT,                                 -- optional, added during curation
  genres         TEXT,                                 -- comma-separated, e.g. "Puzzle, Horror"
  price          TEXT,                                 -- formatted, e.g. "23,19€" (display only)
  platforms      TEXT,                                 -- comma-separated, e.g. "Windows, macOS"
  playtime_hours INTEGER,                              -- manual (HowLongToBeat has no API)
  description_da TEXT,                                 -- Steam short_description, Danish/fallback
  description_en TEXT,                                 -- Steam short_description, English
  pitch          TEXT,                                 -- the suggester's short pitch
  suggested_by   TEXT,                                 -- display name / Discord handle
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Approval voting: one row per game a ballot ticks. A "ballot" is a single
-- submission; ballot_id is a random server token echoed to the client and kept
-- in localStorage purely for "you already voted" UX (NOT enforced server-side —
-- no IP, no cookie). voter_name is an OPTIONAL self-reported handle so the admin
-- can see "who voted for what" and spot/remove funky ballots; it is never
-- required and is not PII the server collects on its own.
-- Tally for a round = COUNT(*) GROUP BY suggestion_id.
CREATE TABLE IF NOT EXISTS votes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id      INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  suggestion_id INTEGER NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  ballot_id     TEXT NOT NULL,
  voter_name    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_suggestions_round ON suggestions(round_id, status);
CREATE INDEX IF NOT EXISTS idx_votes_round       ON votes(round_id, suggestion_id);
CREATE INDEX IF NOT EXISTS idx_votes_ballot      ON votes(round_id, ballot_id);
