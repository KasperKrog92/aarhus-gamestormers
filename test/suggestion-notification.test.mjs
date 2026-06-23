import assert from 'node:assert/strict';
import test from 'node:test';

import { suggestionNotification } from '../functions/api/suggest.js';

const user = { username: 'Kasper', discordId: '123456789012345678' };
const voteLink = '[Check it out on the vote page and suggest your own game](https://www.gamestormers.dk/vote)';
const steamUrl = 'https://store.steampowered.com/app/753640/Outer_Wilds/';

test('approved suggestion notification includes the opt-in Discord name, pitch, and labelled vote link', () => {
  assert.equal(
    suggestionNotification({
      title: 'Outer Wilds',
      steamUrl,
      pitch: 'A wonderful space mystery.',
      user,
      discordId: user.discordId,
      showName: true,
    }),
    `New suggestion: **[Outer Wilds](${steamUrl})**\nSuggested by: <@${user.discordId}>\nPitch: A wonderful space mystery.\n${voteLink}`
  );
});

test('suggestion notification hides the Discord name when the suggester opted out', () => {
  const message = suggestionNotification({
    title: 'Outer Wilds',
    pitch: 'A wonderful space mystery.',
    user,
    discordId: user.discordId,
    showName: false,
  });

  assert.doesNotMatch(message, /Kasper/);
  assert.doesNotMatch(message, new RegExp(user.discordId));
  assert.match(message, new RegExp(voteLink.replace(/[()[\].?+*^$\\|]/g, '\\$&')));
});

test('pending suggestion notification preserves the admin review link', () => {
  const message = suggestionNotification({
    title: 'Myst',
    pitch: '',
    user,
    discordId: user.discordId,
    showName: true,
    pending: true,
  });

  assert.match(message, /New suggestion needs your approval/);
  assert.match(message, /\*\*Myst\*\*/);
  assert.match(message, /\[Review it in vote admin\]\(https:\/\/www\.gamestormers\.dk\/vote-admin\/\)/);
});
