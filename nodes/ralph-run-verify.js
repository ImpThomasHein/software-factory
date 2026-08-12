"use strict";

const { runVerifyCommand } = require("../lib/verify");

module.exports = function (RED) {
  /**
   * Runs the configurable "verify" command (default: "pnpm build && pnpm test",
   * mirroring the Build+Test steps of .github/workflows/ci.yml) in the target repo
   * and reports success/failure plus captured output. Used once at the end of the
   * ralph loop (see flow_finish in flows.json) to catch build/test regressions the
   * reviewer might have missed, before handing off to `ralph-ci-fixer` on failure.
   *
   * Config:
   *   command     - shell command (typed input; falls back to msg.ralph.verifyCommand,
   *                 then global 'ralphVerifyCommand', then a hardcoded default)
   *   cwd         - repo root (typed input; defaults to msg.ralph.cwd)
   *
   * Output: msg.payload / msg.ralph.verify = {success, exitCode, output, command, durationMs}
   */
  function RalphRunVerifyNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.command = config.command;
    node.commandType = config.commandType || "str";
    node.cwd = config.cwd;
    node.cwdType = config.cwdType || "str";

    node.on("input", async (msg, send, done) => {
      send = send || function () { node.send.apply(node, arguments); };
      try {
        const cwd = node.cwdType === "msg"
          ? RED.util.getMessageProperty(msg, node.cwd || "ralph.cwd")
          : (node.cwd || msg?.ralph?.cwd || process.cwd());
        if (!cwd) throw new Error("ralph-run-verify: no cwd resolved (set node config or msg.ralph.cwd)");

        const commandFromNode = node.commandType === "msg"
          ? RED.util.getMessageProperty(msg, node.command || "ralph.verifyCommand")
          : node.command;
        const command = commandFromNode
          || msg?.ralph?.verifyCommand
          || node.context().global.get("ralphVerifyCommand")
          || "pnpm build && pnpm test";

        const attempt = msg?.ralph?.verifyAttempt || 1;
        node.status({ fill: "blue", shape: "dot", text: `verifying (Versuch ${attempt})…` });
        node.log(`[ralph-debug] verify start attempt=${attempt} cwd=${cwd} command="${command}"`);

        const ac = new AbortController();
        const upstream = msg?.ralph?.abortController;
        if (upstream) {
          if (upstream.signal.aborted) ac.abort();
          else upstream.signal.addEventListener("abort", () => ac.abort(), { once: true });
        }

        // Report current activity to /ralph/status for stall detection
        node.context().global.set("ralphCurrentAgent", "ralph-verify");
        node.context().global.set("ralphActivityNonce", (node.context().global.get("ralphActivityNonce") || 0) + 1);

        const timeoutMs = msg?.ralph?.verifyTimeoutMs ?? undefined;
        const result = await runVerifyCommand(command, cwd, ac.signal, timeoutMs);

        // Bump activity nonce after verify completes
        node.context().global.set("ralphActivityNonce", (node.context().global.get("ralphActivityNonce") || 0) + 1);
        node.status({
          fill: result.success ? "green" : "red",
          shape: "dot",
          text: result.success ? `verify OK (Versuch ${attempt})` : `verify failed (exit ${result.exitCode})`,
        });
        node.log(
          `[ralph-debug] verify end attempt=${attempt} exit=${result.exitCode} ` +
          `durationMs=${result.durationMs} success=${result.success}`
        );

        send({ ...msg, payload: result, ralph: { ...msg.ralph, verify: result } });
        done();
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "error" });
        done(err);
      }
    });
  }

  RED.nodes.registerType("ralph-run-verify", RalphRunVerifyNode);
};
