// Admin gate: a single bearer token (env.ADMIN_TOKEN) entered in vote-admin.html.
// No accounts, no sessions, no cookies — just a shared secret over HTTPS.

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) return false; // refuse if not configured
  const header = request.headers.get('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : '';
  return token.length > 0 && timingSafeEqual(token, expected);
}
