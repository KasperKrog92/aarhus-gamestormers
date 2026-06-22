// Admin API — catch-all for /api/admin/*. Every request requires
// Authorization: Bearer <ADMIN_TOKEN>. Used by vote-admin.html.
//
//   GET    /api/admin/round            full current round + suggestions + aggregate results
//   POST   /api/admin/round            open a new round and matching public meeting
//   PATCH  /api/admin/round            update current round and matching public meeting basics
//   PATCH  /api/admin/suggestion/:id   edit/approve/reject a suggestion
//   DELETE /api/admin/suggestion/:id   delete a suggestion
//   DELETE /api/admin/ballot/:ballotId remove a single ballot (all its votes)
import { json, fail, readJson, clean, cleanLine } from '../../_lib/http.js';
import { isAdmin } from '../../_lib/auth.js';
import {
  deleteDiscordMessage,
  postDiscord,
  winnerAnnouncementFromPayload,
} from '../../../automation/voting/discord.mjs';
import {
  ensureRoundScheduleColumns,
  ensureMeetingContentTables,
  ensureSuggestionDescriptionColumns,
  ensureVoteRankColumn,
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
  getAutomationEvents,
  recordAutomationEvent,
} from '../../_lib/db.js';
import { runIrv } from '../../_lib/rcv.js';
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
const AUTOMATION_EVENT_TYPES = [
  'suggestions_opened',
  'voting_opened',
  'winner_revealed',
  'blocked_alerted',
  'winner_setup_needed_alerted',
  'winner_announcement_posted',
  'handoff_generated',
];
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
  await ensureVoteRankColumn(db);
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
    } else if (action === 'announce-winner') {
      if (method === 'POST') return adminAnnounceWinner(db, request, env, Number(id));
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
  if (resource === 'automation-event' && !id) {
    if (method === 'POST') return adminRecordAutomationEvent(db, request);
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
  let rcvResult = null;
  if (ballots.length === 0) {
    rcvResult = runIrv({
      ballots: [],
      candidateIds: suggestions.filter((suggestion) => suggestion.status === 'approved').map((suggestion) => suggestion.id),
    });
  } else {
    const rankedMarker = await db
      .prepare('SELECT 1 AS has_ranked_ballots FROM votes WHERE round_id = ? AND rank IS NOT NULL LIMIT 1')
      .bind(round.id)
      .first();
    if (rankedMarker) {
      rcvResult = runIrv({
        ballots: ballots.map((ballot) => ballot.rankings),
        candidateIds: suggestions.filter((suggestion) => suggestion.status === 'approved').map((suggestion) => suggestion.id),
      });
    }
  }
  const automationEvents = await getAutomationEvents(db, round.id);
  const meetingRow = await getMeetingById(db, round.id);
  const gameRow = meetingRow && meetingRow.selected_game_id != null ? await getGameById(db, meetingRow.selected_game_id) : null;
  const meetingCopy = meetingRow ? await getMeetingCopy(db, round.id) : null;
  return {
    round,
    meeting: toAdminMeeting(meetingRow),
    selectedGame: toAdminGame(gameRow),
    meetingCopy,
    publishReadiness: meetingPublishReadiness(meetingRow, gameRow, meetingCopy),
    announcementReadiness: winnerAnnouncementReadiness(meetingRow, gameRow, meetingCopy),
    suggestions,
    tallies,
    rcvResult,
    ballots,
    automationEvents,
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
      announcementReadiness: null,
      suggestions: [],
      tallies: {},
      rcvResult: null,
      ballots: [],
      automationEvents: [],
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
  // Delete the voting round and (via ON DELETE CASCADE) its suggestions and
  // votes. The matching public `meetings` row is removed ONLY when it has not
  // reached the front page yet, i.e. no game has been selected
  // (selected_game_id IS NULL). A meeting with a selected game is already shown
  // as an upcoming/history card, so it is kept; cancelling or removing a
  // published meeting is handled separately. The `selected_game_id IS NULL`
  // guard must stay so a published meeting is never deleted here.
  // meeting_copy cascades when an unpublished meeting row is removed.
  // See docs/voting-system.md.
  await db.prepare('DELETE FROM rounds WHERE id = ?').bind(id).run();
  await db.prepare('DELETE FROM meetings WHERE id = ? AND selected_game_id IS NULL').bind(id).run();
  return json({ ok: true });
}

async function adminOpenRound(db, request) {
  const body = await readJson(request);
  if (!body) return fail('Invalid body');
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return fail('Meeting number (id) required');
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
      cleanLine(body.title, 120) || null,
      meetingDate || null,
      null,
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
  if (body.title !== undefined) put('title', cleanLine(body.title, 120));
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
    'discordEventUrl',
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
    discordEventUrl: row.discord_event_url || '',
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

function winnerAnnouncementReadiness(meetingRow, gameRow, copy) {
  const base = meetingPublishReadiness(meetingRow, gameRow, copy);
  const missing = base.missing.slice();
  if (meetingRow && !meetingRow.discord_event_url) missing.push('Discord event URL');
  return { ready: missing.length === 0, missing };
}

function automationEventExists(payload, eventType) {
  return (payload.automationEvents || []).some((event) => event && event.eventType === eventType);
}

function automationEventMessageId(payload, eventType) {
  const event = (payload.automationEvents || []).find((entry) => entry && entry.eventType === eventType);
  return event && event.payload && event.payload.messageId ? String(event.payload.messageId) : null;
}

async function adminAnnounceWinner(db, request, env, id) {
  if (!Number.isInteger(id) || id <= 0) return fail('Invalid round id');
  const round = await getRoundById(db, id);
  if (!round) return fail('Round not found', 404);
  if (round.phase !== 'revealed' && round.phase !== 'closed') {
    return fail('The round must be revealed before posting the Discord reveal.', 409);
  }
  if (!round.winner_suggestion_id) return fail('Choose a winning suggestion before posting the Discord reveal.', 409);

  const payload = await roundPayload(db, round);
  if (automationEventExists(payload, 'winner_announcement_posted')) {
    return json({ ok: true, duplicate: true, posted: false });
  }
  if (!payload.announcementReadiness || !payload.announcementReadiness.ready) {
    const missing = payload.announcementReadiness ? payload.announcementReadiness.missing || [] : ['announcement details'];
    return fail('Winner announcement is missing: ' + missing.join(', '), 409);
  }

  const webhookUrl = clean(env.DISCORD_VOTING_WEBHOOK_URL, 1000);
  if (!webhookUrl) return fail('DISCORD_VOTING_WEBHOOK_URL is not configured for Pages admin.', 500);

  const baseUrl = clean(env.VOTING_BASE_URL, 400) || new URL(request.url).origin;
  const result = await postDiscord(webhookUrl, winnerAnnouncementFromPayload(payload, { baseUrl }), {
    fetch: env.fetch || globalThis.fetch,
  });
  if (!result.posted) return fail('Discord webhook returned status ' + (result.status || 'unknown'), 502);

  const record = await recordAutomationEvent(db, id, 'winner_announcement_posted', {
    source: 'admin',
    status: result.status,
  });

  const previousMessageId = automationEventMessageId(payload, 'voting_opened');
  if (previousMessageId) {
    await deleteDiscordMessage(webhookUrl, previousMessageId, {
      fetch: env.fetch || globalThis.fetch,
    });
  }
  return json({ ok: true, duplicate: record.duplicate, posted: true, status: result.status });
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
    if (body.title !== undefined) input.title = cleanLine(body.title, 200) || existing.title;
    if (body.image !== undefined) input.image = cleanLine(body.image, 400) || null;
    if (body.storeUrl !== undefined) input.storeUrl = cleanLine(body.storeUrl, 400) || null;
    if (body.price !== undefined) input.price = cleanLine(body.price, 60) || null;
    if (body.genres !== undefined) input.genres = cleanLine(body.genres, 200) || null;
    if (body.platforms !== undefined) input.platforms = cleanLine(body.platforms, 160) || null;
    if (body.gogUrl !== undefined) input.gogUrl = cleanLine(body.gogUrl, 300) || null;
    if (body.gogId !== undefined) input.gogId = cleanLine(body.gogId, 80) || null;
    if (body.hltbUrl !== undefined) input.hltbUrl = cleanLine(body.hltbUrl, 300) || null;
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
  const venueName = cleanLine(
    body.venueName !== undefined ? body.venueName : existing ? existing.venue_name : DEFAULT_VENUE_NAME,
    160
  );
  const venueAddress = cleanLine(
    body.venueAddress !== undefined ? body.venueAddress : existing ? existing.venue_address : DEFAULT_VENUE_ADDRESS,
    240
  );
  const discordInvite = cleanLine(
    body.discordInvite !== undefined ? body.discordInvite : existing ? existing.discord_invite : DEFAULT_DISCORD_INVITE,
    300
  );
  const discordEventUrl = cleanLine(
    body.discordEventUrl !== undefined ? body.discordEventUrl : existing ? existing.discord_event_url : '',
    500
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
      discordEventUrl,
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
  if (body.title !== undefined) put('title', cleanLine(body.title, 200));
  if (body.genres !== undefined) put('genres', cleanLine(body.genres, 200));
  if (body.price !== undefined) put('price', cleanLine(body.price, 60));
  if (body.platforms !== undefined) put('platforms', cleanLine(body.platforms, 120));
  if (body.descriptionDa !== undefined) put('description_da', clean(body.descriptionDa, 1000));
  if (body.descriptionEn !== undefined) put('description_en', clean(body.descriptionEn, 1000));
  if (body.pitch !== undefined) put('pitch', clean(body.pitch, 500));
  if (body.suggestedBy !== undefined) put('suggested_by', cleanLine(body.suggestedBy, 80));
  if (body.gogUrl !== undefined) put('gog_url', cleanLine(body.gogUrl, 300) || null);
  if (body.hltbUrl !== undefined) put('hltb_url', cleanLine(body.hltbUrl, 300) || null);
  if (body.image !== undefined) put('header_image', cleanLine(body.image, 400));
  if (body.storeUrl !== undefined) put('store_url', cleanLine(body.storeUrl, 400));
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

// Idempotency log for the GitHub Actions scheduler. Recording an event that
// already exists is not an error: the unique (round_id, event_type) constraint
// makes it a no-op and we report `duplicate: true` so a rerun can skip the
// matching Discord post or handoff without failing the workflow.
async function adminRecordAutomationEvent(db, request) {
  const body = await readJson(request);
  if (!body) return fail('Invalid body');
  const roundId = Number(body.roundId);
  if (!Number.isInteger(roundId) || roundId <= 0) return fail('roundId required');
  const eventType = clean(body.eventType, 40);
  if (!AUTOMATION_EVENT_TYPES.includes(eventType)) return fail('Invalid eventType');
  if (body.payload != null && typeof body.payload !== 'object') return fail('payload must be an object');
  if (!(await getRoundById(db, roundId))) return fail('Round not found', 404);

  const result = await recordAutomationEvent(db, roundId, eventType, body.payload ?? null);
  return json({ ok: true, duplicate: result.duplicate, id: result.id });
}
