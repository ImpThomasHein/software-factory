#!/usr/bin/env node
"use strict";

/**
 * Scaffolds the generic ralph-node-red base files into a target repo, mirroring how
 * `.pi/extensions` ships defaults that projects build on top of. Existing files are
 * never overwritten — this only fills in what's missing so `ralph-node-red` works
 * out of the box in a fresh project and stays reusable across projects.
 *
 * Usage:
 *   node bin/init.js [--repo <path>]
 *   npm run init -- --repo C:/projects/other-project
 *
 * Without --repo, defaults to the monorepo root two levels up from this package.
 */

const fs = require("node:fs");
const path = require("node:path");

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");
const TEMPLATES_SKILLS_DIR = path.join(TEMPLATES_DIR, "skills");
const TEMPLATES_AGENTS_DIR = path.join(TEMPLATES_DIR, "agents");
const FACTORY_ROOT = path.join(__dirname, "..");

/** @type {Array<{ template: string, target: string }>} */
const SCAFFOLD_FILES = [
  { template: "system-prompt.md", target: path.join(".pi", "ralph-loop", "system-prompt.md") },
  { template: "anforderungen.md", target: path.join("docs", "anforderungen.md") },
  { template: "glossar.md", target: path.join("docs", "glossar.md") },
  { template: "spec.md", target: path.join("docs", "spec.md") },
  // GitHub Action files — shipped so every project can run Ralph Loop in CI
  { template: path.join("github-action", "action.yml"), target: "action.yml" },
  { template: path.join("github-action", "Dockerfile"), target: "Dockerfile" },
  { template: path.join("github-action", "entrypoint.sh"), target: "entrypoint.sh" },
  { template: path.join("github-action", ".dockerignore"), target: ".dockerignore" },
  { template: path.join("github-action", "workflows", "software-factory.yml"), target: path.join(".github", "workflows", "software-factory.yml") },
];

/** Node-RED runtime files copied from the factory root — needed for the Docker build. */
const FACTORY_RUNTIME_FILES = [
  "flows.json",
  "settings.js",
  "package.json",
  "package-lock.json",
];

/** Directories copied recursively from factory root. */
const FACTORY_RUNTIME_DIRS = [
  "lib",
  "nodes",
  "templates",
];

// Skills the ralph-loop agents (planner/builder/reviewer/...) rely on by name in their
// system prompts (e.g. "Nutze den Skill writing-plans"). Shipped here so a fresh project
// has them under .pi/skills/ without depending on user-level skill installs.
const REQUIRED_SKILLS = [
  "grilling",
  "grill-with-docs",
  "domain-modeling",
  "to-spec",
  "to-tickets",
  "test-driven-development",
  "writing-plans",
  "executing-plans",
  "code-review",
];

/**
 * The `ralph-*.md` agent definitions themselves (planner/builder/reviewer/fixer/
 * refactor/improver/summary/ci-fixer), ported here so a fresh project gets the full
 * default agent roster under `.pi/agents/` without needing to hand-copy them from
 * another project. Read dynamically so dropping a new `ralph-*.md` into
 * `templates/agents/` is enough to ship it — no code change needed here.
 */
function listAgentTemplates() {
  if (!fs.existsSync(TEMPLATES_AGENTS_DIR)) return [];
  return fs
    .readdirSync(TEMPLATES_AGENTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith("ralph-") && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

function parseRepoArg(argv) {
  const idx = argv.indexOf("--repo");
  if (idx === -1 || !argv[idx + 1]) return process.cwd();
  return path.resolve(argv[idx + 1]);
}

function copyDirRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function scaffold(repoRoot) {
  const results = [];
  for (const { template, target } of SCAFFOLD_FILES) {
    const targetPath = path.join(repoRoot, target);
    if (fs.existsSync(targetPath)) {
      results.push({ target, status: "skipped (exists)" });
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(path.join(TEMPLATES_DIR, template), targetPath);
    results.push({ target, status: "created" });
  }

  // Copy Node-RED runtime into factory/ subdirectory (avoids conflict with app package.json)
  const factoryDir = path.join(repoRoot, "factory");
  fs.mkdirSync(factoryDir, { recursive: true });
  for (const file of FACTORY_RUNTIME_FILES) {
    const targetPath = path.join(factoryDir, file);
    if (fs.existsSync(targetPath)) {
      results.push({ target: path.join("factory", file), status: "skipped (exists)" });
      continue;
    }
    fs.copyFileSync(path.join(FACTORY_ROOT, file), targetPath);
    results.push({ target: path.join("factory", file), status: "created" });
  }
  for (const dir of FACTORY_RUNTIME_DIRS) {
    const targetPath = path.join(factoryDir, dir);
    if (fs.existsSync(targetPath)) {
      results.push({ target: path.join("factory", dir), status: "skipped (exists)" });
      continue;
    }
    copyDirRecursive(path.join(FACTORY_ROOT, dir), targetPath);
    results.push({ target: path.join("factory", dir), status: "created" });
  }
  for (const skill of REQUIRED_SKILLS) {
    const target = path.join(".pi", "skills", skill);
    const targetPath = path.join(repoRoot, target);
    if (fs.existsSync(targetPath)) {
      results.push({ target, status: "skipped (exists)" });
      continue;
    }
    copyDirRecursive(path.join(TEMPLATES_SKILLS_DIR, skill), targetPath);
    results.push({ target, status: "created" });
  }
  for (const agentFile of listAgentTemplates()) {
    const target = path.join(".pi", "agents", agentFile);
    const targetPath = path.join(repoRoot, target);
    if (fs.existsSync(targetPath)) {
      results.push({ target, status: "skipped (exists)" });
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(path.join(TEMPLATES_AGENTS_DIR, agentFile), targetPath);
    results.push({ target, status: "created" });
  }
  return results;
}

function main() {
  const repoRoot = parseRepoArg(process.argv.slice(2));
  if (!fs.existsSync(repoRoot)) {
    console.error(`ralph-node-red init: repo root does not exist: ${repoRoot}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ralph-node-red init: scaffolding base files into ${repoRoot}`);
  for (const { target, status } of scaffold(repoRoot)) {
    console.log(`  ${status.startsWith("created") ? "+" : "-"} ${target} — ${status}`);
  }
}

if (require.main === module) main();

module.exports = {
  scaffold,
  SCAFFOLD_FILES,
  REQUIRED_SKILLS,
  TEMPLATES_DIR,
  TEMPLATES_SKILLS_DIR,
  TEMPLATES_AGENTS_DIR,
  listAgentTemplates,
};
