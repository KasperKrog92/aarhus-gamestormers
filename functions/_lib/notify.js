// Fire-and-forget Discord notification via an incoming webhook.
//
// The webhook URL is passed in by the caller (from a per-channel secret such as
// DISCORD_SUGGESTIONS_WEBHOOK_URL) so different features can post to different
// channels without this helper knowing about any of them. If the URL is unset
// the call is a no-op, so the flow keeps working without it.
//
// This must never break or slow down the request that triggered it: errors are
// swallowed and the fetch is handed to waitUntil so the response can return
// immediately while the post finishes in the background.
export function notifyDiscord(url, waitUntil, content) {
  if (!url || !content) return;

  const task = fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // allowed_mentions: parse [] means a game title containing @everyone or a
    // role mention can never actually ping the channel. flags: 4 tells Discord
    // to keep links clickable without adding an unfurled embed below the message.
    body: JSON.stringify({ content: content.slice(0, 2000), allowed_mentions: { parse: [] }, flags: 4 }),
  }).catch(() => {});

  if (typeof waitUntil === 'function') waitUntil(task);
}
