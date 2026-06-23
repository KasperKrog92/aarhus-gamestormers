// POST /api/suggest - submit a game suggestion.
// Body (Steam):     { onSteam:true,  steamUrl, pitch, showName }
// Body (non-Steam): { onSteam:false, title, storeUrl, genres, pitch, showName }
// Gated by: phase === 'suggesting' and authenticated Discord guild membership.
import { json, fail, readJson, clean, cleanLine, isHttpUrl } from '../_lib/http.js';
import {
  ensureRoundScheduleColumns,
  ensureSuggestionDescriptionColumns,
  ensureSuggestionVisibilityColumn,
  getCurrentRound,
  toCard,
} from '../_lib/db.js';
import { roundScheduleState } from '../_lib/schedule.js';
import { parseSteamAppId, fetchSteamGame } from '../_lib/steam.js';
import { notifyDiscord } from '../_lib/notify.js';
import { displayName, requireMemberSession } from '../_lib/member-auth.js';

// Live site, used to build click-through links in the Discord notifications.
const SITE_URL = 'https://www.gamestormers.dk';



export async function onRequestPost({ request, env, waitUntil }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const body = await readJson(request);
  if (body instanceof Response) return body;
  if (!body) return fail('Invalid request body');
  if (body.showName !== undefined && typeof body.showName !== 'boolean') {
    return fail('showName must be true or false.');
  }

  const auth = await requireMemberSession(db, request, env);
  if (!auth.ok) return json({ error: auth.message, invite: auth.invite || null }, auth.status);

  await ensureSuggestionVisibilityColumn(db);
  await ensureRoundScheduleColumns(db);
  const round = await getCurrentRound(db);
  if (!round) return fail('No active round', 409);
  if (round.phase !== 'suggesting') return fail('Suggestions are closed for this round', 409);
  if (!roundScheduleState(round).suggestionsAreOpen) return fail('Suggestions are not open yet', 409);

  // Non-Steam path: the suggester provides the details; stays pending for review.
  if (body.onSteam === false) return suggestManual(db, round, body, auth.user, env, waitUntil);

  // Steam path (default): import from Steam and auto-approve.
  return suggestSteam(db, round, body, auth.user, env, waitUntil);
}

export function showNameValue(body) {
  return body && body.showName === false ? 0 : 1;
}

function mentionOrName(user, discordId, showName) {
  if (!showName) return '';
  return /^\d{17,20}$/.test(discordId || '') ? `<@${discordId}>` : displayName(user);
}

export function suggestionNotification({ title, steamUrl, pitch, user, discordId, showName, pending = false }) {
  const gameTitle = steamUrl ? `**[${title}](${steamUrl})**` : `**${title}**`;
  const lines = [pending ? `New suggestion needs your approval: ${gameTitle}` : `New suggestion: ${gameTitle}`];
  const suggesterName = mentionOrName(user, discordId, showName);
  const suggestionPitch = clean(pitch, 500);

  if (suggesterName) lines.push(`Suggested by: ${suggesterName}`);
  if (suggestionPitch) lines.push(`Pitch: ${suggestionPitch}`);

  lines.push(`[Check it out on the vote page and suggest your own game](${SITE_URL}/vote)`);
  if (pending) lines.push(`[Review it in vote admin](${SITE_URL}/vote-admin/)`);

  return lines.join('\n');
}

async function suggestSteam(db, round, body, user, env, waitUntil) {
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
         (round_id, steam_appid, title, header_image, store_url, genres, price, platforms, description_da, description_en, pitch, suggested_by, discord_user_id, show_suggester_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`
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
      displayName(user),
      user.discordId,
      showNameValue(body)
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

  notifyDiscord(
    env.DISCORD_SUGGESTIONS_WEBHOOK_URL,
    waitUntil,
    suggestionNotification({
      title: game.title,
      steamUrl: game.storeUrl,
      pitch: body.pitch,
      user,
      discordId: user.discordId,
      showName: showNameValue(body) === 1,
    })
  );

  return json({ ok: true, pending: false, game: toCard(suggestion) }, 201);
}

async function suggestManual(db, round, body, user, env, waitUntil) {
  const title = cleanLine(body.title, 200);
  if (!title) return fail('Please enter the game title.');

  const storeUrl = cleanLine(body.storeUrl, 400);
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
         (round_id, steam_appid, title, header_image, store_url, genres, price, platforms, pitch, suggested_by, discord_user_id, show_suggester_name, status)
       VALUES (?, NULL, ?, NULL, ?, ?, NULL, NULL, ?, ?, ?, ?, 'pending')`
    )
    .bind(
      round.id,
      title,
      storeUrl || null,
      cleanLine(body.genres, 200),
      clean(body.pitch, 500),
      displayName(user),
      user.discordId,
      showNameValue(body)
    )
    .run();

  notifyDiscord(
    env.DISCORD_SUGGESTIONS_WEBHOOK_URL,
    waitUntil,
    suggestionNotification({
      title,
      pitch: body.pitch,
      user,
      discordId: user.discordId,
      showName: showNameValue(body) === 1,
      pending: true,
    })
  );

  return json({ ok: true, pending: true, game: { title } }, 201);
}
