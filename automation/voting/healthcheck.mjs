// Dead-man's-switch ping for the voting scheduler. After every successful
// scheduler pass, both hosts (the Cloudflare cron Worker and the GitHub Actions
// backstop) ping a healthchecks.io check URL. If no ping arrives by the check's
// daily deadline, healthchecks alerts the maintainer, which turns a silently
// missed pass (the July 2026 failure mode) into a loud absence.
//
// The ping is strictly best-effort: a missing URL is a skip, and a network or
// HTTP failure is reported in the result but never thrown, because a watchdog
// hiccup must not fail an otherwise-successful scheduler pass.
export async function pingHealthcheck(url, { fetch = globalThis.fetch } = {}) {
  const target = String(url || '').trim();
  if (!target) return { skipped: true, ok: false };
  try {
    const response = await fetch(target, { method: 'POST' });
    return { skipped: false, ok: Boolean(response.ok), status: response.status };
  } catch (err) {
    return { skipped: false, ok: false, status: null, error: err && err.message ? err.message : String(err) };
  }
}
