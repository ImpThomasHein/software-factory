"use strict";

const { mkdir, appendFile } = require("node:fs/promises");
const { join } = require("node:path");

/**
 * Observability for the Ralph Loop core cycle: one structured record per executed
 * subagent process (planner, builder, reviewer, fixer, refactor, improver, or any
 * custom ralph-*.md agent), independent of which flow node triggered it.
 *
 * Written as JSON Lines (one JSON object per line) so it's both greppable and easy
 * to parse for tooling, and appended immediately after each process finishes so
 * nothing is lost even if a later step in the same iteration fails.
 */

const DEBUG_LOG_FILE = "debug.jsonl";

/**
 * @param {string} logDir directory to write into, e.g. `<cwd>/.pi/ralph-loop/logs`
 * @param {object} record arbitrary JSON-serializable debug record
 * @returns {Promise<string>} path of the debug log file
 */
async function appendDebugRecord(logDir, record) {
  await mkdir(logDir, { recursive: true });
  const file = join(logDir, DEBUG_LOG_FILE);
  await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
  return file;
}

/**
 * Builds the debug record for one `runAgent()` call — the full prompt sent, the
 * resolved agent config, the exact spawned process, and the outcome.
 * @param {{iteration?: number, ticket?: {id: number|string, title: string}}} context
 * @param {{name:string,model?:string,tools?:string[],systemPrompt?:string}} agent
 * @param {string} task
 * @param {object} result SubagentResult from lib/spawn.js#runAgent
 * @returns {object}
 */
function buildDebugRecord(context, agent, task, result) {
  return {
    timestamp: result.finishedAt || new Date().toISOString(),
    iteration: context?.iteration ?? null,
    ticket: context?.ticket ? { id: context.ticket.id, title: context.ticket.title } : null,
    agent: agent.name,
    model: result.model || agent.model || "default",
    tools: agent.tools || null,
    cwd: result.cwd,
    command: result.command,
    args: result.args,
    task,
    exitCode: result.exitCode,
    stopReason: result.stopReason ?? null,
    errorMessage: result.errorMessage ?? null,
    durationMs: result.durationMs ?? null,
    usage: result.usage,
    finalOutputPreview: (result.finalOutput || "").slice(0, 500),
  };
}

module.exports = { appendDebugRecord, buildDebugRecord, DEBUG_LOG_FILE };
