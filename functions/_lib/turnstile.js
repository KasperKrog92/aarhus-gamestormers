// Cloudflare Turnstile server-side verification.
// Privacy note: we do NOT forward the visitor IP (remoteip is optional) — the
// Cloudflare edge already terminates the request, and we keep no IP ourselves.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token, secret) {
  if (!secret) return { ok: false, reason: 'turnstile-not-configured' };
  if (!token) return { ok: false, reason: 'missing-token' };

  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);

  let data = {};
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    data = await res.json();
  } catch {
    return { ok: false, reason: 'verify-request-failed' };
  }

  return { ok: data.success === true, reason: (data['error-codes'] || []).join(',') };
}
