"use strict";

const path = require("node:path");
const { runAgent } = require("../lib/spawn");
const { discoverRalphAgents } = require("../lib/discovery");
const { writeAgentLog } = require("../lib/agent-logs");
const { appendDebugRecord, buildDebugRecord } = require("../lib/debug-log");
const { ensureSummarySection } = require("../lib/tasks");

/** Max number of status lines kept per run; oldest lines fall off the bottom. */
const MAX_STATUS_LINES = 10;

/**
 * Appends a status line to the node's rolling in-editor status log instead of
 * overwriting the previous one, so `node.status()` shows a scrolling history
 * with the newest line on top (older lines pushed down, capped at
 * MAX_STATUS_LINES) rather than replacing the JSON-stream status text on
 * every event.
 * @param {object} node
 * @param {{fill: string, shape: string}} appearance
 * @param {string} line
 */
function pushStatus(node, appearance, line) {
  if (!node._statusLines) node._statusLines = [];
  node._statusLines.unshift(line);
  if (node._statusLines.length > MAX_STATUS_LINES) node._statusLines.length = MAX_STATUS_LINES;
  node.status({ ...appearance, text: node._statusLines.join("\n") });
}

module.exports = function (RED) {
  /**
   * Publishes an entry straight to the Node-RED editor's Debug sidebar (the same
   * "debug" comms channel the built-in Debug node uses), without requiring the
   * user to wire a Debug node to this node's outputs. Used so every prompt sent
   * to a subagent and every concrete `pi` CLI invocation shows up on the right
   * for inspection, in addition to the node's own status/log/message outputs.
   * @param {object} node
   * @param {string} topic short label shown as the debug entry's topic
   * @param {string|object} content the prompt text or invocation details
   */
  function publishToDebugSidebar(node, topic, content) {
    try {
      RED.comms.publish("debug", {
        id: node.id,
        z: node.z,
        name: node.name || node.agentName || "ralph-run-agent",
        topic,
        msg: content,
        format: typeof content === "string" ? "string" : "Object",
      }, false);
    } catch (err) {
      node.warn(`[ralph-debug] failed to publish debug sidebar entry: ${err.message}`);
    }
  }

  /**
   * Generic "Run Pi Agent" node. Spawns a fresh `pi --mode json -p --no-session`
   * subprocess for one named ralph-*.md agent (planner/builder/reviewer/fixer/
   * refactor/improver, or any custom ralph-*.md agent dropped into .pi/agents/).
   *
   * Output 1 (final): fires once when the subagent process exits.
   *   msg.payload = result.finalOutput (string)
   *   msg.ralph.result = full SubagentResult
   * Output 2 (stream): fires on every JSON event while the subagent is running.
   *   msg.payload = event snapshot {finalOutput, currentTool, currentResult, stderrLines}
   *
   * Config:
   *   agentName   - fixed ralph-* agent name (msg.ralph.agentName overrides if agentNameFromMsg=true)
   *   cwd         - repo root to spawn `pi` in (typed input; defaults to msg.ralph.cwd or node-red's cwd)
   *   modelOverride / toolsOverride - optional overrides of the agent's frontmatter
   *   sharedPromptFromMsg - if true, prepend msg.ralph.sharedPrompt to the agent's system prompt
   *
   * Debugging: this is the single choke point every ralph-loop subagent process runs
   * through, so it is also the single place that records debug info for every executed
   * prompt/agent/process, regardless of which flow node (planner/builder/reviewer/
   * fixer/refactor/improver/custom) triggered the call:
   *   - `node.log(...)` before/after each run (visible in the Node-RED console/log)
   *   - a full markdown transcript per run under `<cwd>/.pi/ralph-loop/logs/`
   *   - one JSON-Lines record per run appended to `<cwd>/.pi/ralph-loop/logs/debug.jsonl`
   *     (task/prompt sent, resolved model/tools, exact spawned command+args, exit
   *     code, stop reason, duration, token usage, final output preview)
   *
   * Summary guarantee: every task built in lib/tasks.js (right after "load frontier
   * ticket") already tells the agent to end its answer with a "## Summary" section.
   * This node additionally validates the raw output after every successful run and
   * injects a fallback "## Summary" (with a warning) if the agent didn't include one,
   * so writeAgentLog/progress.md never end up with an undocumented iteration.
   */
  function RalphRunAgentNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.agentName = config.agentName;
    node.agentNameFromMsg = config.agentNameFromMsg;
    node.cwd = config.cwd;
    node.cwdType = config.cwdType || "str";
    node.modelOverride = config.modelOverride;
    node.toolsOverride = config.toolsOverride;
    node.sharedPromptFromMsg = config.sharedPromptFromMsg !== false;

    node.on("input", async (msg, send, done) => {
      send = send || function () { node.send.apply(node, arguments); };
      try {
        const cwd = node.cwdType === "msg"
          ? RED.util.getMessageProperty(msg, node.cwd || "ralph.cwd")
          : (node.cwd || msg?.ralph?.cwd || process.cwd());
        if (!cwd) throw new Error("ralph-run-agent: no cwd resolved (set node config or msg.ralph.cwd)");

        const agentName = node.agentNameFromMsg ? msg?.ralph?.agentName : node.agentName;
        if (!agentName) throw new Error("ralph-run-agent: no agentName configured");

        const task = msg?.ralph?.task ?? (typeof msg.payload === "string" ? msg.payload : JSON.stringify(msg.payload ?? ""));
        if (!task) throw new Error("ralph-run-agent: no task text (set msg.ralph.task or msg.payload)");

        const iteration = msg?.ralph?.iteration ?? 0;
        publishToDebugSidebar(node, `prompt → ${agentName} (iter ${iteration})`, task);

        const agents = discoverRalphAgents(cwd);
        const agent = agents.find((a) => a.name === agentName);
        if (!agent) throw new Error(`ralph-run-agent: agent "${agentName}" not found under ${cwd}/.pi/agents`);

        const effectiveAgent = {
          ...agent,
          model: node.modelOverride || agent.model,
          tools: node.toolsOverride ? node.toolsOverride.split(",").map((t) => t.trim()).filter(Boolean) : agent.tools,
          systemPrompt: node.sharedPromptFromMsg && msg?.ralph?.sharedPrompt
            ? `${msg.ralph.sharedPrompt}\n\n${agent.systemPrompt}`
            : agent.systemPrompt,
        };

        const ticket = msg?.ralph?.ticket;
        const logDir = path.join(cwd, ".pi", "ralph-loop", "logs");

        node.log(
          `[ralph-debug] start ${agentName} iter=${iteration} model=${effectiveAgent.model || "default"} ` +
          `tools=${(effectiveAgent.tools || []).join(",") || "default"} cwd=${cwd} promptChars=${task.length}`
        );

        // Log the full task prompt for debugging
        await writeAgentLog(logDir, iteration, ticket?.id, agentName, `# Prompt (${task.length} chars)\n\n${task}\n\n---\n`);

        // Per-call AbortController wired to an optional shared signal passed via msg.ralph.abortController.
        const ac = new AbortController();
        const upstream = msg?.ralph?.abortController;
        if (upstream) {
          if (upstream.signal.aborted) ac.abort();
          else upstream.signal.addEventListener("abort", () => ac.abort(), { once: true });
        }
        node._statusLines = []; // fresh scrolling status log for this run
        pushStatus(node, { fill: "blue", shape: "dot" }, `running: ${agentName}`);

        const startedAt = Date.now();
        const result = await runAgent(effectiveAgent, task, { cwd }, ac.signal, (evt) => {
          pushStatus(node, { fill: "blue", shape: "dot" }, `${agentName} · turn ${evt.messages.filter((m) => m.role === "assistant").length}`);
          send([null, {
            ...msg,
            payload: evt,
            ralph: { ...msg.ralph, agentName, cwd },
          }]);
        }, (inv) => {
          // Log exact pi command to console and debug sidebar
          const cmdLine = `${inv.command} ${inv.args.join(" ")}`;
          node.log(`[ralph-debug] invoke ${agentName}: ${cmdLine}`);
          publishToDebugSidebar(
            node,
            `invoke → ${agentName} (iter ${iteration})`,
            `${cmdLine}\n\ncwd: ${inv.cwd}\nmodel: ${inv.model || "default"}\ntools: ${(inv.tools || []).join(", ") || "default"}`,
          );
        });

        const failed = result.exitCode !== 0 || result.stopReason === "aborted";
        pushStatus(node, { fill: failed ? "red" : "green", shape: "dot" }, `${agentName} done in ${Math.round((Date.now() - startedAt) / 1000)}s`);

        // Guarantee: every agent run ends up with a "## Summary" section, even if the
        // agent ignored the instruction appended to its task (see lib/tasks.js). This
        // keeps writeAgentLog/progress.md from ever losing the "what happened" record.
        if (!failed) {
          const { output, wasMissing } = ensureSummarySection(result.finalOutput, agentName);
          if (wasMissing) {
            node.warn(`[ralph-debug] ${agentName} iter=${iteration} lieferte keine "## Summary"-Sektion — Fallback ergänzt`);
          }
          result.finalOutput = output;
        }

        node.log(
          `[ralph-debug] end ${agentName} iter=${iteration} exit=${result.exitCode} stop=${result.stopReason || "-"} ` +
          `durationMs=${result.durationMs} turns=${result.usage.turns} in=${result.usage.input} out=${result.usage.output} ` +
          `cost=${result.usage.cost.toFixed(4)}${result.errorMessage ? ` error=${result.errorMessage.slice(0, 200)}` : ""}`
        );

        // Best-effort: never let logging failures break the loop.
        try {
          await writeAgentLog(logDir, iteration, result, ticket?.title);
          await appendDebugRecord(logDir, buildDebugRecord({ iteration, ticket }, effectiveAgent, task, result));
        } catch (logErr) {
          node.warn(`[ralph-debug] failed to write debug log for ${agentName}: ${logErr.message}`);
        }

        send([{
          ...msg,
          payload: result.finalOutput,
          ralph: { ...msg.ralph, agentName, cwd, result },
        }, null]);
        done();
      } catch (err) {
        pushStatus(node, { fill: "red", shape: "ring" }, "error");
        done(err);
      }
    });
  }

  RED.nodes.registerType("ralph-run-agent", RalphRunAgentNode);
};

