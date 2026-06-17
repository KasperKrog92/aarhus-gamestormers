// HTTP client for the admin voting API, used by the GitHub Actions scheduler.
// Every call authenticates with VOTING_ADMIN_TOKEN as a bearer token (the same
// value as the Cloudflare Pages ADMIN_TOKEN) and talks only to the
// authenticated Pages Functions under /api/admin.
//
// Both reads use the admin endpoints on purpose: the scheduler needs vote
// tallies and recorded automation events, neither of which the public
// /api/round/current response exposes (tallies only appear there once a round is
// revealed, and automation events never do). Keeping all network access here
// lets scheduler.mjs stay pure and easy to test.

function trimTrailingSlashes(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function createApiClient({ baseUrl, adminToken, fetch = globalThis.fetch } = {}) {
  const base = trimTrailingSlashes(baseUrl);
  if (!base) throw new Error('createApiClient requires a baseUrl');
  if (!adminToken) throw new Error('createApiClient requires an adminToken');
  if (typeof fetch !== 'function') throw new Error('createApiClient requires a fetch implementation');

  async function request(method, path, body) {
    const url = base + path;
    const init = {
      method,
      headers: {
        authorization: `Bearer ${adminToken}`,
        accept: 'application/json',
      },
    };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!response.ok) {
      const detail = (data && data.error) || text || `HTTP ${response.status}`;
      throw new Error(`${method} ${path} failed: ${response.status} ${detail}`);
    }
    return data;
  }

  return {
    base,
    // GET /api/admin/round — full current round payload (round row, suggestions,
    // tallies, automationEvents, meeting, publishReadiness).
    getCurrentRound() {
      return request('GET', '/api/admin/round');
    },
    // GET /api/admin/round/:id — same payload shape for a specific round.
    getAdminRound(roundId) {
      return request('GET', `/api/admin/round/${Number(roundId)}`);
    },
    // PATCH /api/admin/round/:id — update phase, winner, schedule, etc.
    patchRound(roundId, body) {
      return request('PATCH', `/api/admin/round/${Number(roundId)}`, body || {});
    },
    // POST /api/admin/round/:id/select — promote a suggestion into the meeting's
    // selected game and confirm the winner. `options` is merged into the body so
    // a future draft/not-public mode can be passed through without a new method.
    selectWinner(roundId, suggestionId, options = {}) {
      return request('POST', `/api/admin/round/${Number(roundId)}/select`, {
        suggestionId: Number(suggestionId),
        ...options,
      });
    },
    // PATCH /api/admin/meeting/:id — edit selected-game metadata and localized
    // copy. The meeting id equals the round id (= meeting number).
    patchMeeting(roundId, body) {
      return request('PATCH', `/api/admin/meeting/${Number(roundId)}`, body || {});
    },
    // POST /api/admin/automation-event — idempotent event log. A duplicate is
    // reported as { ok: true, duplicate: true, id: null } with HTTP 200, not an
    // error, so the caller can skip a repeat Discord post or handoff.
    recordAutomationEvent(body) {
      return request('POST', '/api/admin/automation-event', body || {});
    },
  };
}
