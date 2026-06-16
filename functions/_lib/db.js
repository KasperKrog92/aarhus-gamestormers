// D1 query helpers + card shaping. `db` is the D1 binding (env.DB).
let descriptionColumnsChecked = false;

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

// The "current" round is simply the most recently opened one (highest id).
export function getCurrentRound(db) {
  return db.prepare('SELECT * FROM rounds ORDER BY id DESC LIMIT 1').first();
}

export function getRoundById(db, id) {
  return db.prepare('SELECT * FROM rounds WHERE id = ?').bind(id).first();
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
