"use strict";

const { mkdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

/** Ported 1:1 from .pi/extensions/ralph-loop/logging/agent-logs.ts */

function renderMessages(result) {
  const lines = [];
  for (const msg of result.messages || []) {
    if (msg.role === "assistant") {
      for (const part of msg.content || []) {
        if (part.type === "text" && part.text) lines.push(`### assistant\n${part.text}`);
        else if (part.type === "toolCall") lines.push(`### assistant (tool call: ${part.name})\n\`\`\`json\n${JSON.stringify(part.arguments, null, 2)}\n\`\`\``);
      }
    } else if (msg.role === "toolResult") {
      const text = (msg.content || []).map((c) => (c.type === "text" ? c.text : "")).join("\n");
      lines.push(`### tool result\n${text}`);
    }
  }
  return lines.join("\n\n");
}

function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

/**
 * @param {string} logDir
 * @param {number} iteration
 * @param {object} result SubagentResult-shaped object (see spawn.js)
 * @param {string} [ticketTitle]
 * @returns {Promise<string>} path of the written log file
 */
async function writeAgentLog(logDir, iteration, result, ticketTitle) {
  await mkdir(logDir, { recursive: true });
  const ticketPart = ticketTitle ? `-${sanitizeFilename(ticketTitle)}` : "";
  const file = join(logDir, `iter-${String(iteration).padStart(2, "0")}${ticketPart}-${result.name}.md`);
  const body = [
    `# Iteration ${iteration} — ${result.name}`,
    ``,
    `**Task:** ${result.task}`,
    ``,
    `**Exit code:** ${result.exitCode}`,
    `**Stop reason:** ${result.stopReason ?? "n/a"}`,
    `**Model:** ${result.model ?? "default"}`,
    `**Usage:** ${result.usage ? `turns=${result.usage.turns} in=${result.usage.input} out=${result.usage.output} cost=${(result.usage.cost ?? 0).toFixed(4)}` : "n/a"}`,
    result.errorMessage ? `**Error:** ${result.errorMessage}` : "",
    ``,
    `---`,
    ``,
    renderMessages(result),
    ``,
    `---`,
    ``,
    `### Final output`,
    result.finalOutput || "(none)",
  ]
    .filter((s) => s !== "")
    .join("\n");
  await writeFile(file, body + "\n", "utf8");
  return file;
}

module.exports = { writeAgentLog };
