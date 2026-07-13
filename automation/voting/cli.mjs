// Node CLI entry for the voting scheduler, executed by GitHub Actions (see
// .github/workflows/voting-automation.yml). This is the backstop clock; the
// primary clock is the Cloudflare cron Worker in automation/cron-worker/, which
// runs the same runScheduler module. This wrapper owns the Node-specific parts:
// process.env, the filesystem handoff writer, and the process exit code.
//
// A thrown error exits non-zero so a genuine failure surfaces as a red workflow
// run; blocked/no-op states resolve normally and stay green. After a successful
// pass the dead-man's-switch ping fires (skipped when HEALTHCHECKS_PING_URL is
// unset), and a failed ping is logged but never fails the run.

import { runScheduler } from './run-scheduler.mjs';
import { writeHandoff } from './handoff-node.mjs';
import { pingHealthcheck } from './healthcheck.mjs';

try {
  const result = await runScheduler({ deps: { writeHandoff } });
  console.log(`Scheduler finished: ${JSON.stringify(result)}`);
  const ping = await pingHealthcheck(process.env.HEALTHCHECKS_PING_URL);
  if (!ping.skipped) {
    console.log(`Healthcheck ping: ${ping.ok ? 'ok' : `failed (${ping.status ?? ping.error})`}`);
  }
} catch (err) {
  console.error(`Scheduler failed: ${err.message}`);
  process.exitCode = 1;
}
