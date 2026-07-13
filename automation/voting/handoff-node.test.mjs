import assert from 'node:assert/strict';
import test from 'node:test';

import { handoffArtifactPath, writeHandoff } from './handoff-node.mjs';

test('handoffArtifactPath builds the stable workflow-relative artifact path', () => {
  assert.equal(handoffArtifactPath(19), 'automation-output/meeting-19-winner.md');
  assert.equal(handoffArtifactPath('19'), 'automation-output/meeting-19-winner.md');
  assert.equal(handoffArtifactPath(19, { outputDir: 'out' }), 'out/meeting-19-winner.md');
});

test('handoffArtifactPath falls back to "unknown" for a missing or invalid round id', () => {
  assert.equal(handoffArtifactPath(null), 'automation-output/meeting-unknown-winner.md');
  assert.equal(handoffArtifactPath('not-a-number'), 'automation-output/meeting-unknown-winner.md');
});

test('writeHandoff creates the output directory and writes the markdown', async () => {
  const calls = { mkdir: [], writeFile: [] };
  const fs = {
    mkdir: async (dir, opts) => calls.mkdir.push({ dir, opts }),
    writeFile: async (file, contents, encoding) => calls.writeFile.push({ file, contents, encoding }),
  };

  const path = await writeHandoff('# Meeting 19 winner', { roundId: 19, fs });

  assert.equal(path, 'automation-output/meeting-19-winner.md');
  assert.deepEqual(calls.mkdir[0], { dir: 'automation-output', opts: { recursive: true } });
  assert.deepEqual(calls.writeFile[0], {
    file: 'automation-output/meeting-19-winner.md',
    contents: '# Meeting 19 winner',
    encoding: 'utf8',
  });
});
