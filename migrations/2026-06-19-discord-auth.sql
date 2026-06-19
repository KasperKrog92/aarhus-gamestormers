-- Add minimal Discord OAuth login persistence for suggestion/vote integrity.
-- One-time migration for databases created before Discord auth was added.

CREATE TABLE IF NOT EXISTS discord_users (
  discord_id                 TEXT PRIMARY KEY,
  username                   TEXT,
  avatar                     TEXT,
  is_gamestormers_member     INTEGER NOT NULL DEFAULT 0,
  last_guild_check_at        TEXT,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash      TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL REFERENCES discord_users(discord_id) ON DELETE CASCADE,
  expires_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at    TEXT
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash    TEXT PRIMARY KEY,
  redirect_path TEXT NOT NULL DEFAULT '/vote',
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE suggestions ADD COLUMN discord_user_id TEXT REFERENCES discord_users(discord_id) ON DELETE SET NULL;
ALTER TABLE votes ADD COLUMN discord_user_id TEXT REFERENCES discord_users(discord_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_suggestions_discord_user ON suggestions(round_id, discord_user_id);
CREATE INDEX IF NOT EXISTS idx_votes_discord_user ON votes(round_id, discord_user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(discord_user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);
