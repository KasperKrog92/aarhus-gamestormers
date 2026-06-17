// Winner promotion planning and maintainer handoff for the voting scheduler.
//
// Two responsibilities, both kept free of network/D1 access so they stay easy to
// test:
//
//   winnerPublicationPlan()  decide whether automation may safely call the
//                            selected-game promotion endpoint, given the current
//                            admin round payload. Promotion publishes the meeting
//                            card immediately through /api/meetings/public, so we
//                            only allow it when the card is already publish-ready.
//   buildHandoffMarkdown()   render a maintainer-facing Markdown brief listing
//                            the winner details and every manual field still
//                            needed before publishing.
//
// Safety path (plan Task 7): we keep promotion manual unless the selected game is
// already publish-ready, instead of adding a draft/not-public mode to the select
// endpoint. A game freshly copied from a suggestion can never be publish-ready on
// its own (it always lacks a HowLongToBeat URL, which needs human review), so in
// the normal reveal flow the scheduler reveals the winner, writes this handoff,
// and leaves homepage publication to MEETING_WORKFLOW.md.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

// Decide what the scheduler may do with the revealed winner. Pure: pass the admin
// round payload (round, meeting, selectedGame, meetingCopy, publishReadiness,
// suggestions, tallies) and the intended winner id; get back a plan the runner
// acts on. When winnerSuggestionId is omitted we fall back to the round's
// recorded winner_suggestion_id so a re-run can re-derive the plan.
export function winnerPublicationPlan({ roundPayload, winnerSuggestionId } = {}) {
  const payload = roundPayload || {};
  const round = payload.round || null;
  const meeting = payload.meeting || null;
  const readiness = payload.publishReadiness || null;

  const roundId = round ? numberOrNull(round.id) : null;
  const selectedWinnerId = round ? numberOrNull(round.winner_suggestion_id) : null;
  const winnerId = numberOrNull(winnerSuggestionId) ?? selectedWinnerId;

  const hasMeetingRecord = Boolean(meeting);
  const hasSelectedGame = Boolean(meeting && meeting.hasSelectedGame);
  const winnerAlreadySelected =
    hasSelectedGame && winnerId != null && selectedWinnerId === winnerId;
  const publishReady = Boolean(readiness && readiness.ready);
  const missing = readiness && Array.isArray(readiness.missing) ? readiness.missing.slice() : [];

  // A different suggestion is already attached as the winner. Never overwrite it
  // automatically; the maintainer has to resolve the mismatch.
  const conflict =
    hasSelectedGame &&
    winnerId != null &&
    selectedWinnerId != null &&
    selectedWinnerId !== winnerId;

  let mayPromote = false;
  let reason;
  if (winnerId == null) {
    reason = 'No winning suggestion id to promote.';
  } else if (conflict) {
    reason = `A different suggestion (#${selectedWinnerId}) is already selected as the winner; resolve the mismatch manually.`;
  } else if (!hasMeetingRecord) {
    reason = 'No public meeting record exists yet; create the meeting before promoting.';
  } else if (winnerAlreadySelected && publishReady) {
    // The only state where post-promotion readiness is guaranteed: the game is
    // already attached and complete, so calling select again is a safe, idempotent
    // re-confirm of an already-public card.
    mayPromote = true;
    reason = 'Winner is selected and the meeting card is publish-ready; promotion is safe and idempotent.';
  } else if (winnerAlreadySelected) {
    reason = `Winner is selected but the meeting card is missing manual fields (${missing.join(', ') || 'unknown'}); leaving publication manual.`;
  } else {
    reason = 'Winner is not promoted yet; promoting now would publish an incomplete card, so publication stays manual.';
  }

  return {
    roundId,
    winnerSuggestionId: winnerId,
    hasMeetingRecord,
    hasSelectedGame,
    winnerAlreadySelected,
    conflict,
    publishReady,
    missing,
    mayPromote,
    // A handoff is worth generating whenever the card is not yet publish-ready
    // (which includes the not-yet-promoted reveal flow) or there is a conflict to
    // flag for the maintainer.
    needsHandoff: conflict || !publishReady,
    reason,
  };
}

