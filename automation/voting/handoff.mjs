// Winner promotion planning and maintainer handoff for the voting scheduler.
//
// Two responsibilities, both kept free of network/D1 access so they stay easy to
// test:
//
//   winnerPublicationPlan()  decide whether automation may safely call the
//                            selected-game promotion endpoint, given the current
//                            admin round payload. Promotion publishes the meeting
//                            card immediately through /api/meetings/public, so we
//                            only allow it when the existing or projected card is
//                            publish-ready.
//   buildHandoffMarkdown()   render a maintainer-facing Markdown brief listing
//                            the winner details and every manual field still
//                            needed before publishing.
//
// Safety path (plan Task 7): we keep promotion automatic only when the selected
// game is already publish-ready or when the winning suggestion can be copied into
// a publish-ready card. A game freshly copied from a suggestion can still lack
// manual fields such as HowLongToBeat data or localized copy, so the normal
// incomplete reveal flow writes this handoff and leaves homepage publication to
// MEETING_WORKFLOW.md.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function addMissing(missing, label) {
  if (!missing.includes(label)) missing.push(label);
}

function winnerSuggestionMissingFields(suggestion) {
  if (!suggestion) return ['winning suggestion'];
  const missing = [];
  if (!suggestion.title) missing.push('title');
  if (!suggestion.header_image) missing.push('cover image');
  if (!suggestion.store_url && !suggestion.gog_url) missing.push('store link');
  if (!suggestion.genres) missing.push('genres');
  if (!suggestion.platforms) missing.push('platforms');
  if (suggestion.playtime_hours == null || suggestion.playtime_hours === '') missing.push('playtime hours');
  if (!suggestion.hltb_url) missing.push('HowLongToBeat URL');
  if (!suggestion.description_da) missing.push('Danish event description');
  if (!suggestion.description_en) missing.push('English event description');
  return missing;
}

