// POST /api/suggest — submit a game suggestion.
// Body: { steamUrl, pitch, suggestedBy, stormCode, turnstileToken }
// Gated by: phase === 'suggesting', correct storm code, Turnstile pass.
// Imports the game server-side from Steam and stores it as 'approved' (auto-approve):
// it appears on the board immediately; the maintainer can still edit/reject/delete it.
import { json, fail, readJson, clean } from '../_lib/http.js';
import { getCurrentRound } from '../_lib/db.js';
import { parseSteamAppId, fetchSteamGame } from '../_lib/steam.js';
import { verifyTurnstile } from '../_lib/turnstile.js';

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const body = await readJson(request);
  if (!body) return fail('Invalid request body');

  const round = await getCurrentRound(db);
  if (!round) return fail('No active round', 409);
  if (round.phase !== 'suggesting') return fail('Suggestions are closed for this round', 409);

  if (clean(body.stormCode, 40) !== round.storm_code) return fail('Wrong code', 403);

  const ts = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET);
  if (!ts.ok) return fail('Bot check failed — please try again', 403);

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

  await db
    .prepare(
      `INSERT INTO suggestions
         (round_id, steam_appid, title, header_image, store_url, genres, price, platforms, pitch, suggested_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`
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
      clean(body.pitch, 500),
      clean(body.suggestedBy, 80)
    )
    .run();

  return json({ ok: true, game: { title: game.title, image: game.image } }, 201);
}
