// POST /api/suggest — submit a game suggestion.
// Two paths, chosen by the `onSteam` discriminator from the form:
//   • Steam game (onSteam !== false): import the game server-side from Steam and
//     store it as 'approved' (auto-approve) — it appears on the board immediately;
//     the maintainer can still edit/reject/delete it.
//   • Non-Steam game (onSteam === false): the suggester types the title + optional
//     store link / genres / pitch themselves. Stored as 'pending' so it stays
//     hidden until the maintainer verifies it (and adds an image) in vote-admin.
// Body (Steam):     { onSteam:true,  steamUrl, pitch, suggestedBy, stormCode, turnstileToken }
// Body (non-Steam): { onSteam:false, title, storeUrl, genres, pitch, suggestedBy, stormCode, turnstileToken }
// Gated by: phase === 'suggesting', correct storm code, Turnstile pass.
import { json, fail, readJson, clean } from '../_lib/http.js';
import { ensureRoundScheduleColumns, ensureSuggestionDescriptionColumns, getCurrentRound, toCard } from '../_lib/db.js';
import { roundScheduleState } from '../_lib/schedule.js';
import { parseSteamAppId, fetchSteamGame } from '../_lib/steam.js';
import { verifyTurnstile } from '../_lib/turnstile.js';

// Only allow plain http(s) links so a crafted store link can't smuggle in a
// javascript: URI that the admin/public card would later render as an href.
function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const body = await readJson(request);
  if (!body) return fail('Invalid request body');

  await ensureRoundScheduleColumns(db);
  const round = await getCurrentRound(db);
  if (!round) return fail('No active round', 409);
  if (round.phase !== 'suggesting') return fail('Suggestions are closed for this round', 409);
  if (!roundScheduleState(round).suggestionsAreOpen) return fail('Suggestions are not open yet', 409);

  if (clean(body.stormCode, 40) !== round.storm_code) return fail('Wrong code', 403);

  const ts = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET);
  if (!ts.ok) return fail('Bot check failed — please try again', 403);

  // Non-Steam path: the suggester provides the details; stays 'pending' for review.
  if (body.onSteam === false) return suggestManual(db, round, body);

  // Steam path (default): import from Steam and auto-approve.
  return suggestSteam(db, round, body);
}

async function suggestSteam(db, round, body) {
  await ensureSuggestionDescriptionColumns(db);

  const appId = parseSteamAppId(clean(body.steamUrl, 500));
  if (!appId) return fail('Please paste a valid Steam store link (store.steampowered.com/app/...)');

  let game;
  try {
    game = await fetchSteamGame(appId);
  } catch {
    return fail('Could not reach Steam right now. Try again in a moment.', 502);
  }
  if (!game || !game.title) return fail('Steam has no data for that game.', 404);

  const dup = await db
    .prepare("SELECT id FROM suggestions WHERE round_id = ? AND steam_appid = ? AND status != 'rejected' LIMIT 1")
    .bind(round.id, game.steamAppId)
    .first();
  if (dup) return fail('That game has already been suggested for this round.', 409);

  const inserted = await db
    .prepare(
      `INSERT INTO suggestions
         (round_id, steam_appid, title, header_image, store_url, genres, price, platforms, description_da, description_en, pitch, suggested_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`
    )
    .bind(
      round.id,
      game.steamAppId,
      game.title,
      game.image,
      game.storeUrl,
      game.genres.join(', '),
      game.price,
      game.platforms.join(', '),
      clean(game.descriptionDa, 1000),
      clean(game.descriptionEn, 1000),
      clean(body.pitch, 500),
      clean(body.suggestedBy, 80)
    )
    .run();

  const suggestionId = inserted.meta && inserted.meta.last_row_id;
  const suggestion = suggestionId
    ? await db.prepare('SELECT * FROM suggestions WHERE id = ?').bind(suggestionId).first()
    : await db
        .prepare('SELECT * FROM suggestions WHERE round_id = ? AND steam_appid = ? AND status = ? LIMIT 1')
        .bind(round.id, game.steamAppId, 'approved')
        .first();

  if (!suggestion) return fail('Suggestion was saved but could not be loaded.', 500);

  return json({ ok: true, pending: false, game: toCard(suggestion) }, 201);
}

async function suggestManual(db, round, body) {
  const title = clean(body.title, 200);
  if (!title) return fail('Please enter the game title.');

  const storeUrl = clean(body.storeUrl, 400);
  if (storeUrl && !isHttpUrl(storeUrl)) return fail('Store link must be a valid http(s) URL.');

  const dup = await db
    .prepare(
      "SELECT id FROM suggestions WHERE round_id = ? AND steam_appid IS NULL AND lower(title) = lower(?) AND status != 'rejected' LIMIT 1"
    )
    .bind(round.id, title)
    .first();
  if (dup) return fail('That game has already been suggested for this round.', 409);

  await db
    .prepare(
      `INSERT INTO suggestions
         (round_id, steam_appid, title, header_image, store_url, genres, price, platforms, pitch, suggested_by, status)
       VALUES (?, NULL, ?, NULL, ?, ?, NULL, NULL, ?, ?, 'pending')`
    )
    .bind(
      round.id,
      title,
      storeUrl || null,
      clean(body.genres, 200),
      clean(body.pitch, 500),
      clean(body.suggestedBy, 80)
    )
    .run();

  return json({ ok: true, pending: true, game: { title } }, 201);
}