function findSuggestion(suggestions, id) {
  return (suggestions || []).find((s) => s && numberOrNull(s.id) === id) || null;
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
  const selectedGame = payload.selectedGame || null;
  const readiness = payload.publishReadiness || null;
  const suggestions = payload.suggestions || [];

  const roundId = round ? numberOrNull(round.id) : null;
  const selectedWinnerId = round ? numberOrNull(round.winner_suggestion_id) : null;
  const winnerId = numberOrNull(winnerSuggestionId) ?? selectedWinnerId;

  const hasMeetingRecord = Boolean(meeting);
  const hasSelectedGame = Boolean(meeting && meeting.hasSelectedGame);
  const winnerAlreadySelected =
    hasSelectedGame && winnerId != null && selectedWinnerId === winnerId;
  const missing = readiness && Array.isArray(readiness.missing) ? readiness.missing.slice() : [];
  if (selectedGame) {
    if (selectedGame.playtimeHours == null || selectedGame.playtimeHours === '') addMissing(missing, 'playtime hours');
    if (!selectedGame.hltbUrl) addMissing(missing, 'HowLongToBeat URL');
  }
  const publishReady = Boolean(readiness && readiness.ready && missing.length === 0);
  const projectedMissing = winnerSuggestionMissingFields(findSuggestion(suggestions, winnerId));
  const projectedPublishReady = hasMeetingRecord && !hasSelectedGame && projectedMissing.length === 0;

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
    mayPromote = true;
    reason = 'Winner is selected and the meeting card is publish-ready; promotion is safe and idempotent.';
  } else if (winnerAlreadySelected) {
    reason = `Winner is selected but the meeting card is missing manual fields (${missing.join(', ') || 'unknown'}); leaving publication manual.`;
  } else if (projectedPublishReady) {
    mayPromote = true;
    reason = 'Winning suggestion has all frontpage fields; promotion can publish it automatically.';
  } else {
    reason = `Winner is not promoted yet and is missing frontpage fields (${projectedMissing.join(', ') || 'unknown'}); publication stays manual.`;
  }

  return {
    roundId,
    winnerSuggestionId: winnerId,
    hasMeetingRecord,
    hasSelectedGame,
    winnerAlreadySelected,
    conflict,
    publishReady: publishReady || projectedPublishReady,
    missing: winnerAlreadySelected ? missing : projectedMissing,
    mayPromote,
    // A handoff is worth generating whenever the card is not yet publish-ready
    // (which includes the not-yet-promoted reveal flow) or there is a conflict to
    // flag for the maintainer.
    needsHandoff: conflict || !(publishReady || projectedPublishReady),
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

// Rank approval tallies ({ [suggestionId]: votes }) high to low. Kept for the
// legacy fallback when a historical round has no ranked-choice result.
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

function titleFor(suggestions, id) {
  const match = findSuggestion(suggestions, numberOrNull(id));
  return (match && match.title) || `#${id}`;
}

function plural(n) {
  return n === 1 ? '' : 's';
}

// Votes a candidate held in a given IRV round (0 if not standing that round).
function votesInRound(round, id) {
  const entry = (round.counts || []).find((c) => c.id === id);
  return entry ? entry.votes : 0;
}

// Render the ranked-choice result as Markdown lines: a final standing (winner,
// runners-up, then eliminated games newest-first) followed by a round-by-round
// breakdown. Computed entirely from the aggregate rcvResult; never recounts.
function rcvResultLines(rcvResult, suggestions, winnerId) {
  const rounds = Array.isArray(rcvResult.rounds) ? rcvResult.rounds : [];
  if (rounds.length === 0) return ['- No votes were recorded.'];

  const lines = [];
  const totalBallots = Number(rcvResult.totalBallots) || 0;
  lines.push(`Ranked-choice (instant-runoff) count of ${totalBallots} ballot${plural(totalBallots)}.`);
  lines.push('');

  // Final standing: survivors of the last round (high to low), then eliminated
  // candidates in reverse order of elimination so the last eliminated ranks
  // highest among the eliminated.
  const finalRound = rounds[rounds.length - 1];
  const standing = finalRound.counts.map((entry) => ({
    id: entry.id,
    votes: entry.votes,
    eliminatedRound: null,
  }));
  for (let i = rounds.length - 1; i >= 0; i -= 1) {
    const r = rounds[i];
    if (r.eliminatedId != null) {
      standing.push({ id: r.eliminatedId, votes: votesInRound(r, r.eliminatedId), eliminatedRound: r.round });
    }
  }

  lines.push('Final standing:');
  for (const entry of standing) {
    const marker = entry.id === winnerId
      ? ' (winner)'
      : entry.eliminatedRound != null
        ? ` (eliminated round ${entry.eliminatedRound})`
        : '';
    lines.push(`- ${titleFor(suggestions, entry.id)}: ${entry.votes} vote${plural(entry.votes)}${marker}`);
  }
  lines.push('');

  lines.push('Round-by-round:');
  for (const r of rounds) {
    const counts = r.counts.map((c) => `${titleFor(suggestions, c.id)} ${c.votes}`).join(', ');
    const meta = [`majority ${r.majority} of ${r.activeBallots} active ballot${plural(r.activeBallots)}`];
    if (r.exhausted) meta.push(`${r.exhausted} exhausted`);
    const parts = [`- Round ${r.round} (${meta.join(', ')}): ${counts}.`];
    if (r.winnerId != null) {
      parts.push(`${titleFor(suggestions, r.winnerId)} reached a majority and wins.`);
    } else if (r.eliminatedId != null) {
      parts.push(`Eliminated ${titleFor(suggestions, r.eliminatedId)}.`);
    }
    lines.push(parts.join(' '));
  }

  if (rcvResult.blocked && rcvResult.blocked.reason === 'tie') {
    const names = (rcvResult.blocked.tied || []).map((t) => titleFor(suggestions, t.id)).join(', ');
    lines.push('');
    lines.push(`Final tie between ${names}; pick the winner manually in vote-admin.`);
  }

  return lines;
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

  const hltbUrl = pick('hltbUrl', 'hltb_url');
  const playtimeHours = (game && game.playtimeHours) || (winner && winner.playtime_hours) || '';
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

  const rcvResult = payload.rcvResult || null;
  const hasRcvRounds = Boolean(rcvResult && Array.isArray(rcvResult.rounds) && rcvResult.rounds.length > 0);
  const rcvNoBallots = Boolean(rcvResult && rcvResult.blocked && rcvResult.blocked.reason === 'no_ballots');

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
  lines.push(line('HowLongToBeat URL', hltbUrl));
  lines.push(line('Playtime hours', playtimeHours ? String(playtimeHours) : ''));
  lines.push(line('Suggested by', suggestedBy));
  lines.push(line('Pitch', pitch));
  lines.push('');

  lines.push('## Vote results');
  if (hasRcvRounds) {
    for (const resultLine of rcvResultLines(rcvResult, suggestions, winnerId)) lines.push(resultLine);
  } else if (rcvNoBallots) {
    lines.push('- No votes were recorded.');
  } else {
    // Legacy approval-count fallback for historical rounds without ranked ballots.
    const ranked = rankTallies(payload.tallies, suggestions);
    if (ranked.length === 0) {
      lines.push('- No votes were recorded.');
    } else {
      for (const entry of ranked) {
        const marker = entry.id === winnerId ? ' (winner)' : '';
        lines.push(`- ${entry.title}: ${entry.votes} vote${plural(entry.votes)}${marker}`);
      }
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
  if (!hltbUrl || !playtimeHours) {
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
