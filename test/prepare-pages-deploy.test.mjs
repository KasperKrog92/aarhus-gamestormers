import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { preparePagesDeploy } from '../scripts/prepare-pages-deploy.mjs';

async function touch(root, path, contents = 'x') {
  const fullPath = join(root, path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents);
}

async function exists(root, path) {
  try {
    await stat(join(root, path));
    return true;
  } catch {
    return false;
  }
}

test('preparePagesDeploy creates a clean Pages artifact without private project files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pages-src-'));
  const out = join(root, '.deploy', 'pages');

  try {
    await touch(root, 'index.html');
    await touch(root, 'privacy.html');
    await touch(root, 'vote.html');
    await touch(root, '404.html');
    await touch(root, '_redirects');
    await touch(root, 'en/vote.html');
    await touch(root, 'css/style.css');
    await touch(root, 'js/vote.js');
    await touch(root, 'img/logo.webp');
    await touch(root, 'favicon/favicon.png');
    await touch(root, 'data/steam-sales.json', '{}');
    await touch(root, 'functions/api/round/current.js');
    await touch(root, 'robots.txt');
    await touch(root, 'sitemap.xml');

    await touch(root, '.dev.vars', 'SECRET=do-not-copy');
    await touch(root, '.wrangler/state/db.sqlite');
    await touch(root, 'wrangler.toml');
    await touch(root, 'schema.sql');
    await touch(root, 'package.json');
    await touch(root, 'CLAUDE.md');
    await touch(root, 'CNAME');
    await touch(root, 'automation/voting/scheduler.mjs');
    await touch(root, 'test/vote.test.mjs');
    await touch(root, 'scripts/prepare-pages-deploy.mjs');
    await touch(root, 'migrations/2026-06-19-discord-auth.sql');
    await touch(root, 'backfill-meetings.sql');
    await touch(root, 'docs/voting-system.md');
    await touch(out, 'stale.txt');

    await preparePagesDeploy({ rootDir: root, outDir: out });

    for (const path of [
      'index.html',
      'privacy.html',
      'vote.html',
      '404.html',
      '_redirects',
      'en/vote.html',
      'css/style.css',
      'js/vote.js',
      'img/logo.webp',
      'favicon/favicon.png',
      'data/steam-sales.json',
      'functions/api/round/current.js',
      'robots.txt',
      'sitemap.xml',
    ]) {
      assert.equal(await exists(out, path), true, `${path} should be copied`);
    }

    for (const path of [
      '.dev.vars',
      '.wrangler/state/db.sqlite',
      'wrangler.toml',
      'schema.sql',
      'package.json',
      'CLAUDE.md',
      // GitHub Pages was retired; a CNAME file must never ship again.
      'CNAME',
      'automation/voting/scheduler.mjs',
      'test/vote.test.mjs',
      'scripts/prepare-pages-deploy.mjs',
      'migrations/2026-06-19-discord-auth.sql',
      'backfill-meetings.sql',
      'docs/voting-system.md',
      'stale.txt',
    ]) {
      assert.equal(await exists(out, path), false, `${path} should not be copied`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
