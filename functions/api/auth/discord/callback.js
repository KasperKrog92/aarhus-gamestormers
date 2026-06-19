import { fail } from '../../../_lib/http.js';
import {
  clearOAuthStateCookie,
  consumeOAuthState,
  createSession,
  ensureAuthTables,
  parseCookies,
  safeRedirectPath,
  sessionCookie,
  upsertDiscordUser,
} from '../../../_lib/member-auth.js';

const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_URL = 'https://discord.com/api/users/@me';
const DISCORD_GUILDS_URL = 'https://discord.com/api/users/@me/guilds?limit=200';
const DEFAULT_GUILD_ID = '1333453198408683613';

function redirectUri(request, env) {
  return env.DISCORD_REDIRECT_URI || new URL('/api/auth/discord/callback', request.url).toString();
}

function redirectBack(path, request, params = {}) {
  const url = new URL(safeRedirectPath(path), request.url);
  Object.keys(params).forEach((key) => {
    if (params[key]) url.searchParams.set(key, params[key]);
  });
  const headers = new Headers({
    Location: url.toString(),
    'Cache-Control': 'no-store',
  });
  headers.append('Set-Cookie', clearOAuthStateCookie(request));
  return new Response(null, { status: 302, headers });
}

async function discordJson(url, accessToken) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error('Discord API request failed');
  return res.json();
}

async function exchangeCode(request, env, code) {
  const body = new URLSearchParams();
  body.set('client_id', env.DISCORD_CLIENT_ID);
  body.set('client_secret', env.DISCORD_CLIENT_SECRET);
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', redirectUri(request, env));

  const res = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!res.ok) throw new Error('Discord token exchange failed');
  const data = await res.json();
  if (!data || !data.access_token) throw new Error('Discord token response missing access token');
  return data.access_token;
}

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) {
    return fail('Discord login is not configured', 500);
  }

  await ensureAuthTables(db);
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const stateCookie = parseCookies(request).gs_oauth_state || '';
  if (!state || !stateCookie || state !== stateCookie) return fail('Invalid login state', 400);

  const storedState = await consumeOAuthState(db, state, env);
  if (!storedState) return fail('Login state expired. Please try again.', 400);
  const returnTo = storedState.redirectPath || '/vote';

  if (url.searchParams.get('error')) {
    return redirectBack(returnTo, request, { auth: 'discord-error' });
  }

  const code = url.searchParams.get('code') || '';
  if (!code) return redirectBack(returnTo, request, { auth: 'missing-code' });

  try {
    const accessToken = await exchangeCode(request, env, code);
    const [user, guilds] = await Promise.all([
      discordJson(DISCORD_USER_URL, accessToken),
      discordJson(DISCORD_GUILDS_URL, accessToken),
    ]);
    const guildId = env.DISCORD_GUILD_ID || DEFAULT_GUILD_ID;
    const isMember = Array.isArray(guilds) && guilds.some((guild) => String(guild && guild.id) === String(guildId));
    const discordUserId = await upsertDiscordUser(db, user, isMember);
    const sessionToken = await createSession(db, discordUserId, env);

    const headers = new Headers({
      Location: new URL(returnTo, request.url).toString(),
      'Cache-Control': 'no-store',
    });
    headers.append('Set-Cookie', sessionCookie(sessionToken, request));
    headers.append('Set-Cookie', clearOAuthStateCookie(request));
    return new Response(null, { status: 302, headers });
  } catch {
    return redirectBack(returnTo, request, { auth: 'login-failed' });
  }
}
