"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  loadSharedPrompt,
  loadProjectDoc,
  TEMPLATES_DIR,
  plannerTask,
  builderTask,
  buildCiFixerTask,
  hasSummarySection,
  ensureSummarySection,
} = require("../lib/tasks");

describe("loadSharedPrompt", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ralph-tasks-"));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns the project's own system prompt when present", async () => {
    const promptPath = path.join(tmpDir, ".pi", "ralph-loop", "system-prompt.md");
    await fs.mkdir(path.dirname(promptPath), { recursive: true });
    await fs.writeFile(promptPath, "# Projekt-spezifischer Prompt\nHallo", "utf8");

    const prompt = await loadSharedPrompt(tmpDir, ".pi/ralph-loop/system-prompt.md");
    assert.match(prompt, /Projekt-spezifischer Prompt/);
  });

  it("falls back to the package template when the project has no system prompt", async () => {
    const prompt = await loadSharedPrompt(tmpDir, ".pi/ralph-loop/does-not-exist.md");
    assert.ok(prompt, "expected a fallback prompt");
    assert.match(prompt, /Basis-Vorlage/);
  });

  it("falls back when the project's system prompt file is empty", async () => {
    const promptPath = path.join(tmpDir, "empty-prompt.md");
    await fs.writeFile(promptPath, "   \n", "utf8");

    const prompt = await loadSharedPrompt(tmpDir, "empty-prompt.md");
    assert.match(prompt, /Basis-Vorlage/);
  });

  it("supports overriding the templates dir (used by scaffolding tests)", async () => {
    const prompt = await loadSharedPrompt(tmpDir, ".pi/ralph-loop/does-not-exist.md", TEMPLATES_DIR);
    assert.match(prompt, /Basis-Vorlage/);
  });
});

describe("loadProjectDoc", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ralph-tasks-docs-"));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("prefers the project's own docs/anforderungen.md", async () => {
    const docPath = path.join(tmpDir, "docs", "anforderungen.md");
    await fs.mkdir(path.dirname(docPath), { recursive: true });
    await fs.writeFile(docPath, "# Anforderungen – Mein Projekt", "utf8");

    const { body, usedFallback } = await loadProjectDoc(tmpDir, "docs/anforderungen.md", "anforderungen.md");
    assert.match(body, /Mein Projekt/);
    assert.equal(usedFallback, false);
  });

  it("falls back to the generic template when docs/glossar.md is missing", async () => {
    const { body, usedFallback } = await loadProjectDoc(tmpDir, "docs/glossar.md", "glossar.md");
    assert.ok(body);
    assert.match(body, /Basis-Vorlage/);
    assert.equal(usedFallback, true);
  });
});

describe("summary requirement (guarantee every agent writes a summary)", () => {
  it("appends the summary instruction to every task built after load-frontier", () => {
    const ticket = { id: 1, title: "Test", checkboxes: ["a"] };
    assert.match(plannerTask(ticket), /## Summary/);
    assert.match(builderTask(ticket, "plan"), /## Summary/);
  });

  it("hasSummarySection detects an existing ## Summary heading", () => {
    assert.equal(hasSummarySection("blah\n## Summary\ndid stuff"), true);
    assert.equal(hasSummarySection("### summary\ndid stuff"), true);
    assert.equal(hasSummarySection("no summary here"), false);
    assert.equal(hasSummarySection(""), false);
    assert.equal(hasSummarySection(undefined), false);
  });

  it("ensureSummarySection leaves output untouched when a summary is present", () => {
    const output = "did stuff\n## Summary\nAll good.";
    const { output: result, wasMissing } = ensureSummarySection(output, "ralph-builder");
    assert.equal(result, output);
    assert.equal(wasMissing, false);
  });

  it("ensureSummarySection injects a fallback summary when missing", () => {
    const { output, wasMissing } = ensureSummarySection("just some raw output, no headings", "ralph-builder");
    assert.equal(wasMissing, true);
    assert.match(output, /## Summary/);
    assert.match(output, /ralph-builder/);
    assert.match(output, /raw output/);
  });

  it("ensureSummarySection handles empty/missing output gracefully", () => {
    const { output, wasMissing } = ensureSummarySection("", "ralph-fixer");
    assert.equal(wasMissing, true);
    assert.match(output, /## Summary/);
    assert.match(output, /Keine Ausgabe erhalten/);
  });
});

describe("buildCiFixerTask", () => {
  it("includes the failed command, the output tail and the attempt number", () => {
    const task = buildCiFixerTask("pnpm build && pnpm test", "TypeError: boom\n  at file.ts:1:1", 2);
    assert.match(task, /pnpm build && pnpm test/);
    assert.match(task, /TypeError: boom/);
    assert.match(task, /Versuch 2/);
    assert.match(task, /## Summary/);
  });

  it("falls back to a placeholder when no output is given", () => {
    const task = buildCiFixerTask("pnpm test", undefined, 1);
    assert.match(task, /\(keine Ausgabe\)/);
  });
});
