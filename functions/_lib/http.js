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

export function isHttpUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function readJson(request, maxBytes = 32768) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return fail('Unsupported Media Type: expected application/json', 415);
  }

  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const limit = parseInt(contentLengthHeader, 10);
    if (isNaN(limit) || limit > maxBytes) {
      return fail('Payload Too Large', 413);
    }
  }

  if (!request.body) {
    try {
      const text = await request.text();
      if (text.length > maxBytes) {
        return fail('Payload Too Large', 413);
      }
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          return fail('Payload Too Large', 413);
        }
        chunks.push(value);
      }
    }
  } catch {
    return fail('Error reading request stream', 400);
  }

  const length = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const bodyData = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bodyData.set(chunk, offset);
    offset += chunk.length;
  }

  const text = new TextDecoder().decode(bodyData);
  try {
    return JSON.parse(text);
  } catch {
    return fail('Invalid JSON', 400);
  }
}

// Characters we never want to store in user-supplied text:
// - Bidirectional and zero-width formatting characters, which enable invisible
//   content and "Trojan Source" style spoofing of titles and names.
const INVISIBLE = new RegExp('[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]', 'g');
// C0/C1 control characters except tab (\t), newline (\n) and carriage return
// (\r), which multi-line fields (pitches, descriptions) legitimately keep.
const CONTROL_KEEP_NEWLINES = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]', 'g');
// Every C0/C1 control character, for single-line fields.
const CONTROL_ALL = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]', 'g');

// Trim + cap a free-text field, stripping invisible/bidi characters and control
// characters. Tabs and line breaks are preserved so multi-line fields keep their
// formatting. Returns '' for nullish input.
export function clean(value, maxLen = 2000) {
  if (value == null) return '';
  return String(value)
    .replace(INVISIBLE, '')
    .replace(CONTROL_KEEP_NEWLINES, '')
    .trim()
    .slice(0, maxLen);
}

// Like clean(), but for single-line fields: every run of whitespace (including
// line breaks) collapses to one space, so a value such as a game title cannot
// smuggle newlines into a Discord notification or break a card's layout.
export function cleanLine(value, maxLen = 2000) {
  if (value == null) return '';
  return String(value)
    .replace(INVISIBLE, '')
    .replace(CONTROL_ALL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}
