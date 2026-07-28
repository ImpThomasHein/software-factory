"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { runVerifyCommand } = require("../lib/verify");

// Uses `node -e "..."` as the verify command instead of pnpm/shell builtins so this
// test is deterministic and doesn't depend on the actual project's build/test setup.
describe("runVerifyCommand", () => {
  it("reports success and captures stdout when the command exits 0", async () => {
    const result = await runVerifyCommand('node -e "console.log(\'all good\')"', process.cwd());
    assert.equal(result.success, true);
    assert.equal(result.exitCode, 0);
    assert.match(result.output, /all good/);
    assert.equal(result.command, 'node -e "console.log(\'all good\')"');
    assert.ok(result.durationMs >= 0);
  });

  it("reports failure and captures stderr when the command exits non-zero", async () => {
    const result = await runVerifyCommand('node -e "console.error(\'boom\'); process.exit(1)"', process.cwd());
    assert.equal(result.success, false);
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /boom/);
  });

  it("truncates very long output to the last 20000 characters", async () => {
    const result = await runVerifyCommand(
      'node -e "for (let i = 0; i < 3000; i++) console.log(\'line \' + i)"',
      process.cwd(),
    );
    assert.equal(result.success, true);
    assert.ok(result.output.length <= 20000);
    assert.match(result.output, /line 2999/);
  });

  it("treats an abort signal as a failed run", async () => {
    const ac = new AbortController();
    const promise = runVerifyCommand('node -e "setTimeout(() => {}, 5000)"', process.cwd(), ac.signal);
    ac.abort();
    const result = await promise;
    assert.equal(result.success, false);
  });
});
