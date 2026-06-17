// Admin API — catch-all for /api/admin/*. Every request requires
// Authorization: Bearer <ADMIN_TOKEN>. Used by vote-admin.html.
//
//   GET    /api/admin/round            full current round + all suggestions + tallies
//   POST   /api/admin/round            open a new round and matching public meeting
//   PATCH  /api/admin/round            update current round and matching public meeting basics
//   PATCH  /api/admin/suggestion/:id   edit/approve/reject a suggestion
//   DELETE /api/admin/suggestion/:id   delete a suggestion
//   DELETE /api/admin/ballot/:ballotId remove a single ballot (all its votes)
import { json, fail, readJson, clean } from '../../_lib/http.js';
import { isAdmin } from '../../_lib/auth.js';
import {
  ensureRoundScheduleColumns,
  ensureMeetingContentTables,
  ensureSuggestionDescriptionColumns,
  getCurrentRound,
  getMeetingById,
  getRoundById,
  getSuggestions,
  getSuggestionById,
  getTallies,
  getBallots,
  upsertMeeting,
  upsertGame,
  upsertMeetingCopy,
  attachGameToMeeting,
  getGameById,
  getMeetingCopy,
  setMeetingStatus,
  gameInputFromSuggestion,
  gameRowToInput,
} from '../../_lib/db.js';
import {
  DEFAULT_MEETING_TIMEZONE,
  DEFAULT_SUGGESTIONS_OPEN_MONTHS_BEFORE,
  DEFAULT_VOTING_OPENS_MONTHS_BEFORE,
  DEFAULT_VOTING_CLOSES_MONTHS_BEFORE,
  cleanDateOnly,
  cleanMonthsBefore,
  cleanTimeOnly,
  defaultScheduleForMeetingDate,
  meetingUtcRange,
  timeOnlyInZone,
} from '../../_lib/schedule.js';

const PHASES = ['suggesting', 'voting', 'revealed', 'closed'];
const STATUSES = ['pending', 'approved', 'rejected'];
const DEFAULT_VENUE_NAME = 'Folkehuset Møllestien';
const DEFAULT_VENUE_ADDRESS = 'Grønnegade 10, 8000 Aarhus C';
const DEFAULT_DISCORD_INVITE = 'https://discord.gg/N2h6DJxVDF';

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.DB) return fail('Database not configured', 500);
  if (!isAdmin(request, env)) return fail('Unauthorized', 401);

  const db = env.DB;
  await ensureRoundScheduleColumns(db);
  await ensureMeetingContentTables(db);
  const segs = Array.isArray(params.route) ? params.route : params.route ? [params.route] : [];
  const [resource, id, action] = segs;
  const method = request.method.toUpperCase();

  if (resource === 'rounds' && !id) {
    if (method === 'GET') return adminListRounds(db);
  }
  if (resource === 'round') {
    if (!id) {
      if (method === 'GET') return adminGetRound(db);
      if (method === 'POST') return adminOpenRound(db, request);
    } else if (action === 'select') {
      if (method === 'POST') return adminSelectGame(db, request, Number(id));
    } else {
      const numId = Number(id);
      if (method === 'GET') return adminGetRoundById(db, numId);
      if (method === 'PATCH') return adminPatchRound(db, request, numId);
      if (method === 'DELETE') return adminDeleteRound(db, numId);
    }
  }
  if (resource === 'meeting' && id && !action) {
    if (method === 'PATCH') return adminPatchMeeting(db, request, Number(id));
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
  const { results } = await db
    .prepare(
      `SELECT
         r.id,
         r.title,
         r.meeting_date,
         r.phase,
         r.created_at,
         CASE WHEN m.id IS NULL THEN 0 ELSE 1 END AS has_public_meeting,
         m.status AS meeting_status
       FROM rounds r
       LEFT JOIN meetings m ON m.id = r.id
       ORDER BY r.id DESC`
    )
    .all();
  return json({ rounds: results || [] });
}

