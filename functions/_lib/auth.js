// Admin gate: a single bearer token (env.ADMIN_TOKEN) entered in vote-admin.html.
// No accounts, no sessions, no cookies — just a shared secret over HTTPS.

async function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  const aHash = await crypto.subtle.digest('SHA-256', aBuf);
  const bHash = await crypto.subtle.digest('SHA-256', bBuf);

  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(aHash, bHash);
  }

  // Fallback for environments lacking timingSafeEqual on Web Crypto (e.g. Node.js tests)
  try {
    const { timingSafeEqual: nodeTimingSafeEqual } = await import('node:crypto');
    return nodeTimingSafeEqual(new Uint8Array(aHash), new Uint8Array(bHash));
  } catch {
    const aArr = new Uint8Array(aHash);
    const bArr = new Uint8Array(bHash);
    let diff = 0;
    for (let i = 0; i < aArr.length; i++) {
      diff |= aArr[i] ^ bArr[i];
    }
    return diff === 0;
  }
}

export async function isAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) return false; // refuse if not configured
  const header = request.headers.get('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : '';
  return token.length > 0 && (await timingSafeEqual(token, expected));
}
