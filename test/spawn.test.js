"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const Module = require("node:module");

// Stub node:child_process.spawn so runAgent doesn't need a real `pi` binary.
// Regression test for a real bug found during manual smoke testing: `emit()`
// forwarded stream events without ever assigning `result.finalOutput`, so
// every subagent call returned an empty finalOutput despite the assistant
// having produced text.
function withStubbedSpawn(scriptedLines, run) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "node:child_process") {
      return {
        spawn() {
          const proc = new EventEmitter();
          proc.stdout = new EventEmitter();
          proc.stderr = new EventEmitter();
          proc.kill = () => {};
          proc.killed = false;
          setImmediate(() => {
            for (const line of scriptedLines) proc.stdout.emit("data", Buffer.from(line + "\n"));
            proc.emit("close", 0);
          });
          return proc;
        },
      };
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    return run();
  } finally {
    Module._load = originalLoad;
  }
}

describe("runAgent", () => {
  it("populates result.finalOutput from the last assistant message_end event", async () => {
    delete require.cache[require.resolve("../lib/spawn")];
    const { runAgent } = withStubbedSpawn(
      [
        JSON.stringify({
          type: "message_end",
          message: { id: "m1", role: "assistant", content: [{ type: "text", text: "PLAN: ack ticket" }], usage: { input: 10, output: 5 } },
        }),
      ],
      () => require("../lib/spawn"),
    );

    const agent = { name: "ralph-planner", systemPrompt: "" };
    const result = await withStubbedSpawn(
      [
        JSON.stringify({
          type: "message_end",
          message: { id: "m1", role: "assistant", content: [{ type: "text", text: "PLAN: ack ticket" }], usage: { input: 10, output: 5 } },
        }),
      ],
      () => runAgent(agent, "Ticket #1", { cwd: path.resolve(".") }, undefined, undefined),
    );

    assert.equal(result.finalOutput, "PLAN: ack ticket");
    assert.equal(result.exitCode, 0);
    assert.equal(result.usage.turns, 1);
  });
});
