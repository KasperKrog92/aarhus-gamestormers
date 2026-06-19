import { clean } from './http.js';

const SESSION_COOKIE = 'gs_session';
const OAUTH_STATE_COOKIE = 'gs_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_STATE_TTL_SECONDS = 60 * 10;
const DEFAULT_DISCORD_INVITE = 'https://discord.gg/N2h6DJxVDF';

let authTablesChecked = false;

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

export async function ensureAuthTables(db) {
  if (authTablesChecked) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS discord_users (
        discord_id                 TEXT PRIMARY KEY,
        username                   TEXT,
        avatar                     TEXT,
        is_gamestormers_member     INTEGER NOT NULL DEFAULT 0,
        last_guild_check_at        TEXT,
        created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash      TEXT PRIMARY KEY,
        discord_user_id TEXT NOT NULL REFERENCES discord_users(discord_id) ON DELETE CASCADE,
        expires_at      TEXT NOT NULL,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen_at    TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS oauth_states (
        state_hash    TEXT PRIMARY KEY,
        redirect_path TEXT NOT NULL DEFAULT '/vote',
        expires_at    TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
  await addColumnIfMissing(db, 'suggestions', 'discord_user_id', 'TEXT REFERENCES discord_users(discord_id) ON DELETE SET NULL');
  await addColumnIfMissing(db, 'votes', 'discord_user_id', 'TEXT REFERENCES discord_users(discord_id) ON DELETE SET NULL');
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(discord_user_id, expires_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_suggestions_discord_user ON suggestions(round_id, discord_user_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_votes_discord_user ON votes(round_id, discord_user_id)').run();
  authTablesChecked = true;
}

function bytesToBase64Url(bytes) {
  let raw = '';
  bytes.forEach((byte) => {
    raw += String.fromCharCode(byte);
  });
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function tokenHash(token, secret) {
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, enc.encode(String(token || '')));
  return bytesToHex(signed);
}

export function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const name = part.slice(0, index).trim();
    if (!name) return;
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      cookies[name] = part.slice(index + 1).trim();
    }
  });
  return cookies;
}

function isSecureRequest(request) {
  const url = new URL(request.url);
  return url.protocol === 'https:' && !['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname);
}

export function cookieHeader(name, value, request, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value || '')}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.maxAge != null) parts.push(`Max-Age=${Number(options.maxAge)}`);
  if (isSecureRequest(request)) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookieHeader(name, request) {
  return cookieHeader(name, '', request, { maxAge: 0 });
}

export function sessionCookie(token, request) {
  return cookieHeader(SESSION_COOKIE, token, request, { maxAge: SESSION_TTL_SECONDS });
}

export function oauthStateCookie(token, request) {
  return cookieHeader(OAUTH_STATE_COOKIE, token, request, { maxAge: OAUTH_STATE_TTL_SECONDS });
}

export function clearSessionCookie(request) {
  return clearCookieHeader(SESSION_COOKIE, request);
}

export function clearOAuthStateCookie(request) {
  return clearCookieHeader(OAUTH_STATE_COOKIE, request);
}

export function safeRedirectPath(value, fallback = '/vote') {
  const path = clean(value, 500);
  if (!path || !path.startsWith('/') || path.startsWith('//')) return fallback;
  return path;
}

export function discordInvite(env) {
  return clean(env.DISCORD_INVITE_URL, 300) || DEFAULT_DISCORD_INVITE;
}

function nowIso() {
  return new Date().toISOString();
}

function futureIso(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function storeOAuthState(db, token, redirectPath, env) {
  const hash = await tokenHash(token, env.SESSION_SECRET);
  await db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(nowIso()).run();
  await db
    .prepare('INSERT INTO oauth_states (state_hash, redirect_path, expires_at) VALUES (?, ?, ?)')
    .bind(hash, safeRedirectPath(redirectPath), futureIso(OAUTH_STATE_TTL_SECONDS))
    .run();
  return hash;
}

export async function consumeOAuthState(db, token, env) {
  const hash = await tokenHash(token, env.SESSION_SECRET);
  const row = await db
    .prepare('SELECT state_hash, redirect_path, expires_at FROM oauth_states WHERE state_hash = ? LIMIT 1')
    .bind(hash)
    .first();
  await db.prepare('DELETE FROM oauth_states WHERE state_hash = ? OR expires_at <= ?').bind(hash, nowIso()).run();
  if (!row || String(row.expires_at || '') <= nowIso()) return null;
  return { redirectPath: safeRedirectPath(row.redirect_path) };
}

export async function upsertDiscordUser(db, user, isMember) {
  const discordId = clean(user && user.id, 80);
  if (!discordId) throw new Error('Discord user id missing');
  await db
    .prepare(
      `INSERT INTO discord_users
         (discord_id, username, avatar, is_gamestormers_member, last_guild_check_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET
         username = excluded.username,
         avatar = excluded.avatar,
         is_gamestormers_member = excluded.is_gamestormers_member,
         last_guild_check_at = excluded.last_guild_check_at,
         updated_at = excluded.updated_at`
    )
    .bind(
      discordId,
      clean((user && (user.global_name || user.username)) || '', 120) || null,
      clean(user && user.avatar, 120) || null,
      isMember ? 1 : 0,
      nowIso(),
      nowIso()
    )
    .run();
  return discordId;
}

export async function createSession(db, discordUserId, env) {
  const token = randomToken();
  const hash = await tokenHash(token, env.SESSION_SECRET);
  await db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(nowIso()).run();
  await db
    .prepare('INSERT INTO auth_sessions (token_hash, discord_user_id, expires_at, last_seen_at) VALUES (?, ?, ?, ?)')
    .bind(hash, discordUserId, futureIso(SESSION_TTL_SECONDS), nowIso())
    .run();
  return token;
}

function avatarUrl(row) {
  if (!row || !row.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${row.discord_id}/${row.avatar}.png?size=64`;
}

function toSessionUser(row) {
  if (!row) return null;
  return {
    discordId: row.discord_id,
    username: row.username || 'Discord user',
    avatarUrl: avatarUrl(row),
    isMember: Number(row.is_gamestormers_member) === 1,
  };
}

export async function getSessionUser(db, request, env) {
  await ensureAuthTables(db);
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || !env.SESSION_SECRET) return null;
  const hash = await tokenHash(token, env.SESSION_SECRET);
  const row = await db
    .prepare(
      `SELECT u.discord_id, u.username, u.avatar, u.is_gamestormers_member, s.expires_at
         FROM auth_sessions s
         JOIN discord_users u ON u.discord_id = s.discord_user_id
        WHERE s.token_hash = ? AND s.expires_at > ?
        LIMIT 1`
    )
    .bind(hash, nowIso())
    .first();
  if (!row) return null;
  await db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?').bind(nowIso(), hash).run();
  return toSessionUser(row);
}

export async function deleteSession(db, request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token || !env.SESSION_SECRET) return;
  const hash = await tokenHash(token, env.SESSION_SECRET);
  await db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(hash).run();
}

export async function requireMemberSession(db, request, env) {
  const user = await getSessionUser(db, request, env);
  if (!user) return { ok: false, status: 401, message: 'Log in with Discord to continue.' };
  if (!user.isMember) {
    return {
      ok: false,
      status: 403,
      message: 'This Discord account is not in the Aarhus Gamestormers server yet.',
      invite: discordInvite(env),
      user,
    };
  }
  return { ok: true, user };
}

export function displayName(user) {
  return clean(user && user.username, 120) || 'Discord user';
}
