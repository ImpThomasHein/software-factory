"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/**
 * Spawns a fresh `pi --mode json -p --no-session` process for one subagent
 * call and parses its JSON event stream. Ported 1:1 from
 * .pi/extensions/ralph-loop/agents/spawn.ts so the Node-RED "Run Pi Agent"
 * node behaves identically to the TUI extension's subagent runner.
 *
 * @param {{name:string,description?:string,tools?:string[],model?:string,systemPrompt:string,filePath?:string}} agent
 * @param {string} task
 * @param {{cwd:string}} ctx
 * @param {AbortSignal|undefined} signal
 * @param {(e:object)=>void} [onEvent] fired on every stream update (turn end, tool start/update/end)
 * @param {(inv:{command:string,args:string[],cwd:string,model:string|undefined,tools:string[]|undefined})=>void} [onInvocation]
 *   fired once, synchronously right before the `pi` process is spawned, with the exact
 *   resolved command/args — lets callers surface the concrete agent invocation (e.g. to
 *   a Node-RED debug sidebar) without waiting for the process to finish.
 * @returns {Promise<object>} SubagentResult: {name, task, messages, finalOutput, usage, model, stopReason, errorMessage, exitCode}
 */
async function runAgent(agent, task, ctx, signal, onEvent, onInvocation) {
  const cwd = ctx.cwd;
  const args = ["--mode", "json", "-p", "--no-session"];
  if (agent.model) args.push("--model", agent.model);
  if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

  const result = {
    name: agent.name,
    task,
    messages: [],
    finalOutput: "",
    usage: { input: 0, output: 0, turns: 0, cost: 0 },
    model: undefined,
    stopReason: undefined,
    errorMessage: undefined,
    exitCode: 0,
    // Debug/observability: the resolved config and exact CLI invocation, so every
    // executed process can be inspected/reproduced from the debug log alone.
    command: undefined,
    args: undefined,
    cwd,
    tools: agent.tools,
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    durationMs: undefined,
  };

  let tmpDir = null;
  let tmpFile = null;
  let stderrBuffer = [];

  const emit = (event) => {
    if (event) {
      result.finalOutput = event.finalOutput;
      if (onEvent) onEvent(event);
    } else {
      result.finalOutput = getFinalOutput(result.messages);
      if (onEvent) onEvent({ messages: [...result.messages], finalOutput: result.finalOutput, stderrLines: [...stderrBuffer] });
    }
  };

  const getFinalOutput = (messages) => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      const texts = (m.content || []).filter((c) => c.type === "text" && c.text).map((c) => c.text);
      if (texts.length > 0) return texts.join("\n");
    }
    return "";
  };

  const getPiInvocation = (invArgs) => {
    // Node-RED always runs under plain node — always shell out to the `pi` binary on PATH.
    return { command: process.platform === "win32" ? "pi.cmd" : "pi", args: invArgs };
  };

  const writePromptToTempFile = async (name, prompt) => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ralph-node-red-"));
    const safe = name.replace(/[^\w.-]+/g, "_");
    const file = path.join(dir, `prompt-${safe}.md`);
    await fs.promises.writeFile(file, prompt, { encoding: "utf-8", mode: 0o600 });
    return { dir, file };
  };

  try {
    if (agent.systemPrompt && agent.systemPrompt.trim()) {
      const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
      tmpDir = tmp.dir;
      tmpFile = tmp.file;
      args.push("--append-system-prompt", tmpFile);
    }
    args.push(`Task: ${task}`);

    let wasAborted = false;
    result.exitCode = await new Promise((resolve) => {
      const inv = getPiInvocation(args);
      result.command = inv.command;
      result.args = inv.args;
      if (onInvocation) {
        onInvocation({ command: inv.command, args: inv.args, cwd, model: agent.model, tools: agent.tools });
      }
      const proc = spawn(inv.command, inv.args, { cwd, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
      let buffer = "";
      let currentToolInfo = null;
      stderrBuffer = [];

      const buildEvent = (extra) => ({
        messages: [...result.messages],
        finalOutput: getFinalOutput(result.messages),
        currentTool: extra?.currentTool ?? currentToolInfo,
        currentResult: extra?.currentResult ?? null,
        stderrLines: [...stderrBuffer],
      });

      const handleLine = (line) => {
        if (!line.trim()) return;
        let evt;
        try {
          evt = JSON.parse(line);
        } catch {
          return;
        }

        if (evt.type === "message_update" && evt.message?.role === "assistant") {
          const msg = evt.message;
          const lastMsg = result.messages[result.messages.length - 1];
          if (lastMsg?.role === "assistant" && lastMsg.id === msg.id) {
            Object.assign(lastMsg, msg);
          } else {
            result.messages.push(msg);
          }
          const evt2 = buildEvent();
          evt2.finalOutput = getFinalOutput(result.messages);
          emit(evt2);
        }

        if (evt.type === "message_end" && evt.message) {
          const msg = evt.message;
          const idx = result.messages.findIndex((m) => m.role === "assistant" && m.id === msg.id);
          if (idx >= 0) result.messages[idx] = msg;
          else result.messages.push(msg);
          if (msg.role === "assistant") {
            result.usage.turns++;
            const u = msg.usage;
            if (u) {
              result.usage.input += u.input || 0;
              result.usage.output += u.output || 0;
              result.usage.cost += u.cost?.total || 0;
            }
            if (!result.model && msg.model) result.model = msg.model;
            if (msg.stopReason) result.stopReason = msg.stopReason;
            if (msg.errorMessage) result.errorMessage = msg.errorMessage;
          }
          currentToolInfo = null;
          emit(buildEvent());
        }

        if (evt.type === "tool_execution_start") {
          currentToolInfo = {
            name: evt.toolName,
            args: typeof evt.args === "string" ? evt.args : JSON.stringify(evt.args ?? {}).slice(0, 200),
          };
          emit(buildEvent());
        }

        if (evt.type === "tool_execution_update") {
          const partial = typeof evt.partialResult === "string" ? evt.partialResult.slice(0, 300) : JSON.stringify(evt.partialResult ?? {}).slice(0, 300);
          emit(buildEvent({ currentResult: partial }));
        }

        if (evt.type === "tool_execution_end") {
          const resultStr = typeof evt.result === "string" ? evt.result.slice(0, 300) : JSON.stringify(evt.result ?? {}).slice(0, 300);
          emit(buildEvent({ currentResult: resultStr }));
        }

        if (evt.type === "tool_result_end" && evt.message) {
          result.messages.push(evt.message);
          currentToolInfo = null;
          emit(buildEvent());
        }
      };

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) handleLine(line);
      });
      proc.stderr.on("data", (data) => {
        const text = data.toString();
        if (!result.errorMessage) result.errorMessage = text;
        const lines = text.split("\n").filter((l) => l.trim());
        for (const line of lines) stderrBuffer.push(line);
        while (stderrBuffer.length > 100) stderrBuffer.shift();
        emit(buildEvent());
      });
      proc.on("close", (code) => {
        if (buffer.trim()) handleLine(buffer);
        resolve(code ?? 0);
      });
      proc.on("error", () => resolve(1));

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

    if (wasAborted) result.stopReason = "aborted";
    return result;
  } finally {
    result.finishedAt = new Date().toISOString();
    result.durationMs = Date.parse(result.finishedAt) - Date.parse(result.startedAt);
    if (tmpFile) {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
    }
    if (tmpDir) {
      try {
        fs.rmdirSync(tmpDir);
      } catch {
        /* ignore */
      }
    }
  }
}

module.exports = { runAgent };
