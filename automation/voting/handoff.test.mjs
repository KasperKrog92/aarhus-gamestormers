import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHandoffMarkdown,
  handoffArtifactPath,
  winnerPublicationPlan,
  writeHandoff,
} from './handoff.mjs';

const BASE = 'https://www.gamestormers.dk';

const WINNER_SUGGESTION = {
  id: 101,
  title: 'Hollow Knight',
  steam_appid: '367520',
  store_url: 'https://store.steampowered.com/app/367520/',
  gog_url: 'https://www.gog.com/game/hollow_knight',
  header_image: 'https://cdn.example/hollow-knight.jpg',
  genres: 'Metroidvania, Action',
  platforms: 'Windows, macOS, Linux',
  pitch: 'A gorgeous hand-drawn adventure.',
  suggested_by: 'Kasper',
  description_da: '',
  description_en: '',
};

const SUGGESTIONS = [
  WINNER_SUGGESTION,
  { id: 102, title: 'Celeste' },
  { id: 103, title: 'Outer Wilds' },
];

// A round that has been revealed but not yet promoted into the meeting card.
function revealPayload(overrides = {}) {
  return {
    round: {
      id: 19,
      title: 'September meeting',
      meeting_date: '2026-09-15',
      phase: 'revealed',
      winner_suggestion_id: null,
    },
    meeting: { id: 19, meetingDate: '2026-09-15', hasSelectedGame: false },
    selectedGame: null,
    meetingCopy: { da: { eventDescription: '' }, en: { eventDescription: '' } },
    publishReadiness: { ready: false, missing: ['selected game'] },
    suggestions: SUGGESTIONS,
    tallies: { 101: 5, 102: 3, 103: 4 },
    ...overrides,
  };
}

// A round whose winner has already been promoted into a complete meeting card.
function promotedPayload(overrides = {}) {
  return {
    round: { id: 19, title: 'September meeting', meeting_date: '2026-09-15', phase: 'revealed', winner_suggestion_id: 101 },
    meeting: { id: 19, meetingDate: '2026-09-15', hasSelectedGame: true },
    selectedGame: {
      id: 5,
      title: 'Hollow Knight',
      steamAppId: '367520',
      storeUrl: 'https://store.steampowered.com/app/367520/',
      gogUrl: 'https://www.gog.com/game/hollow_knight',
      image: 'https://cdn.example/hollow-knight.jpg',
      genres: 'Metroidvania, Action',
      platforms: 'Windows, macOS, Linux',
      hltbUrl: 'https://howlongtobeat.com/game/26606',
      descriptionDa: 'Dansk beskrivelse.',
      descriptionEn: 'English description.',
    },
    meetingCopy: {
      da: { eventDescription: 'Dansk beskrivelse.' },
      en: { eventDescription: 'English description.' },
    },
    publishReadiness: { ready: true, missing: [] },
    suggestions: SUGGESTIONS,
    tallies: { 101: 5, 102: 3, 103: 4 },
    ...overrides,
  };
}

test('plan: reveal-flow winner is not auto-promotable and needs a handoff', () => {
  const plan = winnerPublicationPlan({ roundPayload: revealPayload(), winnerSuggestionId: 101 });
  assert.equal(plan.roundId, 19);
  assert.equal(plan.winnerSuggestionId, 101);
  assert.equal(plan.hasSelectedGame, false);
  assert.equal(plan.winnerAlreadySelected, false);
  assert.equal(plan.mayPromote, false);
  assert.equal(plan.needsHandoff, true);
  assert.match(plan.reason, /not promoted yet/);
});

test('plan: a selected, publish-ready winner is safely promotable and needs no handoff', () => {
  const plan = winnerPublicationPlan({ roundPayload: promotedPayload(), winnerSuggestionId: 101 });
  assert.equal(plan.winnerAlreadySelected, true);
  assert.equal(plan.publishReady, true);
  assert.equal(plan.mayPromote, true);
  assert.equal(plan.needsHandoff, false);
});

test('plan: a selected winner with missing manual fields is not promotable and needs a handoff', () => {
  const payload = promotedPayload({
    publishReadiness: { ready: false, missing: ['HowLongToBeat URL', 'English event description'] },
  });
  const plan = winnerPublicationPlan({ roundPayload: payload, winnerSuggestionId: 101 });
  assert.equal(plan.winnerAlreadySelected, true);
  assert.equal(plan.mayPromote, false);
  assert.equal(plan.needsHandoff, true);
  assert.deepEqual(plan.missing, ['HowLongToBeat URL', 'English event description']);
  assert.match(plan.reason, /missing manual fields/);
});

