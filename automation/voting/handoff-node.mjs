// Node-only handoff delivery: write the maintainer handoff Markdown to the
// workflow output directory so GitHub Actions can upload it as an artifact.
//
// Kept separate from handoff.mjs (the pure planner/builder module) so the
// Cloudflare cron Worker can bundle the scheduler without any node: imports.
// The Worker delivers handoffs its own way (a Discord file attachment on the
// private alerts webhook, see automation/cron-worker/worker.mjs).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
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
