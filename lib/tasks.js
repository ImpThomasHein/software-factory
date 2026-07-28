"use strict";

const { readFile, access } = require("node:fs/promises");
const { join } = require("node:path");

/** Ported 1:1 from .pi/extensions/ralph-loop/pipeline/tasks.ts (minus YAML pipeline loader — Node-RED flow wiring replaces it). */

const DEFAULT_PIPELINE_AGENTS = ["ralph-planner", "ralph-builder", "ralph-reviewer"];

/** Generic base templates shipped with this package, used as fallback for reuse in fresh projects. */
const TEMPLATES_DIR = join(__dirname, "..", "templates");

/**
 * Appended to every task handed to every ralph-* agent (planner/builder/reviewer/fixer/
 * refactor/improver), starting right where the ticket task is built after `load frontier
 * ticket`. This is how we *guarantee* every agent produces a summary every iteration:
 * the instruction travels with the task text itself instead of relying only on the
 * (optional, project-overridable) system prompt. `ralph-run-agent.js` additionally
 * validates the agent's output against this contract and injects a fallback summary
 * if the agent forgot it, so downstream logs/progress entries are never empty.
 */
const SUMMARY_REQUIREMENT = [
  "",
  "---",
  "WICHTIG: Beende deine Antwort IMMER mit einer eigenen Sektion `## Summary`",
  "(3–5 Sätze, in Prosa), die knapp beschreibt: was du getan hast, welche Dateien",
  "du geändert/erstellt hast und welche Entscheidungen du getroffen hast. Diese",
  "Sektion wird automatisch in die Agenten-Logs und den Progress-Log übernommen —",
  "ohne sie geht diese Iteration ohne nachvollziehbare Dokumentation verloren.",
].join("\n");

function withSummaryRequirement(task) {
  return `${task}${SUMMARY_REQUIREMENT}`;
}

function plannerTask(ticket) {
  return withSummaryRequirement(
    `Ticket #${ticket.id}: ${ticket.title}\n\nAkzeptanzkriterien:\n${ticket.checkboxes.map((c) => `- ${c}`).join("\n")}`
  );
}

function builderTask(ticket, plan) {
  return withSummaryRequirement(
    `Ticket #${ticket.id}: ${ticket.title}\n\nPlan:\n${plan}\n\nAkzeptanzkriterien:\n${ticket.checkboxes.map((c) => `- ${c}`).join("\n")}`
  );
}

function reviewerTask(ticket, buildSummary) {
  return withSummaryRequirement(
    `Ticket #${ticket.id}: ${ticket.title}\n\nAkzeptanzkriterien:\n${ticket.checkboxes.map((c) => `- ${c}`).join("\n")}\n\nBuilder-Zusammenfassung:\n${buildSummary}`
  );
}

function buildFixerTask(ticketId, ticketTitle, plannerOutput, reviewFeedback, attempt) {
  return withSummaryRequirement(
    [
      `Ticket #${ticketId}: ${ticketTitle}`,
      "",
      `Plan (ursprünglich):`,
      plannerOutput ?? "",
      "",
      `Review-Feedback (Versuch ${attempt - 1}):`,
      reviewFeedback,
      "",
      "Bitte behebe alle im Review genannten Defizite. Ändere nur, was nötig ist.",
    ].join("\n")
  );
}

/**
 * Task for `ralph-ci-fixer`, run at the end of the loop when the configurable verify
 * task (default: "pnpm build && pnpm test", see lib/verify.js) fails. `attempt` is the
 * 1-based verify attempt that just failed (i.e. the fixer is about to make attempt+1).
 */
function buildCiFixerTask(command, output, attempt) {
  return withSummaryRequirement(
    [
      `Der abschließende Verify-Task ("${command}") ist fehlgeschlagen (Versuch ${attempt}).`,
      "",
      "Fehlerausgabe (Tail, ggf. gekürzt):",
      "```",
      output || "(keine Ausgabe)",
      "```",
      "",
      "Behebe die genannten Build-/Test-Fehler. Ändere nur, was zur Behebung nötig ist —",
      "kein Refactoring, keine neuen Features. Führe den Verify-Task nicht selbst erneut",
      "aus; die Pipeline prüft danach automatisch erneut.",
    ].join("\n")
  );
}

