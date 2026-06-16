// Small response/request helpers shared by all Pages Functions.
// Same-origin API (Cloudflare Pages Functions), so no CORS headers are needed.

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Trim + cap a free-text field; returns '' for nullish input.
export function clean(value, maxLen = 2000) {
  if (value == null) return '';
  return String(value).trim().slice(0, maxLen);
}
