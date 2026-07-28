"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { appendDebugRecord, buildDebugRecord, DEBUG_LOG_FILE } = require("../lib/debug-log");

describe("appendDebugRecord", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ralph-debug-log-"));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates the log dir and appends one JSON line per call", async () => {
    await appendDebugRecord(tmpDir, { agent: "ralph-planner", exitCode: 0 });
    await appendDebugRecord(tmpDir, { agent: "ralph-builder", exitCode: 0 });

    const file = path.join(tmpDir, DEBUG_LOG_FILE);
    const content = await fs.readFile(file, "utf8");
    const lines = content.trim().split("\n");

    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]), { agent: "ralph-planner", exitCode: 0 });
    assert.deepEqual(JSON.parse(lines[1]), { agent: "ralph-builder", exitCode: 0 });
  });

  it("creates nested directories that don't exist yet", async () => {
    const nested = path.join(tmpDir, "nested", "logs");
    await appendDebugRecord(nested, { agent: "ralph-fixer" });
    const content = await fs.readFile(path.join(nested, DEBUG_LOG_FILE), "utf8");
    assert.match(content, /ralph-fixer/);
  });
});

describe("buildDebugRecord", () => {
  it("captures prompt, resolved agent config, spawned process, and outcome", () => {
    const context = { iteration: 3, ticket: { id: 5, title: "Game Logic" } };
    const agent = { name: "ralph-builder", model: "deepseek/deepseek-v4-flash", tools: ["read", "write"] };
    const task = "Ticket #5: Game Logic\n\nPlan:\n...";
    const result = {
      model: "deepseek/deepseek-v4-flash",
      cwd: "C:/projects/schreib-magie",
      command: "pi.cmd",
      args: ["--mode", "json", "-p", "--no-session"],
      exitCode: 0,
      stopReason: "end_turn",
      errorMessage: undefined,
      durationMs: 4321,
      usage: { input: 100, output: 50, turns: 2, cost: 0.01 },
      finalOutput: "x".repeat(600),
      finishedAt: "2026-07-26T12:00:00.000Z",
    };

    const record = buildDebugRecord(context, agent, task, result);

    assert.equal(record.iteration, 3);
    assert.deepEqual(record.ticket, { id: 5, title: "Game Logic" });
    assert.equal(record.agent, "ralph-builder");
    assert.equal(record.model, "deepseek/deepseek-v4-flash");
    assert.deepEqual(record.tools, ["read", "write"]);
    assert.equal(record.task, task);
    assert.equal(record.command, "pi.cmd");
    assert.deepEqual(record.args, ["--mode", "json", "-p", "--no-session"]);
    assert.equal(record.exitCode, 0);
    assert.equal(record.durationMs, 4321);
    assert.equal(record.finalOutputPreview.length, 500);
    assert.equal(record.timestamp, "2026-07-26T12:00:00.000Z");
  });

  it("defaults iteration/ticket to null when no context is given", () => {
    const record = buildDebugRecord(undefined, { name: "ralph-improver" }, "task", {
      usage: { input: 0, output: 0, turns: 0, cost: 0 },
      finalOutput: "",
      finishedAt: "2026-07-26T12:00:00.000Z",
    });
    assert.equal(record.iteration, null);
    assert.equal(record.ticket, null);
    assert.equal(record.model, "default");
  });
});
