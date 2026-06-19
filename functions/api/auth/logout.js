import { json, fail } from '../../_lib/http.js';
import { clearSessionCookie, deleteSession, ensureAuthTables } from '../../_lib/member-auth.js';

async function logout(request, env) {
  const db = env.DB;
  if (!db) return fail('Database not configured', 500);
  await ensureAuthTables(db);
  await deleteSession(db, request, env);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
}

export async function onRequestPost({ request, env }) {
  return logout(request, env);
}

export async function onRequestGet({ request, env }) {
  return logout(request, env);
}
