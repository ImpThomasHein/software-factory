"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { scaffold, listAgentTemplates, TEMPLATES_AGENTS_DIR } = require("../bin/init");

describe("listAgentTemplates", () => {
  it("finds all ralph-*.md agent templates shipped under templates/agents/", () => {
    const files = listAgentTemplates();
    assert.ok(files.length > 0, "expected at least one agent template");
    for (const name of files) {
      assert.match(name, /^ralph-.*\.md$/);
    }
    // The default pipeline agents must always be present.
    for (const required of ["ralph-planner.md", "ralph-builder.md", "ralph-reviewer.md"]) {
      assert.ok(files.includes(required), `expected ${required} in ${TEMPLATES_AGENTS_DIR}`);
    }
  });
});

describe("scaffold (agent templates)", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ralph-init-agents-"));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("copies every agent template into .pi/agents/ of the target repo", async () => {
    const results = scaffold(tmpDir);
    const agentResults = results.filter((r) => r.target.startsWith(path.join(".pi", "agents")));
    assert.ok(agentResults.length >= listAgentTemplates().length);
    assert.ok(agentResults.every((r) => r.status === "created"));

    const plannerPath = path.join(tmpDir, ".pi", "agents", "ralph-planner.md");
    const content = await fs.readFile(plannerPath, "utf8");
    assert.match(content, /name: ralph-planner/);
  });

  it("never overwrites an existing agent file on a second run", async () => {
    const plannerPath = path.join(tmpDir, ".pi", "agents", "ralph-planner.md");
    await fs.writeFile(plannerPath, "custom project override", "utf8");

    const results = scaffold(tmpDir);
    const plannerResult = results.find((r) => r.target === path.join(".pi", "agents", "ralph-planner.md"));
    assert.equal(plannerResult.status, "skipped (exists)");

    const content = await fs.readFile(plannerPath, "utf8");
    assert.equal(content, "custom project override");
  });
});
