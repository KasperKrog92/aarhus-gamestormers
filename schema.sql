-- ============================================================================
-- Aarhus Gamestormers — game suggestion & approval-voting system
-- Cloudflare D1 (SQLite) schema. Apply with:
--   wrangler d1 execute gamestormers --file=./schema.sql            (local)
--   wrangler d1 execute gamestormers --remote --file=./schema.sql   (production)
-- ============================================================================

-- A voting round maps 1:1 to an upcoming meeting (id = meeting number).
-- The "current" round (getCurrentRound) is the earliest round (lowest id) that
-- is not yet closed, so a pre-created pipeline of future rounds rolls forward on
-- its own. Phases move suggesting -> voting -> revealed -> closed; a revealed
-- round closes automatically at the halfway point before the next round's
-- suggestions open (see docs/voting-system.md).
CREATE TABLE IF NOT EXISTS rounds (
  id                   INTEGER PRIMARY KEY,            -- = meeting number (e.g. 19)
  title                TEXT,                           -- optional human label
  meeting_date         TEXT,                           -- YYYY-MM-DD meeting date
  storm_code           TEXT NOT NULL,                  -- soft Discord gate, e.g. "storm19"
  phase                TEXT NOT NULL DEFAULT 'suggesting'
                         CHECK (phase IN ('suggesting','voting','revealed','closed')),
  suggestions_open_months_before REAL NOT NULL DEFAULT 2.8, -- shown publicly, editable in admin
  voting_opens_months_before     REAL NOT NULL DEFAULT 2.5, -- shown publicly, editable in admin
  voting_closes_months_before    REAL NOT NULL DEFAULT 2.2, -- shown publicly, editable in admin
  suggestions_open_at  TEXT,                           -- YYYY-MM-DD, defaults to meeting_date - 2.8 months
  voting_opens_at      TEXT,                           -- YYYY-MM-DD, defaults to meeting_date - 2.5 months
  voting_closes_at     TEXT,                           -- YYYY-MM-DD, defaults to meeting_date - 2.2 months
  winner_suggestion_id INTEGER,                        -- set when phase = revealed/closed
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Public meeting records are the source of truth for homepage event/history
-- content. The id matches the meeting number and should match rounds.id when
-- voting exists for the same meeting.
CREATE TABLE IF NOT EXISTS meetings (
  id                     INTEGER PRIMARY KEY,
  meeting_date           TEXT NOT NULL,
  starts_at_utc          TEXT NOT NULL,
  ends_at_utc            TEXT NOT NULL,
  timezone               TEXT NOT NULL DEFAULT 'Europe/Copenhagen',
  venue_name             TEXT NOT NULL,
  venue_address          TEXT,
  discord_invite         TEXT,
  discord_event_url      TEXT,
  status                 TEXT NOT NULL DEFAULT 'planned'
                           CHECK (status IN ('planned','suggesting','voting','revealed','completed','cancelled')),
  selected_suggestion_id INTEGER REFERENCES suggestions(id) ON DELETE SET NULL,
  selected_game_id       INTEGER,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reusable selected-game metadata for public event and history cards.
CREATE TABLE IF NOT EXISTS games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  steam_appid     TEXT,
  title           TEXT NOT NULL,
  header_image    TEXT,
  store_url       TEXT,
  gog_url         TEXT,
  gog_id          TEXT,
  genres          TEXT,
  platforms       TEXT,
  price           TEXT,
  playtime_hours  INTEGER,
  hltb_url        TEXT,
  description_da  TEXT,
  description_en  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meeting_copy (
  meeting_id          INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  lang                TEXT NOT NULL CHECK (lang IN ('da','en')),
  event_description   TEXT,
  history_description TEXT,
  PRIMARY KEY (meeting_id, lang)
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
  hltb_url       TEXT,                                 -- manual HowLongToBeat URL
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

-- One row per automated phase action taken on a round. The UNIQUE (round_id,
-- event_type) constraint makes the scheduler idempotent: a rerun or manual
-- workflow dispatch that tries to record an already-handled event hits the
-- constraint instead of duplicating a Discord post or handoff.
-- Known event_type values: suggestions_opened, voting_opened, winner_revealed,
-- winner_setup_needed_alerted, winner_announcement_posted, handoff_generated.
CREATE TABLE IF NOT EXISTS automation_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id     INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  payload_json TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (round_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_suggestions_round ON suggestions(round_id, status);
CREATE INDEX IF NOT EXISTS idx_votes_round       ON votes(round_id, suggestion_id);
CREATE INDEX IF NOT EXISTS idx_votes_ballot      ON votes(round_id, ballot_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date     ON meetings(starts_at_utc, ends_at_utc);
CREATE INDEX IF NOT EXISTS idx_meetings_status   ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_automation_events_round ON automation_events(round_id, event_type);
