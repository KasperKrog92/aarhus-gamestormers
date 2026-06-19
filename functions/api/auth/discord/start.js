import { fail } from '../../../_lib/http.js';
import {
  ensureAuthTables,
  oauthStateCookie,
  randomToken,
  safeRedirectPath,
  storeOAuthState,
} from '../../../_lib/member-auth.js';

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const SCOPES = 'identify guilds';

function redirectUri(request, env) {
  return env.DISCORD_REDIRECT_URI || new URL('/api/auth/discord/callback', request.url).toString();
}

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);
  if (!env.DISCORD_CLIENT_ID || !env.SESSION_SECRET) return fail('Discord login is not configured', 500);

  await ensureAuthTables(db);
  const url = new URL(request.url);
  const referer = request.headers.get('referer');
  let fallback = '/vote';
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.origin === url.origin) fallback = safeRedirectPath(refererUrl.pathname + refererUrl.search, '/vote');
    } catch {
      fallback = '/vote';
    }
  }
  const returnTo = safeRedirectPath(url.searchParams.get('returnTo'), fallback);
  const state = randomToken();
  await storeOAuthState(db, state, returnTo, env);

  const authorize = new URL(DISCORD_AUTHORIZE_URL);
  authorize.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', redirectUri(request, env));
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', SCOPES);
  authorize.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': oauthStateCookie(state, request),
      'Cache-Control': 'no-store',
    },
  });
}
