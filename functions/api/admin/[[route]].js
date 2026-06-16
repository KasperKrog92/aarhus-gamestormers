// Admin API — catch-all for /api/admin/*. Every request requires
// Authorization: Bearer <ADMIN_TOKEN>. Used by vote-admin.html.
//
//   GET    /api/admin/round            full current round + all suggestions + tallies
//   POST   /api/admin/round            open a new round { id, stormCode, title?, votingClosesAt? }
//   PATCH  /api/admin/round            update current round { phase?, stormCode?, title?, votingClosesAt?, winnerSuggestionId? }
//   PATCH  /api/admin/suggestion/:id   edit/approve/reject a suggestion
//   DELETE /api/admin/suggestion/:id   delete a suggestion
//   DELETE /api/admin/ballot/:ballotId remove a single ballot (all its votes)
import { json, fail, readJson, clean } from '../../_lib/http.js';
import { isAdmin } from '../../_lib/auth.js';
import { getCurrentRound, getRoundById, getSuggestions, getSuggestionById, getTallies, getBallots } from '../../_lib/db.js';

const PHASES = ['suggesting', 'voting', 'revealed', 'closed'];
const STATUSES = ['pending', 'approved', 'rejected'];

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.DB) return fail('Database not configured', 500);
  if (!isAdmin(request, env)) return fail('Unauthorized', 401);

  const db = env.DB;
  const segs = Array.isArray(params.route) ? params.route : params.route ? [params.route] : [];
  const [resource, id] = segs;
  const method = request.method.toUpperCase();

  if (resource === 'rounds' && !id) {
    if (method === 'GET') return adminListRounds(db);
  }
  if (resource === 'round') {
    if (!id) {
      if (method === 'GET') return adminGetRound(db);
      if (method === 'POST') return adminOpenRound(db, request);
    } else {
      const numId = Number(id);
      if (method === 'GET') return adminGetRoundById(db, numId);
      if (method === 'PATCH') return adminPatchRound(db, request, numId);
      if (method === 'DELETE') return adminDeleteRound(db, numId);
    }
  }
  if (resource === 'suggestion' && id) {
    if (method === 'PATCH') return adminPatchSuggestion(db, request, Number(id));
    if (method === 'DELETE') return adminDeleteSuggestion(db, Number(id));
  }
  if (resource === 'ballot' && id) {
    if (method === 'DELETE') return adminDeleteBallot(db, id);
  }
  return fail('Not found', 404);
}

async function adminListRounds(db) {
  const { results } = await db.prepare('SELECT id, title, phase, created_at FROM rounds ORDER BY id DESC').all();
  return json({ rounds: results || [] });
}

async function adminGetRound(db) {
  const round = await getCurrentRound(db);
  if (!round) return json({ round: null, suggestions: [], tallies: {}, ballots: [] });
  const suggestions = await getSuggestions(db, round.id);
  const tallies = await getTallies(db, round.id);
  const ballots = await getBallots(db, round.id);
  return json({ round, suggestions, tallies, ballots });
}

async function adminGetRoundById(db, id) {
  if (!Number.isInteger(id) || id <= 0) return fail('Invalid id');
  const round = await getRoundById(db, id);
  if (!round) return fail('Round not found', 404);
  const suggestions = await getSuggestions(db, round.id);
  const tallies = await getTallies(db, round.id);
  const ballots = await getBallots(db, round.id);
  return json({ round, suggestions, tallies, ballots });
}