function refactorTask(changedFiles) {
  return withSummaryRequirement(
    `Refaktoriere die folgenden Dateien (tiefes Refaktoring, keine Verhaltensänderung):\n${changedFiles.map((f) => `- ${f}`).join("\n")}`
  );
}

function improveTask(progressText) {
  return withSummaryRequirement(
    `Analysiere den Progress-Log und schlage Verbesserungen für die Ralph-Loop vor.\n\n${progressText}`
  );
}

/** @param {string} filePath absolute path @returns {Promise<string|null>} trimmed file body without frontmatter, or null if missing/empty */
async function readMarkdownBody(filePath) {
  try {
    await access(filePath);
    const text = await readFile(filePath, "utf8");
    const body = text.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
    return body.length > 0 ? body : null;
  } catch {
    return null;
  }
}

/**
 * Loads the shared system prompt, preferring the project's own file and falling back to
 * this package's generic base template so `ralph-node-red` works out of the box in any repo.
 * @param {string} cwd project repo root
 * @param {string} systemPromptPath project-relative path, e.g. ".pi/ralph-loop/system-prompt.md"
 * @param {string} [templatesDir] override for the package templates dir (mainly for tests)
 * @returns {Promise<string|null>}
 */
async function loadSharedPrompt(cwd, systemPromptPath, templatesDir = TEMPLATES_DIR) {
  const projectPrompt = await readMarkdownBody(join(cwd, systemPromptPath));
  if (projectPrompt) return projectPrompt;
  return readMarkdownBody(join(templatesDir, "system-prompt.md"));
}

/**
 * Loads a project doc (e.g. docs/anforderungen.md, docs/glossar.md), preferring the
 * project's own file and falling back to this package's generic base template.
 * @param {string} cwd project repo root
 * @param {string} docPath project-relative path, e.g. "docs/anforderungen.md"
 * @param {string} templateFileName file name under templates/, e.g. "anforderungen.md"
 * @param {string} [templatesDir] override for the package templates dir (mainly for tests)
 * @returns {Promise<{body: string|null, usedFallback: boolean}>}
 */
async function loadProjectDoc(cwd, docPath, templateFileName, templatesDir = TEMPLATES_DIR) {
  const projectDoc = await readMarkdownBody(join(cwd, docPath));
  if (projectDoc) return { body: projectDoc, usedFallback: false };
  const fallback = await readMarkdownBody(join(templatesDir, templateFileName));
  return { body: fallback, usedFallback: fallback !== null };
}

const SUMMARY_HEADING_RE = /^#{1,6}\s*summary\b/im;

/** @param {string} output agent's final output text @returns {boolean} whether it already contains a `## Summary` section */
function hasSummarySection(output) {
  return typeof output === "string" && SUMMARY_HEADING_RE.test(output);
}

/**
 * Guarantees every agent run ends up with a `## Summary` section, even if the agent
 * ignored the instruction. Used by `ralph-run-agent.js` right after a process exits,
 * so `writeAgentLog` / `progress.md` never lose the "what happened" record.
 * @param {string} output agent's raw final output
 * @param {string} agentName
 * @returns {{output: string, wasMissing: boolean}}
 */
function ensureSummarySection(output, agentName) {
  const text = output || "";
  if (hasSummarySection(text)) return { output: text, wasMissing: false };
  const excerpt = text.trim().split("\n").filter(Boolean).slice(-5).join(" ").slice(0, 400);
  const fallback = [
    "",
    "",
    "## Summary",
    `(automatisch ergänzt — ${agentName} hat keine eigene Summary-Sektion geliefert)`,
    excerpt ? `Letzte Ausgabezeilen: ${excerpt}` : "Keine Ausgabe erhalten.",
  ].join("\n");
  return { output: text + fallback, wasMissing: true };
}

module.exports = {
  DEFAULT_PIPELINE_AGENTS,
  TEMPLATES_DIR,
  SUMMARY_REQUIREMENT,
  plannerTask,
  builderTask,
  reviewerTask,
  buildFixerTask,
  buildCiFixerTask,
  refactorTask,
  improveTask,
  loadSharedPrompt,
  loadProjectDoc,
  hasSummarySection,
  ensureSummarySection,
};
