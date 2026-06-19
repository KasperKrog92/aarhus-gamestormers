import { json, fail } from '../../_lib/http.js';
import {
  clearSessionCookie,
  discordInvite,
  getSessionUser,
  parseCookies,
} from '../../_lib/member-auth.js';

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);

  const user = await getSessionUser(db, request, env);
  const body = {
    authenticated: !!user,
    user: user
      ? {
          username: user.username,
          avatarUrl: user.avatarUrl,
          isMember: user.isMember,
        }
      : null,
    discordInvite: discordInvite(env),
  };

  const cookies = parseCookies(request);
  const headers = !user && cookies.gs_session ? { 'Set-Cookie': clearSessionCookie(request) } : {};
  return json(body, 200, headers);
}
