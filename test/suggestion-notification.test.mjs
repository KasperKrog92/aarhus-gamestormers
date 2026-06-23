import assert from 'node:assert/strict';
import test from 'node:test';

import { suggestionNotification } from '../functions/api/suggest.js';

const user = { username: 'Kasper' };
const voteLink = '[Check it out on the vote page and suggest your own game](https://www.gamestormers.dk/vote)';

test('approved suggestion notification includes the opt-in Discord name, pitch, and labelled vote link', () => {
  assert.equal(
    suggestionNotification({
      title: 'Outer Wilds',
      pitch: 'A wonderful space mystery.',
      user,
      showName: true,
    }),
    `New suggestion: **Outer Wilds**\nSuggested by: Kasper\nPitch: A wonderful space mystery.\n${voteLink}`
  );
});

test('suggestion notification hides the Discord name when the suggester opted out', () => {
  const message = suggestionNotification({
    title: 'Outer Wilds',
    pitch: 'A wonderful space mystery.',
    user,
    showName: false,
  });

  assert.doesNotMatch(message, /Kasper/);
  assert.match(message, new RegExp(voteLink.replace(/[()[\].?+*^$\\|]/g, '\\$&')));
});

test('pending suggestion notification preserves the admin review link', () => {
  const message = suggestionNotification({
    title: 'Myst',
    pitch: '',
    user,
    showName: true,
    pending: true,
  });

  assert.match(message, /New suggestion needs your approval/);
  assert.match(message, /\[Review it in vote admin\]\(https:\/\/www\.gamestormers\.dk\/vote-admin\/\)/);
});
