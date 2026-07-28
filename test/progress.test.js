"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { formatProgressEntry } = require("../lib/progress");

const base = {
  iteration: 1,
  totalIterations: 5,
  ticketId: 5,
  ticketTitle: "Game Logic Hook + Word Matcher",
  startedAt: new Date("2026-07-10T14:30:00Z"),
  finishedAt: new Date("2026-07-10T14:42:00Z"),
  agentOutputs: { planner: "Plan text", builder: "Build text", reviewer: "Review text" },
  verdict: "READY",
  ticketMarkedDone: true,
  designDecisions: ["useGameLogic uses useReducer"],
  recommendations: ["Extract wordMatcher to its own module"],
  testRunResult: "4 passed, 0 failed",
  devTimeSeconds: 720,
  linesOfCode: 142,
  linesOfTests: 88,
  keyChanges: ["application/src/hooks/useGameLogic.ts (new)", "tickets.md (#5 marked done)"],
  keyInsights: ["Error auto-reset needs 1500ms not 1000ms"],
};

describe("formatProgressEntry", () => {
  it("renders a top-level heading with iteration, ticket id and title", () => {
    const out = formatProgressEntry(base);
    assert.match(out, /^## Iteration 1\/5 — #5: Game Logic Hook \+ Word Matcher/);
  });

  it("includes timestamps formatted ISO", () => {
    const out = formatProgressEntry(base);
    assert.match(out, /Started: 2026-07-10T14:30:00\.000Z/);
    assert.match(out, /Finished: 2026-07-10T14:42:00\.000Z/);
  });

  it("includes dev time as mm:ss", () => {
    assert.match(formatProgressEntry(base), /Dev time: 12:00/);
  });

  it("includes counts of code and test lines", () => {
    const out = formatProgressEntry(base);
    assert.match(out, /Lines of code: 142/);
    assert.match(out, /Lines of tests: 88/);
  });

  it("includes verdict and whether the ticket was marked done", () => {
    const out = formatProgressEntry(base);
    assert.match(out, /Verdict: READY/);
    assert.match(out, /Ticket marked done: yes/);
  });

  it("includes all three core agent outputs", () => {
    const out = formatProgressEntry(base);
    assert.match(out, /### Planner\n\nPlan text/);
    assert.match(out, /### Builder\n\nBuild text/);
    assert.match(out, /### Reviewer\n\nReview text/);
  });

  it("omits refactorer/improver sections when absent", () => {
    const out = formatProgressEntry(base);
    assert.doesNotMatch(out, /### Refactorer/);
    assert.doesNotMatch(out, /### Loop Improver/);
  });

  it("includes refactorer/improver sections when present", () => {
    const out = formatProgressEntry({
      ...base,
      agentOutputs: { ...base.agentOutputs, refactorer: "Refactor text", improver: "Improve text" },
    });
    assert.match(out, /### Refactorer\n\nRefactor text/);
    assert.match(out, /### Loop Improver\n\nImprove text/);
  });

  it("renders design decisions, recommendations, key changes, key insights, test result as bullet lists", () => {
    const out = formatProgressEntry(base);
    assert.match(out, /### Design decisions\n\n- useGameLogic uses useReducer/);
    assert.match(out, /### Recommendations for further development\n\n- Extract wordMatcher to its own module/);
    assert.match(out, /### Test run result\n\n4 passed, 0 failed/);
    assert.match(out, /### Key changes\n\n- application\/src\/hooks\/useGameLogic\.ts \(new\)\n- tickets\.md \(#5 marked done\)/);
    assert.match(out, /### Key insights\n\n- Error auto-reset needs 1500ms not 1000ms/);
  });
});