async function roundPayload(db, round) {
  const suggestions = await getSuggestions(db, round.id);
  const tallies = await getTallies(db, round.id);
  const ballots = await getBallots(db, round.id);
  const meetingRow = await getMeetingById(db, round.id);
  const gameRow = meetingRow && meetingRow.selected_game_id != null ? await getGameById(db, meetingRow.selected_game_id) : null;
  const meetingCopy = meetingRow ? await getMeetingCopy(db, round.id) : null;
  return {
    round,
    meeting: toAdminMeeting(meetingRow),
    selectedGame: toAdminGame(gameRow),
    meetingCopy,
    publishReadiness: meetingPublishReadiness(meetingRow, gameRow, meetingCopy),
    suggestions,
    tallies,
    ballots,
  };
}

async function adminGetRound(db) {
  const round = await getCurrentRound(db);
  if (!round) {
    return json({
      round: null,
      meeting: null,
      selectedGame: null,
      meetingCopy: null,
      publishReadiness: null,
      suggestions: [],
      tallies: {},
      ballots: [],
    });
  }
  return json(await roundPayload(db, round));
}

async function adminGetRoundById(db, id) {
  if (!Number.isInteger(id) || id <= 0) return fail('Invalid id');
  const round = await getRoundById(db, id);
  if (!round) return fail('Round not found', 404);
  return json(await roundPayload(db, round));
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
  const meetingDate = cleanDateOnly(body.meetingDate);
  const suggestionsOpenMonthsBefore = cleanMonthsBefore(body.suggestionsOpenMonthsBefore, DEFAULT_SUGGESTIONS_OPEN_MONTHS_BEFORE);
  const votingOpensMonthsBefore = cleanMonthsBefore(body.votingOpensMonthsBefore, DEFAULT_VOTING_OPENS_MONTHS_BEFORE);
  const votingClosesMonthsBefore = cleanMonthsBefore(body.votingClosesMonthsBefore, DEFAULT_VOTING_CLOSES_MONTHS_BEFORE);
  const defaults = defaultScheduleForMeetingDate(meetingDate, suggestionsOpenMonthsBefore, votingOpensMonthsBefore, votingClosesMonthsBefore);
  const suggestionsOpenAt = cleanDateOnly(body.suggestionsOpenAt) || defaults.suggestionsOpenAt;
  const votingOpensAt = cleanDateOnly(body.votingOpensAt) || defaults.votingOpensAt;
  const votingClosesAt = cleanDateOnly(body.votingClosesAt) || defaults.votingClosesAt;
  const meeting = meetingFromInput(body, { id, meetingDate, phase: 'suggesting' });
  if (meeting.error) return fail(meeting.error);

  await db
    .prepare(
      `INSERT INTO rounds
         (id, title, meeting_date, storm_code, phase, suggestions_open_months_before, voting_opens_months_before, voting_closes_months_before, suggestions_open_at, voting_opens_at, voting_closes_at)
       VALUES (?, ?, ?, ?, 'suggesting', ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      clean(body.title, 120) || null,
      meetingDate || null,
      stormCode,
      suggestionsOpenMonthsBefore,
      votingOpensMonthsBefore,
      votingClosesMonthsBefore,
      suggestionsOpenAt || null,
      votingOpensAt || null,
      votingClosesAt || null
    )
    .run();
  await upsertMeeting(db, meeting.value);
  return json({ ok: true, id, meeting: true }, 201);
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
  if (body.meetingDate !== undefined) put('meeting_date', cleanDateOnly(body.meetingDate) || null);
  if (body.suggestionsOpenMonthsBefore !== undefined) {
    put('suggestions_open_months_before', cleanMonthsBefore(body.suggestionsOpenMonthsBefore, DEFAULT_SUGGESTIONS_OPEN_MONTHS_BEFORE));
  }
  if (body.votingOpensMonthsBefore !== undefined) {
    put('voting_opens_months_before', cleanMonthsBefore(body.votingOpensMonthsBefore, DEFAULT_VOTING_OPENS_MONTHS_BEFORE));
  }
  if (body.votingClosesMonthsBefore !== undefined) {
    put('voting_closes_months_before', cleanMonthsBefore(body.votingClosesMonthsBefore, DEFAULT_VOTING_CLOSES_MONTHS_BEFORE));
  }
  if (body.suggestionsOpenAt !== undefined) put('suggestions_open_at', cleanDateOnly(body.suggestionsOpenAt) || null);
  if (body.votingOpensAt !== undefined) put('voting_opens_at', cleanDateOnly(body.votingOpensAt) || null);
  if (body.votingClosesAt !== undefined) put('voting_closes_at', cleanDateOnly(body.votingClosesAt) || null);
  if (body.winnerSuggestionId !== undefined) {
    put('winner_suggestion_id', body.winnerSuggestionId === null ? null : Number(body.winnerSuggestionId));
  }
  const hasMeetingFields = hasAny(body, [
    'meetingDate',
    'meetingStartTime',
    'meetingEndTime',
    'venueName',
    'venueAddress',
    'discordInvite',
    'timezone',
  ]);
  const existingMeeting = await getMeetingById(db, id);
  const shouldUpsertMeeting = hasMeetingFields || (body.phase !== undefined && existingMeeting);
  if (!sets.length && !shouldUpsertMeeting) return fail('Nothing to update');

  let meeting = null;
  if (shouldUpsertMeeting) {
    meeting = meetingFromInput(
      body,
      {
        id: round.id,
        meetingDate: body.meetingDate !== undefined ? cleanDateOnly(body.meetingDate) : cleanDateOnly(round.meeting_date),
        phase: body.phase !== undefined ? clean(body.phase, 20) : round.phase,
      },
      existingMeeting
    );
    if (meeting.error) return fail(meeting.error);
  }

  if (sets.length) {
    vals.push(round.id);
    await db.prepare('UPDATE rounds SET ' + sets.join(', ') + ' WHERE id = ?').bind(...vals).run();
  }
  if (meeting) await upsertMeeting(db, meeting.value);
  return json({ ok: true });
}

function hasAny(obj, keys) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(obj, key));
}

function phaseToMeetingStatus(phase) {
  if (phase === 'closed') return 'completed';
  if (PHASES.includes(phase)) return phase;
  return 'planned';
}

function toAdminMeeting(row) {
  if (!row) return null;
  const timeZone = row.timezone || DEFAULT_MEETING_TIMEZONE;
  return {
    id: row.id,
    meetingDate: row.meeting_date,
    startsAtUtc: row.starts_at_utc,
    endsAtUtc: row.ends_at_utc,
    startTime: timeOnlyInZone(row.starts_at_utc, timeZone),
    endTime: timeOnlyInZone(row.ends_at_utc, timeZone),
    timezone: timeZone,
    venueName: row.venue_name,
    venueAddress: row.venue_address || '',
    discordInvite: row.discord_invite || '',
    status: row.status,
    hasSelectedGame: row.selected_game_id != null,
  };
}

function toAdminGame(row) {
  if (!row) return null;
  return {
    id: row.id,
    steamAppId: row.steam_appid || '',
    title: row.title || '',
    image: row.header_image || '',
    storeUrl: row.store_url || '',
    gogUrl: row.gog_url || '',
    gogId: row.gog_id || '',
    genres: row.genres || '',
    platforms: row.platforms || '',
    price: row.price || '',
    playtimeHours: row.playtime_hours != null ? row.playtime_hours : '',
    hltbUrl: row.hltb_url || '',
    descriptionDa: row.description_da || '',
    descriptionEn: row.description_en || '',
  };
}

// A meeting card is publish-ready once the selected game and the fields the
// homepage event/history cards rely on are all present. History descriptions are
// optional because the renderer falls back to the event description.
function meetingPublishReadiness(meetingRow, gameRow, copy) {
  if (!meetingRow) return { ready: false, missing: ['public meeting record'] };
  if (!gameRow) return { ready: false, missing: ['selected game'] };
  const missing = [];
  if (!gameRow.title) missing.push('title');
  if (!gameRow.header_image) missing.push('cover image');
  if (!gameRow.store_url && !gameRow.gog_url) missing.push('store link');
  if (!gameRow.genres) missing.push('genres');
  if (!gameRow.platforms) missing.push('platforms');
  if (gameRow.playtime_hours == null) missing.push('playtime hours');
  if (!gameRow.hltb_url) missing.push('HowLongToBeat URL');
  const daEvent = (copy && copy.da && copy.da.eventDescription) || gameRow.description_da;
  const enEvent = (copy && copy.en && copy.en.eventDescription) || gameRow.description_en;
  if (!daEvent) missing.push('Danish event description');
  if (!enEvent) missing.push('English event description');
  return { ready: missing.length === 0, missing };
}

// Promote a suggestion into the meeting's selected game, confirm the winner,
// and reveal the round when appropriate.
async function adminSelectGame(db, request, id) {
  if (!Number.isInteger(id) || id <= 0) return fail('Invalid round id');
  const body = await readJson(request);
  if (!body) return fail('Invalid body');
  const suggestionId = Number(body.suggestionId);
  if (!Number.isInteger(suggestionId) || suggestionId <= 0) return fail('suggestionId required');

  const round = await getRoundById(db, id);
  if (!round) return fail('Round not found', 404);
  const meeting = await getMeetingById(db, id);
  if (!meeting) return fail('This round has no public meeting record yet. Save the round event basics first.', 409);
  const suggestion = await getSuggestionById(db, suggestionId);
  if (!suggestion) return fail('Suggestion not found', 404);
  if (Number(suggestion.round_id) !== id) return fail('Suggestion belongs to a different round');

  // Reuse the existing game row when re-promoting so we do not pile up rows.
  const gameInput = gameInputFromSuggestion(suggestion);
  if (meeting.selected_game_id != null) gameInput.id = meeting.selected_game_id;
  const gameId = await upsertGame(db, gameInput);
  await attachGameToMeeting(db, id, gameId, suggestionId);

  const sets = ['winner_suggestion_id = ?'];
  const vals = [suggestionId];
  let nextPhase = round.phase;
  if (round.phase !== 'closed' && round.phase !== 'revealed') {
    sets.push('phase = ?');
    vals.push('revealed');
    nextPhase = 'revealed';
  }
  vals.push(id);
  await db.prepare('UPDATE rounds SET ' + sets.join(', ') + ' WHERE id = ?').bind(...vals).run();
  await setMeetingStatus(db, id, phaseToMeetingStatus(nextPhase));

  return json({ ok: true, gameId });
}

// Edit the selected game's metadata and the localized event/history copy.
async function adminPatchMeeting(db, request, id) {
  if (!Number.isInteger(id) || id <= 0) return fail('Invalid meeting id');
  const body = await readJson(request);
  if (!body) return fail('Invalid body');
  const meeting = await getMeetingById(db, id);
  if (!meeting) return fail('Meeting not found', 404);

  const gameKeys = [
    'title', 'image', 'storeUrl', 'price', 'genres', 'platforms',
    'gogUrl', 'gogId', 'hltbUrl', 'playtimeHours', 'descriptionDa', 'descriptionEn',
  ];
  const copyKeys = ['eventDescriptionDa', 'eventDescriptionEn', 'historyDescriptionDa', 'historyDescriptionEn'];
  const touchesGame = hasAny(body, gameKeys);
  const touchesCopy = hasAny(body, copyKeys);
  if (!touchesGame && !touchesCopy) return fail('Nothing to update');

  if (touchesGame) {
    if (meeting.selected_game_id == null) return fail('Select a winning game before editing game details', 409);
    const existing = await getGameById(db, meeting.selected_game_id);
    if (!existing) return fail('Selected game record missing', 404);
    const input = gameRowToInput(existing);
    if (body.title !== undefined) input.title = clean(body.title, 200) || existing.title;
    if (body.image !== undefined) input.image = clean(body.image, 400) || null;
    if (body.storeUrl !== undefined) input.storeUrl = clean(body.storeUrl, 400) || null;
    if (body.price !== undefined) input.price = clean(body.price, 60) || null;
    if (body.genres !== undefined) input.genres = clean(body.genres, 200) || null;
    if (body.platforms !== undefined) input.platforms = clean(body.platforms, 160) || null;
    if (body.gogUrl !== undefined) input.gogUrl = clean(body.gogUrl, 300) || null;
    if (body.gogId !== undefined) input.gogId = clean(body.gogId, 80) || null;
    if (body.hltbUrl !== undefined) input.hltbUrl = clean(body.hltbUrl, 300) || null;
    if (body.playtimeHours !== undefined) {
      if (body.playtimeHours === '' || body.playtimeHours === null) input.playtimeHours = null;
      else {
        const n = Number(body.playtimeHours);
        if (!Number.isFinite(n)) return fail('Invalid playtime');
        input.playtimeHours = Math.round(n);
      }
    }
    if (body.descriptionDa !== undefined) input.descriptionDa = clean(body.descriptionDa, 2000) || null;
    if (body.descriptionEn !== undefined) input.descriptionEn = clean(body.descriptionEn, 2000) || null;
    await upsertGame(db, input);
  }

  if (touchesCopy) {
    const existingCopy = await getMeetingCopy(db, id);
    if (hasAny(body, ['eventDescriptionDa', 'historyDescriptionDa'])) {
      await upsertMeetingCopy(db, id, 'da', {
        eventDescription: body.eventDescriptionDa !== undefined ? clean(body.eventDescriptionDa, 2000) : existingCopy.da.eventDescription,
        historyDescription: body.historyDescriptionDa !== undefined ? clean(body.historyDescriptionDa, 2000) : existingCopy.da.historyDescription,
      });
    }
    if (hasAny(body, ['eventDescriptionEn', 'historyDescriptionEn'])) {
      await upsertMeetingCopy(db, id, 'en', {
        eventDescription: body.eventDescriptionEn !== undefined ? clean(body.eventDescriptionEn, 2000) : existingCopy.en.eventDescription,
        historyDescription: body.historyDescriptionEn !== undefined ? clean(body.historyDescriptionEn, 2000) : existingCopy.en.historyDescription,
      });
    }
  }

  const refreshed = await getMeetingById(db, id);
  const gameRow = refreshed && refreshed.selected_game_id != null ? await getGameById(db, refreshed.selected_game_id) : null;
  const copy = await getMeetingCopy(db, id);
  return json({ ok: true, publishReadiness: meetingPublishReadiness(refreshed, gameRow, copy) });
}

function meetingFromInput(body, round, existing = null) {
  const timeZone = clean(body.timezone, 80) || (existing && existing.timezone) || DEFAULT_MEETING_TIMEZONE;
  const meetingDate = round.meetingDate || (existing && cleanDateOnly(existing.meeting_date));
  const startTime = cleanTimeOnly(
    body.meetingStartTime !== undefined
      ? body.meetingStartTime
      : existing
        ? timeOnlyInZone(existing.starts_at_utc, timeZone)
        : '18:30'
  );
  const endTime = cleanTimeOnly(
    body.meetingEndTime !== undefined
      ? body.meetingEndTime
      : existing
        ? timeOnlyInZone(existing.ends_at_utc, timeZone)
        : '21:00'
  );
  const venueName = clean(
    body.venueName !== undefined ? body.venueName : existing ? existing.venue_name : DEFAULT_VENUE_NAME,
    160
  );
  const venueAddress = clean(
    body.venueAddress !== undefined ? body.venueAddress : existing ? existing.venue_address : DEFAULT_VENUE_ADDRESS,
    240
  );
  const discordInvite = clean(
    body.discordInvite !== undefined ? body.discordInvite : existing ? existing.discord_invite : DEFAULT_DISCORD_INVITE,
    300
  );

  if (!meetingDate) return { error: 'Meeting date required for public meeting record' };
  if (!startTime) return { error: 'Meeting start time required' };
  if (!endTime) return { error: 'Meeting end time required' };
  if (!venueName) return { error: 'Venue name required' };

  const range = meetingUtcRange(meetingDate, startTime, endTime, timeZone);
  if (!range.startsAtUtc || !range.endsAtUtc) return { error: 'Could not build meeting start/end time' };

  return {
    value: {
      id: round.id,
      meetingDate,
      startsAtUtc: range.startsAtUtc,
      endsAtUtc: range.endsAtUtc,
      timezone: timeZone,
      venueName,
      venueAddress,
      discordInvite,
      status: phaseToMeetingStatus(round.phase),
    },
  };
}

async function adminPatchSuggestion(db, request, id) {
  if (!Number.isInteger(id)) return fail('Invalid id');
  await ensureSuggestionDescriptionColumns(db);
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
  if (body.descriptionDa !== undefined) put('description_da', clean(body.descriptionDa, 1000));
  if (body.descriptionEn !== undefined) put('description_en', clean(body.descriptionEn, 1000));
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