function trimTrailingSlashes(value) {
  return String(value || '').replace(/\/+$/, '');
}

function voteUrl(baseUrl) {
  return `${trimTrailingSlashes(baseUrl)}/vote`;
}

// "15 September 2026" from a YYYY-MM-DD string; '' when missing/invalid.
function formatMeetingDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function findSuggestion(suggestions, id) {
  return (suggestions || []).find((s) => s && numberOrNull(s.id) === id) || null;
}

// Rank tallies ({ [suggestionId]: votes }) high to low for the handoff summary.
function rankTallies(tallies, suggestions) {
  return Object.entries(tallies || {})
    .map(([id, votes]) => {
      const numId = numberOrNull(id);
      const match = findSuggestion(suggestions, numId);
      return { id: numId, votes: Number(votes) || 0, title: (match && match.title) || `#${numId}` };
    })
    .filter((entry) => entry.id != null)
    .sort((a, b) => b.votes - a.votes || a.id - b.id);
}

function line(label, value) {
  return `- ${label}: ${value || '(not set)'}`;
}

// Build the maintainer handoff Markdown for one revealed round. Pulls winner
// details from the winning suggestion, preferring the curated selectedGame fields
// when promotion has already copied the suggestion into `games`. Pitch and
// suggested-by only exist on the suggestion.
export function buildHandoffMarkdown({ roundPayload, winnerSuggestionId, plan, baseUrl } = {}) {
  const payload = roundPayload || {};
  const round = payload.round || null;
  const meeting = payload.meeting || null;
  const game = payload.selectedGame || null;
  const meetingCopy = payload.meetingCopy || null;
  const suggestions = payload.suggestions || [];

  const resolvedPlan = plan || winnerPublicationPlan({ roundPayload: payload, winnerSuggestionId });
  const winnerId = resolvedPlan.winnerSuggestionId;
  const winner = findSuggestion(suggestions, winnerId);

  const pick = (gameKey, suggestionKey) =>
    (game && game[gameKey]) || (winner && winner[suggestionKey]) || '';

  const meetingNumber = round ? numberOrNull(round.id) : resolvedPlan.roundId;
  const meetingTitle = (round && round.title) || '';
  const meetingDateIso = (round && round.meeting_date) || (meeting && meeting.meetingDate) || '';
  const meetingDate = formatMeetingDate(meetingDateIso);

  const title = pick('title', 'title') || (winnerId != null ? `suggestion #${winnerId}` : '');
  const steamAppId = pick('steamAppId', 'steam_appid');
  const storeUrl = pick('storeUrl', 'store_url');
  const gogUrl = pick('gogUrl', 'gog_url');
  const image = pick('image', 'header_image');
  const genres = pick('genres', 'genres');
  const platforms = pick('platforms', 'platforms');
  const pitch = (winner && winner.pitch) || '';
  const suggestedBy = (winner && winner.suggested_by) || '';

  const hltbUrl = (game && game.hltbUrl) || '';
  const daDescription =
    (meetingCopy && meetingCopy.da && meetingCopy.da.eventDescription) ||
    (game && game.descriptionDa) ||
    (winner && winner.description_da) ||
    '';
  const enDescription =
    (meetingCopy && meetingCopy.en && meetingCopy.en.eventDescription) ||
    (game && game.descriptionEn) ||
    (winner && winner.description_en) ||
    '';

  const ranked = rankTallies(payload.tallies, suggestions);

  const lines = [];
  lines.push(`# Winner handoff: meeting #${meetingNumber ?? '?'}`);
  lines.push('');
  lines.push('Generated by the voting automation. This meeting card is not published automatically.');
  lines.push('Finish publishing with the steps in `MEETING_WORKFLOW.md`.');
  lines.push('');
  lines.push(`Plan status: ${resolvedPlan.reason}`);
  lines.push('');

  lines.push('## Meeting');
  lines.push(line('Meeting number', meetingNumber != null ? String(meetingNumber) : ''));
  lines.push(line('Title', meetingTitle));
  lines.push(line('Date', meetingDate || meetingDateIso));
  lines.push('');

  lines.push('## Winner');
  lines.push(line('Game', title));
  lines.push(line('Steam app ID', steamAppId));
  lines.push(line('Steam store URL', storeUrl));
  if (gogUrl) lines.push(line('GOG URL', gogUrl));
  lines.push(line('Banner image URL', image));
  lines.push(line('Genres', genres));
  lines.push(line('Platforms', platforms));
  lines.push(line('Suggested by', suggestedBy));
  lines.push(line('Pitch', pitch));
  lines.push('');

  lines.push('## Vote tally');
  if (ranked.length === 0) {
    lines.push('- No votes were recorded.');
  } else {
    for (const entry of ranked) {
      const marker = entry.id === winnerId ? ' (winner)' : '';
      lines.push(`- ${entry.title}: ${entry.votes} vote${entry.votes === 1 ? '' : 's'}${marker}`);
    }
  }
  lines.push('');

  lines.push('## Still needed before publishing');
  if (resolvedPlan.missing.length === 0 && resolvedPlan.publishReady) {
    lines.push('- Nothing outstanding; the meeting card is publish-ready.');
  } else if (resolvedPlan.missing.length === 0) {
    lines.push('- Promote the winner into the meeting record (no selected game yet).');
  } else {
    for (const item of resolvedPlan.missing) lines.push(`- ${item}`);
  }
  lines.push('');

  // These two always need human review (the project never fetches HowLongToBeat
  // automatically and localized copy is hand-written), so remind whenever the
  // corresponding field is still empty.
  const reminders = [];
  if (!hltbUrl) {
    reminders.push('HowLongToBeat link and hours are not fetched automatically. Ask the maintainer for the link and main-story hours.');
  }
  if (!daDescription) reminders.push('Danish event description still needs human review.');
  if (!enDescription) reminders.push('English event description still needs human review.');
  if (reminders.length) {
    lines.push('## Reminders');
    for (const reminder of reminders) lines.push(`- ${reminder}`);
    lines.push('');
  }

  lines.push('## Checklist');
  lines.push('- [ ] Promote the winner into the meeting record (admin vote page) if not already done.');
  lines.push('- [ ] Add the HowLongToBeat URL and main-story hours.');
  lines.push('- [ ] Review the Danish and English event descriptions.');
  lines.push('- [ ] Confirm genres, platforms, store links, and banner image.');
  lines.push('- [ ] Follow `MEETING_WORKFLOW.md` to finish publishing.');
  lines.push(`- [ ] Verify the public vote results at ${voteUrl(baseUrl)}.`);
  lines.push('');

  return lines.join('\n');
}

// Workflow-relative path the handoff artifact is written to. Kept stable so the
// GitHub Actions workflow can upload `automation-output/**` as an artifact.
export function handoffArtifactPath(roundId, { outputDir = 'automation-output' } = {}) {
  return path.posix.join(outputDir, `meeting-${numberOrNull(roundId) ?? 'unknown'}-winner.md`);
}

// Write the handoff Markdown to the workflow output directory and return the
// path. fs hooks are injectable for tests; the scheduled workflow must NOT commit
// this file, only upload it as an artifact.
export async function writeHandoff(
  markdown,
  { roundId, outputDir = 'automation-output', fs = { mkdir, writeFile } } = {}
) {
  const filePath = handoffArtifactPath(roundId, { outputDir });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, markdown, 'utf8');
  return filePath;
}
