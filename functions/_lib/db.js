// D1 query helpers + card shaping. `db` is the D1 binding (env.DB).
let descriptionColumnsChecked = false;
let roundScheduleColumnsChecked = false;
let meetingContentTablesChecked = false;

async function columnExists(db, table, column) {
  const { results } = await db.prepare('PRAGMA table_info(' + table + ')').all();
  return (results || []).some((row) => row.name === column);
}

async function addColumnIfMissing(db, table, column, definition) {
  if (await columnExists(db, table, column)) return;
  try {
    await db.prepare('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition).run();
  } catch (err) {
    if (!String(err && err.message).toLowerCase().includes('duplicate column')) throw err;
  }
}

export async function ensureSuggestionDescriptionColumns(db) {
  if (descriptionColumnsChecked) return;
  await addColumnIfMissing(db, 'suggestions', 'description_da', 'TEXT');
  await addColumnIfMissing(db, 'suggestions', 'description_en', 'TEXT');
  descriptionColumnsChecked = true;
}

export async function ensureRoundScheduleColumns(db) {
  if (roundScheduleColumnsChecked) return;
  await addColumnIfMissing(db, 'rounds', 'meeting_date', 'TEXT');
  await addColumnIfMissing(db, 'rounds', 'suggestions_open_months_before', 'REAL DEFAULT 2.8');
  await addColumnIfMissing(db, 'rounds', 'voting_opens_months_before', 'REAL DEFAULT 2.5');
  await addColumnIfMissing(db, 'rounds', 'voting_closes_months_before', 'REAL DEFAULT 2.2');
  await addColumnIfMissing(db, 'rounds', 'suggestions_open_at', 'TEXT');
  await addColumnIfMissing(db, 'rounds', 'voting_opens_at', 'TEXT');
  roundScheduleColumnsChecked = true;
}

export async function ensureMeetingContentTables(db) {
  if (meetingContentTablesChecked) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS meetings (
        id                     INTEGER PRIMARY KEY,
        meeting_date           TEXT NOT NULL,
        starts_at_utc          TEXT NOT NULL,
        ends_at_utc            TEXT NOT NULL,
        timezone               TEXT NOT NULL DEFAULT 'Europe/Copenhagen',
        venue_name             TEXT NOT NULL,
        venue_address          TEXT,
        discord_invite         TEXT,
        status                 TEXT NOT NULL DEFAULT 'planned'
                                 CHECK (status IN ('planned','suggesting','voting','revealed','completed','cancelled')),
        selected_suggestion_id INTEGER REFERENCES suggestions(id) ON DELETE SET NULL,
        selected_game_id       INTEGER,
        created_at             TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS games (
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
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS meeting_copy (
        meeting_id          INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        lang                TEXT NOT NULL CHECK (lang IN ('da','en')),
        event_description   TEXT,
        history_description TEXT,
        PRIMARY KEY (meeting_id, lang)
      )`
    )
    .run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(starts_at_utc, ends_at_utc)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status)').run();
  meetingContentTablesChecked = true;
}

// The "current" round is simply the most recently opened one (highest id).
export function getCurrentRound(db) {
  return db.prepare('SELECT * FROM rounds ORDER BY id DESC LIMIT 1').first();
}

export function getRoundById(db, id) {
  return db.prepare('SELECT * FROM rounds WHERE id = ?').bind(id).first();
}

// The next round after `afterId` (smallest id strictly greater). Used to point
// people from a revealed/closed round toward the next one when it exists.
export function getNextRound(db, afterId) {
  return db.prepare('SELECT * FROM rounds WHERE id > ? ORDER BY id ASC LIMIT 1').bind(Number(afterId)).first();
}

// Public-safe metadata for the "next round" notice. Never exposes the storm code.
export function toNextRoundNotice(round) {
  if (!round) return null;
  return {
    id: round.id,
    title: round.title || null,
    meetingDate: round.meeting_date || null,
    suggestionsOpenAt: round.suggestions_open_at || null,
    votingOpensAt: round.voting_opens_at || null,
    votingClosesAt: round.voting_closes_at || null,
  };
}

export async function getSuggestions(db, roundId, { approvedOnly = false } = {}) {
  const sql = approvedOnly
    ? "SELECT * FROM suggestions WHERE round_id = ? AND status = 'approved' ORDER BY created_at ASC, id ASC"
    : 'SELECT * FROM suggestions WHERE round_id = ? ORDER BY created_at ASC, id ASC';
  const { results } = await db.prepare(sql).bind(roundId).all();
  return results || [];
}

export function getSuggestionById(db, id) {
  return db.prepare('SELECT * FROM suggestions WHERE id = ?').bind(id).first();
}

export async function getMeetingById(db, id) {
  await ensureMeetingContentTables(db);
  return db.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first();
}

export async function upsertMeeting(db, meeting) {
  await ensureMeetingContentTables(db);
  const result = await db
    .prepare(
      `INSERT INTO meetings
         (id, meeting_date, starts_at_utc, ends_at_utc, timezone, venue_name, venue_address, discord_invite, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         meeting_date = excluded.meeting_date,
         starts_at_utc = excluded.starts_at_utc,
         ends_at_utc = excluded.ends_at_utc,
         timezone = excluded.timezone,
         venue_name = excluded.venue_name,
         venue_address = excluded.venue_address,
         discord_invite = excluded.discord_invite,
         status = excluded.status,
         updated_at = datetime('now')`
    )
    .bind(
      Number(meeting.id),
      meeting.meetingDate,
      meeting.startsAtUtc,
      meeting.endsAtUtc,
      meeting.timezone || 'Europe/Copenhagen',
      meeting.venueName,
      meeting.venueAddress || null,
      meeting.discordInvite || null,
      meeting.status || 'planned'
    )
    .run();
  return result;
}

export async function upsertGame(db, game) {
  await ensureMeetingContentTables(db);
  const id = game.id == null || game.id === '' ? null : Number(game.id);
  const statement = id
    ? db
        .prepare(
          `INSERT INTO games
             (id, steam_appid, title, header_image, store_url, gog_url, gog_id, genres, platforms, price, playtime_hours, hltb_url, description_da, description_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             steam_appid = excluded.steam_appid,
             title = excluded.title,
             header_image = excluded.header_image,
             store_url = excluded.store_url,
             gog_url = excluded.gog_url,
             gog_id = excluded.gog_id,
             genres = excluded.genres,
             platforms = excluded.platforms,
             price = excluded.price,
             playtime_hours = excluded.playtime_hours,
             hltb_url = excluded.hltb_url,
             description_da = excluded.description_da,
             description_en = excluded.description_en,
             updated_at = datetime('now')`
        )
        .bind(
          id,
          game.steamAppId || null,
          game.title,
          game.image || null,
          game.storeUrl || null,
          game.gogUrl || null,
          game.gogId || null,
          Array.isArray(game.genres) ? game.genres.join(', ') : game.genres || null,
          Array.isArray(game.platforms) ? game.platforms.join(', ') : game.platforms || null,
          game.price || null,
          game.playtimeHours == null || game.playtimeHours === '' ? null : Number(game.playtimeHours),
          game.hltbUrl || null,
          game.descriptionDa || null,
          game.descriptionEn || null
        )
    : db
        .prepare(
          `INSERT INTO games
             (steam_appid, title, header_image, store_url, gog_url, gog_id, genres, platforms, price, playtime_hours, hltb_url, description_da, description_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          game.steamAppId || null,
          game.title,
          game.image || null,
          game.storeUrl || null,
          game.gogUrl || null,
          game.gogId || null,
          Array.isArray(game.genres) ? game.genres.join(', ') : game.genres || null,
          Array.isArray(game.platforms) ? game.platforms.join(', ') : game.platforms || null,
          game.price || null,
          game.playtimeHours == null || game.playtimeHours === '' ? null : Number(game.playtimeHours),
          game.hltbUrl || null,
          game.descriptionDa || null,
          game.descriptionEn || null
        );
  const result = await statement.run();
  return id || (result.meta && result.meta.last_row_id) || null;
}

export async function getGameById(db, id) {
  await ensureMeetingContentTables(db);
  if (id == null || id === '') return null;
  return db.prepare('SELECT * FROM games WHERE id = ?').bind(Number(id)).first();
}

// camelCase game input (the shape upsertGame expects) from a suggestion row.
// gog_id and hltb_url have no suggestion source, so they start empty and are
// filled in later through admin edits.
export function gameInputFromSuggestion(s) {
  return {
    steamAppId: s.steam_appid || null,
    title: s.title,
    image: s.header_image || null,
    storeUrl: s.store_url || null,
    gogUrl: s.gog_url || null,
    gogId: null,
    genres: s.genres || null,
    platforms: s.platforms || null,
    price: s.price || null,
    playtimeHours: s.playtime_hours != null ? s.playtime_hours : null,
    hltbUrl: null,
    descriptionDa: s.description_da || null,
    descriptionEn: s.description_en || null,
  };
}

// camelCase game input from an existing games row, for partial admin edits:
// load, merge the changed fields, then upsert the whole row back.
export function gameRowToInput(row) {
  return {
    id: row.id,
    steamAppId: row.steam_appid || null,
    title: row.title,
    image: row.header_image || null,
    storeUrl: row.store_url || null,
    gogUrl: row.gog_url || null,
    gogId: row.gog_id || null,
    genres: row.genres || null,
    platforms: row.platforms || null,
    price: row.price || null,
    playtimeHours: row.playtime_hours != null ? row.playtime_hours : null,
    hltbUrl: row.hltb_url || null,
    descriptionDa: row.description_da || null,
    descriptionEn: row.description_en || null,
  };
}

export async function attachGameToMeeting(db, meetingId, gameId, suggestionId = null) {
  await ensureMeetingContentTables(db);
  await db
    .prepare(
      `UPDATE meetings
          SET selected_game_id = ?,
              selected_suggestion_id = ?,
              updated_at = datetime('now')
        WHERE id = ?`
    )
    .bind(Number(gameId), suggestionId == null ? null : Number(suggestionId), Number(meetingId))
    .run();
}

export async function getMeetingCopy(db, meetingId) {
  await ensureMeetingContentTables(db);
  const { results } = await db
    .prepare('SELECT lang, event_description, history_description FROM meeting_copy WHERE meeting_id = ?')
    .bind(Number(meetingId))
    .all();
  const copy = {
    da: { eventDescription: '', historyDescription: '' },
    en: { eventDescription: '', historyDescription: '' },
  };
  for (const row of results || []) {
    if (row.lang === 'da' || row.lang === 'en') {
      copy[row.lang] = {
        eventDescription: row.event_description || '',
        historyDescription: row.history_description || '',
      };
    }
  }
  return copy;
}

export async function setMeetingStatus(db, meetingId, status) {
  await ensureMeetingContentTables(db);
  await db
    .prepare("UPDATE meetings SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(status, Number(meetingId))
    .run();
}

export async function upsertMeetingCopy(db, meetingId, lang, copy) {
  await ensureMeetingContentTables(db);
  await db
    .prepare(
      `INSERT INTO meeting_copy (meeting_id, lang, event_description, history_description)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(meeting_id, lang) DO UPDATE SET
         event_description = excluded.event_description,
         history_description = excluded.history_description`
    )
    .bind(Number(meetingId), lang, copy.eventDescription || null, copy.historyDescription || null)
    .run();
}

// { [suggestionId]: voteCount } for a round.
export async function getTallies(db, roundId) {
  const { results } = await db
    .prepare('SELECT suggestion_id, COUNT(*) AS votes FROM votes WHERE round_id = ? GROUP BY suggestion_id')
    .bind(roundId)
    .all();
  const map = {};
  for (const row of results || []) map[row.suggestion_id] = row.votes;
  return map;
}

// One entry per ballot (admin-only): who voted for what and when.
export async function getBallots(db, roundId) {
  const { results } = await db
    .prepare(
      `SELECT ballot_id, voter_name, MIN(created_at) AS created_at, GROUP_CONCAT(suggestion_id) AS suggestion_ids
         FROM votes WHERE round_id = ? GROUP BY ballot_id, voter_name ORDER BY created_at ASC`
    )
    .bind(roundId)
    .all();
  return (results || []).map((r) => ({
    ballotId: r.ballot_id,
    voterName: r.voter_name || null,
    createdAt: r.created_at,
    suggestionIds: (r.suggestion_ids || '').split(',').map(Number).filter(Number.isInteger),
  }));
}

function splitList(value) {
  return (value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function publicGame(row) {
  if (!row.game_id) return null;
  return {
    id: row.game_id,
    steamAppId: row.steam_appid || null,
    title: row.game_title,
    image: row.header_image || null,
    storeUrl: row.store_url || null,
    gogUrl: row.gog_url || null,
    gogId: row.gog_id || null,
    genres: splitList(row.genres),
    platforms: splitList(row.platforms),
    price: row.price || null,
    playtimeHours: row.playtime_hours != null ? Number(row.playtime_hours) : null,
    hltbUrl: row.hltb_url || null,
    descriptionDa: row.description_da || null,
    descriptionEn: row.description_en || null,
  };
}

export function toPublicMeeting(row) {
  return {
    id: row.id,
    meetingDate: row.meeting_date,
    startsAtUtc: row.starts_at_utc,
    endsAtUtc: row.ends_at_utc,
    timezone: row.timezone,
    venue: {
      name: row.venue_name,
      address: row.venue_address || null,
    },
    discordInvite: row.discord_invite || null,
    status: row.status,
    game: publicGame(row),
    copy: {
      da: {
        eventDescription: row.event_description_da || null,
        historyDescription: row.history_description_da || null,
      },
      en: {
        eventDescription: row.event_description_en || null,
        historyDescription: row.history_description_en || null,
      },
    },
    calendar: {
      uid: `gamestormers-${row.id}@gamestormers.dk`,
      filename: `gamestormers-${row.id}.ics`,
    },
  };
}

export async function getPublicMeetings(db, now = new Date()) {
  await ensureMeetingContentTables(db);
  const { results } = await db
    .prepare(
      `SELECT
         m.id,
         m.meeting_date,
         m.starts_at_utc,
         m.ends_at_utc,
         m.timezone,
         m.venue_name,
         m.venue_address,
         m.discord_invite,
         m.status,
         m.selected_suggestion_id,
         g.id AS game_id,
         g.steam_appid,
         g.title AS game_title,
         g.header_image,
         g.store_url,
         g.gog_url,
         g.gog_id,
         g.genres,
         g.platforms,
         g.price,
         g.playtime_hours,
         g.hltb_url,
         g.description_da,
         g.description_en,
         da.event_description AS event_description_da,
         da.history_description AS history_description_da,
         en.event_description AS event_description_en,
         en.history_description AS history_description_en
       FROM meetings m
       LEFT JOIN games g ON g.id = m.selected_game_id
       LEFT JOIN meeting_copy da ON da.meeting_id = m.id AND da.lang = 'da'
       LEFT JOIN meeting_copy en ON en.meeting_id = m.id AND en.lang = 'en'
       WHERE m.status != 'cancelled'
       ORDER BY m.starts_at_utc ASC, m.id ASC`
    )
    .all();

  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const upcoming = [];
  const history = [];
  const planned = [];

  for (const row of results || []) {
    const meeting = toPublicMeeting(row);
    const endTime = new Date(meeting.endsAtUtc).getTime();
    if (meeting.game && Number.isFinite(endTime) && endTime <= nowTime) {
      history.push(meeting);
    } else if (meeting.game) {
      upcoming.push(meeting);
    } else if (!Number.isFinite(endTime) || endTime > nowTime) {
      planned.push({
        id: meeting.id,
        meetingDate: meeting.meetingDate,
        startsAtUtc: meeting.startsAtUtc,
        endsAtUtc: meeting.endsAtUtc,
        timezone: meeting.timezone,
        venue: meeting.venue,
        discordInvite: meeting.discordInvite,
        status: meeting.status,
      });
    }
  }

  history.sort((a, b) => b.id - a.id);

  return { upcoming, history, planned };
}

// Public-safe shape of a suggestion (no internal status/timestamps).
// Pass votes only when the round is revealed.
export function toCard(s, votes) {
  return {
    id: s.id,
    title: s.title,
    steamAppId: s.steam_appid || null,
    image: s.header_image || null,
    storeUrl: s.store_url || null,
    gogUrl: s.gog_url || null,
    genres: splitList(s.genres),
    platforms: splitList(s.platforms),
    price: s.price || null,
    playtimeHours: s.playtime_hours != null ? Number(s.playtime_hours) : null,
    descriptionDa: s.description_da || null,
    descriptionEn: s.description_en || null,
    pitch: s.pitch || null,
    suggestedBy: s.suggested_by || null,
    ...(votes != null ? { votes } : {}),
  };
}