test('plan: a different already-selected suggestion is flagged as a conflict', () => {
  const payload = promotedPayload({
    round: { id: 19, meeting_date: '2026-09-15', winner_suggestion_id: 102 },
  });
  const plan = winnerPublicationPlan({ roundPayload: payload, winnerSuggestionId: 101 });
  assert.equal(plan.conflict, true);
  assert.equal(plan.mayPromote, false);
  assert.equal(plan.needsHandoff, true);
  assert.match(plan.reason, /#102/);
});

test('plan: no public meeting record blocks promotion', () => {
  const plan = winnerPublicationPlan({
    roundPayload: revealPayload({ meeting: null }),
    winnerSuggestionId: 101,
  });
  assert.equal(plan.hasMeetingRecord, false);
  assert.equal(plan.mayPromote, false);
  assert.match(plan.reason, /no public meeting record/i);
});

test('plan: falls back to the round winner_suggestion_id when none is passed', () => {
  const plan = winnerPublicationPlan({ roundPayload: promotedPayload() });
  assert.equal(plan.winnerSuggestionId, 101);
  assert.equal(plan.mayPromote, true);
});

test('markdown: includes meeting, winner, tally, missing fields, reminders, and checklist', () => {
  const md = buildHandoffMarkdown({ roundPayload: revealPayload(), winnerSuggestionId: 101, baseUrl: BASE });

  // Meeting + winner details
  assert.match(md, /# Winner handoff: meeting #19/);
  assert.match(md, /September meeting/);
  assert.match(md, /15 September 2026/);
  assert.match(md, /Game: Hollow Knight/);
  assert.match(md, /Steam app ID: 367520/);
  assert.match(md, /Steam store URL: https:\/\/store\.steampowered\.com\/app\/367520\//);
  assert.match(md, /GOG URL: https:\/\/www\.gog\.com\/game\/hollow_knight/);
  assert.match(md, /Banner image URL: https:\/\/cdn\.example\/hollow-knight\.jpg/);
  assert.match(md, /Genres: Metroidvania, Action/);
  assert.match(md, /Platforms: Windows, macOS, Linux/);
  assert.match(md, /Suggested by: Kasper/);
  assert.match(md, /Pitch: A gorgeous hand-drawn adventure\./);

  // Tally sorted high to low with a winner marker
  assert.match(md, /- Hollow Knight: 5 votes \(winner\)/);
  assert.match(md, /- Outer Wilds: 4 votes/);
  assert.match(md, /- Celeste: 3 votes/);
  assert.ok(md.indexOf('Outer Wilds: 4 votes') < md.indexOf('Celeste: 3 votes'));

  // Missing fields + reminders + checklist
  assert.match(md, /Still needed before publishing/);
  assert.match(md, /HowLongToBeat link and hours are not fetched automatically/);
  assert.match(md, /Danish event description still needs human review/);
  assert.match(md, /English event description still needs human review/);
  assert.match(md, /MEETING_WORKFLOW\.md/);
  assert.match(md, /https:\/\/www\.gamestormers\.dk\/vote/);

  // No em dashes in agent-authored prose
  assert.ok(!md.includes('—'), 'handoff markdown should not contain em dashes');
});

test('markdown: omits the GOG line when the winner has no GOG URL', () => {
  const payload = revealPayload({
    suggestions: [{ ...WINNER_SUGGESTION, gog_url: '' }, ...SUGGESTIONS.slice(1)],
  });
  const md = buildHandoffMarkdown({ roundPayload: payload, winnerSuggestionId: 101, baseUrl: BASE });
  assert.doesNotMatch(md, /GOG URL/);
});

test('markdown: prefers the curated selected game and drops reminders once ready', () => {
  const md = buildHandoffMarkdown({ roundPayload: promotedPayload(), winnerSuggestionId: 101, baseUrl: BASE });
  assert.match(md, /Nothing outstanding; the meeting card is publish-ready\./);
  assert.doesNotMatch(md, /HowLongToBeat link and hours are not fetched automatically/);
  assert.doesNotMatch(md, /still needs human review/);
});

test('markdown: reports when no votes were recorded', () => {
  const md = buildHandoffMarkdown({ roundPayload: revealPayload({ tallies: {} }), winnerSuggestionId: 101, baseUrl: BASE });
  assert.match(md, /- No votes were recorded\./);
});

test('handoffArtifactPath uses the stable automation-output path', () => {
  assert.equal(handoffArtifactPath(19), 'automation-output/meeting-19-winner.md');
  assert.equal(handoffArtifactPath('unknown'), 'automation-output/meeting-unknown-winner.md');
});

test('writeHandoff writes through injected fs hooks', async () => {
  const calls = { mkdir: [], writeFile: [] };
  const fs = {
    mkdir: async (dir, opts) => calls.mkdir.push({ dir, opts }),
    writeFile: async (file, data, enc) => calls.writeFile.push({ file, data, enc }),
  };
  const filePath = await writeHandoff('# hello', { roundId: 19, fs });
  assert.equal(filePath, 'automation-output/meeting-19-winner.md');
  assert.deepEqual(calls.mkdir[0], { dir: 'automation-output', opts: { recursive: true } });
  assert.equal(calls.writeFile[0].file, 'automation-output/meeting-19-winner.md');
  assert.equal(calls.writeFile[0].data, '# hello');
  assert.equal(calls.writeFile[0].enc, 'utf8');
});
