"use strict";

const fs = require("node:fs");
const path = require("node:path");

/** Ported 1:1 from .pi/extensions/ralph-loop/agents/discovery.ts */

const REQUIRED_AGENTS = ["ralph-planner", "ralph-builder", "ralph-reviewer", "ralph-refactor", "ralph-improver", "ralph-fixer"];
const CONFIG_DIR_NAME = ".pi";

function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  const m = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content };
  const frontmatter = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z_]+)\s*:\s*(.*)$/);
    if (kv) frontmatter[kv[1]] = kv[2].trim();
  }
  return { frontmatter, body: m[2] };
}

function findNearestPiAgentsDir(cwd) {
  let current = cwd;
  while (true) {
    const candidate = path.join(current, CONFIG_DIR_NAME, "agents");
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      /* not present */
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Discovers `ralph-*.md` agent definitions under the nearest `.pi/agents/`.
 * @param {string} cwd
 * @returns {Array<{name:string,description:string,tools?:string[],model?:string,systemPrompt:string,filePath:string}>}
 */
function discoverRalphAgents(cwd) {
  const dir = findNearestPiAgentsDir(cwd);
  if (!dir) return [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const agents = [];
  for (const entry of entries) {
    if (!entry.name.startsWith("ralph-") || !entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    const filePath = path.join(dir, entry.name);
    const content = fs.readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    if (!frontmatter.name || !frontmatter.description) continue;
    const tools = frontmatter.tools
      ?.split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const model = frontmatter.model && frontmatter.model.length > 0 ? frontmatter.model : undefined;
    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      model,
      systemPrompt: body,
      filePath,
    });
  }
  return agents;
}

/** @param {Array<{name:string}>} agents @throws if a required ralph agent is missing */
function assertRequiredAgents(agents) {
  const missing = REQUIRED_AGENTS.filter((n) => !agents.some((a) => a.name === n));
  if (missing.length) throw new Error(`ralph-loop: missing agents: ${missing.join(", ")}`);
}

module.exports = { discoverRalphAgents, assertRequiredAgents, REQUIRED_AGENTS };
