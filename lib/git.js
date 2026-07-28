"use strict";

const { execSync } = require("node:child_process");
const { join } = require("node:path");

/** Ported from .pi/extensions/ralph-loop/utils/git.ts */

/** @param {string} cwd @returns {Promise<string[]>} */
async function detectChangedFiles(cwd) {
  try {
    const stdout = execSync("git status --porcelain", { cwd, timeout: 5000, encoding: "utf8" });
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^[A-Z?]+\s+/, ""))
      .filter((p) => p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".md"));
  } catch {
    return [];
  }
}

/**
 * @param {string} cwd
 * @param {string} testDir relative dir (containing package.json with a test script) to run tests in
 * @param {string} testCmd
 * @returns {Promise<string>}
 */
async function runTestsOrNull(cwd, testDir = "application", testCmd = "npx vitest run") {
  try {
    const r = execSync(testCmd, { cwd: join(cwd, testDir), timeout: 60000, encoding: "utf8" });
    return r.split("\n").slice(-3).join("\n");
  } catch (e) {
    return `tests failed: ${e.message ?? "unknown"}`;
  }
}

module.exports = { detectChangedFiles, runTestsOrNull };
