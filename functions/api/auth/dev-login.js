// GET /api/auth/dev-login - local-only shortcut that mints a fake member
// session so the suggest/vote flows can be exercised without real Discord OAuth.
//
// Hard-gated behind env.DEV_LOGIN === 'true', which only ever lives in the
// local .dev.vars file. Production Cloudflare Pages has no such variable, so
// this endpoint returns 404 there even though the file ships with the build.
//
// Usage (dev server only):
//   /api/auth/dev-login            -> log in as a Gamestormers member
//   /api/auth/dev-login?member=0   -> log in as a non-member (tests that path)
//   /api/auth/dev-login?returnTo=/en/vote
//
// Log out again with the normal "Log out" button (POST /api/auth/logout).
import { fail } from '../../_lib/http.js';
import {
  createSession,
  ensureAuthTables,
  safeRedirectPath,
  sessionCookie,
  upsertDiscordUser,
} from '../../_lib/member-auth.js';

export async function onRequestGet({ request, env }) {
  if (env.DEV_LOGIN !== 'true') return fail('Not found', 404);

  const url = new URL(request.url);
  if (!['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)) {
    return fail('Not found', 404);
  }

  const db = env.DB;
  if (!db) return fail('Database not configured', 500);
  if (!env.SESSION_SECRET) return fail('SESSION_SECRET is not configured', 500);

  await ensureAuthTables(db);

  const isMember = url.searchParams.get('member') !== '0';
  const fakeUser = {
    id: isMember ? 'dev-member-1' : 'dev-nonmember-1',
    username: isMember ? 'Dev Member' : 'Dev Non-Member',
    global_name: isMember ? 'Dev Member' : 'Dev Non-Member',
    avatar: null,
  };

  const discordUserId = await upsertDiscordUser(db, fakeUser, isMember);
  const token = await createSession(db, discordUserId, env);
  const returnTo = safeRedirectPath(url.searchParams.get('returnTo'), '/vote');

  return new Response(null, {
    status: 302,
    headers: {
      Location: returnTo,
      'Set-Cookie': sessionCookie(token, request),
      'Cache-Control': 'no-store',
    },
  });
}
