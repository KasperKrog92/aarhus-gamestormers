import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchSteamGame } from '../functions/_lib/steam.js';

test('fetchSteamGame uses Steam-provided header image when available', async () => {
  const originalFetch = globalThis.fetch;
  const headerImage = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3764200/hash/header.jpg?t=1779840172';
  const calls = [];

  globalThis.fetch = async (url) => {
    const language = new URL(url).searchParams.get('l');
    calls.push(language);

    return {
      ok: true,
      json: async () => ({
        3764200: {
          success: true,
          data: {
            name: 'Resident Evil Requiem',
            header_image: headerImage,
            short_description: language === 'danish' ? 'Dansk Steam-beskrivelse.' : 'English &amp; Steam description.',
            genres: [{ description: 'Action' }],
            platforms: { windows: true },
          },
        },
      }),
    };
  };

  try {
    const game = await fetchSteamGame('3764200');

    assert.equal(game.image, headerImage);
    assert.deepEqual(calls, ['english', 'danish']);
    assert.equal(game.descriptionEn, 'English & Steam description.');
    assert.equal(game.descriptionDa, 'Dansk Steam-beskrivelse.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