async function adminDeleteRound(db, id) {
  if (!Number.isInteger(id) || id <= 0) return fail('Invalid id');
  // ON DELETE CASCADE in schema handles suggestions and votes automatically
  await db.prepare('DELETE FROM rounds WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function adminOpenRound(db, request) {
  const body = await readJson(request);
  if (!body) return fail('Invalid body');
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return fail('Meeting number (id) required');
  const stormCode = clean(body.stormCode, 40);
  if (!stormCode) return fail('Storm code required');
  if (await getRoundById(db, id)) return fail('Round ' + id + ' already exists', 409);

  await db
    .prepare("INSERT INTO rounds (id, title, storm_code, phase, voting_closes_at) VALUES (?, ?, ?, 'suggesting', ?)")
    .bind(id, clean(body.title, 120) || null, stormCode, clean(body.votingClosesAt, 40) || null)
    .run();
  return json({ ok: true, id }, 201);
}

async function adminPatchRound(db, request, id) {
  const body = await readJson(request);
  if (!body) return fail('Invalid body');
  const round = await getRoundById(db, id);
  if (!round) return fail('Round not found', 404);

  const sets = [];
  const vals = [];
  const put = (col, val) => {
    sets.push(col + ' = ?');
    vals.push(val);
  };

  if (body.phase !== undefined) {
    const phase = clean(body.phase, 20);
    if (!PHASES.includes(phase)) return fail('Invalid phase');
    put('phase', phase);
  }
  if (body.stormCode !== undefined) put('storm_code', clean(body.stormCode, 40));
  if (body.title !== undefined) put('title', clean(body.title, 120));
  if (body.votingClosesAt !== undefined) put('voting_closes_at', clean(body.votingClosesAt, 40) || null);
  if (body.winnerSuggestionId !== undefined) {
    put('winner_suggestion_id', body.winnerSuggestionId === null ? null : Number(body.winnerSuggestionId));
  }
  if (!sets.length) return fail('Nothing to update');

  vals.push(round.id);
  await db.prepare('UPDATE rounds SET ' + sets.join(', ') + ' WHERE id = ?').bind(...vals).run();
  return json({ ok: true });
}

async function adminPatchSuggestion(db, request, id) {
  if (!Number.isInteger(id)) return fail('Invalid id');
  const body = await readJson(request);
  if (!body) return fail('Invalid body');
  if (!(await getSuggestionById(db, id))) return fail('Suggestion not found', 404);

  const sets = [];
  const vals = [];
  const put = (col, val) => {
    sets.push(col + ' = ?');
    vals.push(val);
  };

  if (body.status !== undefined) {
    const v = clean(body.status, 20);
    if (!STATUSES.includes(v)) return fail('Invalid status');
    put('status', v);
  }
  if (body.title !== undefined) put('title', clean(body.title, 200));
  if (body.genres !== undefined) put('genres', clean(body.genres, 200));
  if (body.price !== undefined) put('price', clean(body.price, 60));
  if (body.platforms !== undefined) put('platforms', clean(body.platforms, 120));
  if (body.pitch !== undefined) put('pitch', clean(body.pitch, 500));
  if (body.suggestedBy !== undefined) put('suggested_by', clean(body.suggestedBy, 80));
  if (body.gogUrl !== undefined) put('gog_url', clean(body.gogUrl, 300) || null);
  if (body.image !== undefined) put('header_image', clean(body.image, 400));
  if (body.storeUrl !== undefined) put('store_url', clean(body.storeUrl, 400));
  if (body.playtimeHours !== undefined) {
    if (body.playtimeHours === '' || body.playtimeHours === null) put('playtime_hours', null);
    else {
      const n = Number(body.playtimeHours);
      if (!Number.isFinite(n)) return fail('Invalid playtime');
      put('playtime_hours', Math.round(n));
    }
  }
  if (!sets.length) return fail('Nothing to update');

  vals.push(id);
  await db.prepare('UPDATE suggestions SET ' + sets.join(', ') + ' WHERE id = ?').bind(...vals).run();
  return json({ ok: true });
}

async function adminDeleteSuggestion(db, id) {
  if (!Number.isInteger(id)) return fail('Invalid id');
  await db.prepare('DELETE FROM suggestions WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function adminDeleteBallot(db, ballotId) {
  const id = clean(ballotId, 80);
  if (!id) return fail('Invalid ballot id');
  await db.prepare('DELETE FROM votes WHERE ballot_id = ?').bind(id).run();
  return json({ ok: true });
}
