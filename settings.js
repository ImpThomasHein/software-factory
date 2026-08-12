"use strict";

const path = require("node:path");

// The repo root: this package lives directly at <repo>/ralph-node-red/, so the
// repo root is one level up. Override with RALPH_REPO_ROOT if this package is
// ever relocated (e.g. under packages/ralph-node-red/, which would need "..", "..").
const repoRoot = process.env.RALPH_REPO_ROOT
  ? path.resolve(process.env.RALPH_REPO_ROOT)
  : path.resolve(__dirname, "..");

// Fail loudly at startup instead of letting the loop die silently later inside
// a Function node with no Catch node wired up (see flows.json flow_loop).
const fs = require("node:fs");
if (!fs.existsSync(path.join(repoRoot, "docs", "tickets.md"))) {
  // eslint-disable-next-line no-console
  console.warn(
    `[ralph-node-red] WARNUNG: docs/tickets.md nicht gefunden unter ` +
      `"${repoRoot}". Der Ralph-Loop wird vor dem ersten Agenten mit einem ` +
      `ENOENT-Fehler abbrechen. Setze RALPH_REPO_ROOT oder übergib "repoRoot" ` +
      `explizit beim Start (/ralph/start bzw. Dashboard-Formular).`
  );
}

module.exports = {
  flowFile: "flows.json",
  flowFilePretty: true,
  uiPort: process.env.PORT ? Number(process.env.PORT) : 1880,

  // Load our custom nodes (ralph-run-agent, ralph-discover-agents) without a
  // separate npm publish step — see package.json's "node-red.nodes" map too;
  // nodesDir is the belt-and-suspenders local-dev path.
  nodesDir: [path.join(__dirname, "nodes")],

  editorTheme: {
    projects: { enabled: false },
    palette: { editable: true },
  },

  // Exposed to every Function node as `global.get(...)`. Function nodes run in a
  // locked-down VM sandbox that disallows `require()`, even for Node builtins —
  // so `path`/`fs.promises` are threaded through here instead of imported inline.
  functionGlobalContext: {
    ralphRepoRoot: repoRoot,
    // Default "verify" task run once at the end of the loop (see flow_finish in
    // flows.json), mirroring the "Build Workspace" + "Run Tests" steps of
    // .github/workflows/ci.yml. Overridable per-run via the dashboard's start form
    // (msg.ralph.verifyCommand) or globally via RALPH_VERIFY_COMMAND.
    ralphVerifyCommand: process.env.RALPH_VERIFY_COMMAND || "pnpm build && pnpm test",
    // Default maximum time a single agent run (pi CLI process) may take before
    // being force-killed. Default 20 min. Override per-flow via msg.ralph.agentTimeoutMs
    // or globally via RALPH_AGENT_TIMEOUT_MS (in milliseconds).
    ralphAgentTimeoutMs: Number(process.env.RALPH_AGENT_TIMEOUT_MS) || 20 * 60 * 1000,
    // Default maximum time the verify command (pnpm build && pnpm test) may take
    // before being force-killed. Default 20 min. Override via msg.ralph.verifyTimeoutMs
    // or globally via RALPH_VERIFY_TIMEOUT_MS (in milliseconds).
    ralphVerifyTimeoutMs: Number(process.env.RALPH_VERIFY_TIMEOUT_MS) || 20 * 60 * 1000,
    // Stall detection: if no agent/progress activity occurs for this many
    // milliseconds, the poll_status loop in entrypoint.sh exits early.
    // Override via RALPH_STALL_TIMEOUT_MS (in milliseconds). Default 20 min.
    ralphStallTimeoutMs: Number(process.env.RALPH_STALL_TIMEOUT_MS) || 20 * 60 * 1000,
     // Safety net so a persistently broken build can't loop forever: after this many
     // failed verify attempts, the loop reports failure instead of retrying again.
     // The pipeline still always re-verifies after every ralph-ci-fixer run.
     ralphVerifyMaxAttempts: Number(process.env.RALPH_VERIFY_MAX_ATTEMPTS) || 5,
    path: require("node:path"),
    fsp: require("node:fs/promises"),
    AbortController,
    ralphLib: {
      tickets: require("./lib/tickets"),
      verdict: require("./lib/verdict"),
      progress: require("./lib/progress"),
      improvements: require("./lib/improvements"),
      agentLogs: require("./lib/agent-logs"),
      discovery: require("./lib/discovery"),
      tasks: require("./lib/tasks"),
      git: require("./lib/git"),
      text: require("./lib/text"),
      fsUtils: require("./lib/fs-utils"),
      notify: require("./lib/notify"),
      verify: require("./lib/verify"),
    },
  },

  logging: {
    console: { level: "info", metrics: false, audit: false },
  },
};
