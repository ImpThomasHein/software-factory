"use strict";

const { spawn } = require("node:child_process");

/**
 * Runs a configurable shell command (default: "pnpm build && pnpm test", mirroring
 * the "Build Workspace" + "Run Tests" steps of .github/workflows/ci.yml) once in `cwd`
 * and captures combined stdout/stderr plus the exit code. Used at the end of the ralph
 * loop (see flow_finish in flows.json) so CI-equivalent regressions are caught locally,
 * even if the reviewer's own build/test check missed something.
 *
 * @param {string} command shell command, may contain && / ; (always run through a shell)
 * @param {string} cwd
 * @param {AbortSignal} [signal]
 * @param {number} [timeoutMs] max duration before force-killing; default 30 min
 * @returns {Promise<{success:boolean, exitCode:number, output:string, command:string, durationMs:number}>}
 */
async function runVerifyCommand(command, cwd, signal, timeoutMs) {
  const VERIFY_TIMEOUT_MS = timeoutMs ?? 30 * 60 * 1000;
  const startedAt = Date.now();
  let output = "";
  let wasAborted = false;

  const exitCode = await new Promise((resolve) => {
    const proc = spawn(command, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });

    // ── Timer: kill hung verify command ──
    let timeoutTimer = null;
    const clearTimer = () => {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
    };
    const onTimeout = () => {
      wasAborted = true;
      output += `\n[timeout] Verify command timed out after ${Math.round(VERIFY_TIMEOUT_MS / 1000)}s`;
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 5000);
    };
    timeoutTimer = setTimeout(onTimeout, VERIFY_TIMEOUT_MS);

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });
    proc.stderr.on("data", (data) => {
      output += data.toString();
    });
    proc.on("close", (code) => {
      clearTimer();
      resolve(code ?? 0);
    });
    proc.on("error", (err) => {
      clearTimer();
      output += `\n[spawn error] ${err.message}`;
      resolve(1);
    });

    if (signal) {
      const kill = () => {
        wasAborted = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5000);
      };
      if (signal.aborted) kill();
      else signal.addEventListener("abort", kill, { once: true });
    }
  });

  return {
    success: exitCode === 0 && !wasAborted,
    exitCode,
    // Cap to the tail: build/test failures are almost always described in the last
    // lines, and this keeps the ci-fixer task text (and the debug/ntfy logs) sane
    // even for very verbose `pnpm build && pnpm test` runs.
    output: output.length > 20000 ? output.slice(-20000) : output,
    command,
    durationMs: Date.now() - startedAt,
  };
}

module.exports = { runVerifyCommand };