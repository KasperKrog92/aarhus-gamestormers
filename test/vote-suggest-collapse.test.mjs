import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('suggestion form is a closed disclosure tied to the current meeting', async () => {
  const source = await readFile('js/vote.js', 'utf8');
  const css = await readFile('css/style.css', 'utf8');

  assert.match(source, /meetingFor/);
  assert.match(source, /function roundLabel/);
  assert.match(source, /function meetingBadge/);
  assert.match(source, /vote-meeting/);
  assert.match(source, /vote-disclosure/);
  assert.match(source, /'aria-expanded': 'false'/);
  assert.match(source, /panel\.hidden = true/);
  assert.match(source, /function renderSuggestionList/);
  assert.match(source, /function addApprovedSuggestion/);
  assert.match(source, /if \(!res\.pending\) addApprovedSuggestion\(res\.game\)/);
  assert.match(source, /Foresl[aå] nyt spil/);
  assert.match(source, /Suggest new game/);
  assert.doesNotMatch(source, /sendt til godkendelse/);
  assert.doesNotMatch(source, /sent for approval/);
  assert.match(source, /tilf[oø]jet til forslagene/);
  assert.match(source, /added to the suggestions/);
  assert.match(source, /renderVoting[\s\S]*meetingBadge\(data\.round\)/);
  assert.match(source, /renderRevealed[\s\S]*meetingBadge\(data\.round\)/);

  assert.match(css, /\.vote-meeting/);
  assert.match(css, /\.vote-disclosure/);
  assert.match(css, /\.vote-disclosure-chevron/);
});
