"use strict";

const { appendFile, mkdir, access } = require("node:fs/promises");
const { dirname } = require("node:path");

/** Ported 1:1 from .pi/extensions/ralph-loop/logging/progress.ts */

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function bullets(items) {
  return items.map((i) => `- ${i}`).join("\n");
}

/**
 * @param {object} input see ProgressInput shape in the original .ts source
 * @returns {string}
 */
function formatProgressEntry(input) {
  const ao = input?.agentOutputs ?? {};
  const sections = [];
  sections.push(`## Iteration ${input?.iteration ?? "?"}/${input?.totalIterations ?? "?"} — #${input?.ticketId ?? "?"}: ${input?.ticketTitle ?? "?"}`);
  sections.push(`Started: ${input?.startedAt?.toISOString?.() || "unknown"}`);
  sections.push(`Finished: ${input?.finishedAt?.toISOString?.() || "unknown"}`);
  sections.push(`Dev time: ${formatDuration(input?.devTimeSeconds ?? 0)}`);
  sections.push(`Lines of code: ${input?.linesOfCode ?? 0}`);
  sections.push(`Lines of tests: ${input?.linesOfTests ?? 0}`);
  sections.push(`Verdict: ${input?.verdict ?? "?"}`);
  sections.push(`Ticket marked done: ${input?.ticketMarkedDone ? "yes" : "no"}`);

  sections.push("### Planner");
  sections.push(ao.planner ?? "(none)");
  sections.push("### Builder");
  sections.push(ao.builder ?? "(none)");
  sections.push("### Reviewer");
  sections.push(ao.reviewer ?? "(none)");
  if (ao.refactorer) {
    sections.push("### Refactorer");
    sections.push(ao.refactorer);
  }
  if (ao.improver) {
    sections.push("### Loop Improver");
    sections.push(ao.improver);
  }

  sections.push("### Design decisions");
  sections.push(bullets(input?.designDecisions ?? []));
  sections.push("### Recommendations for further development");
  sections.push(bullets(input?.recommendations ?? []));
  sections.push("### Test run result");
  sections.push(input?.testRunResult ?? "(none)");
  sections.push("### Key changes");
  sections.push(bullets(input?.keyChanges ?? []));
  sections.push("### Key insights");
  sections.push(bullets(input?.keyInsights ?? []));

  return sections.join("\n\n") + "\n";
}

const HEADER = "# Ralph Loop — Progress Log\n\nAppend-only. Newest entries at the bottom.\n\n---\n\n";

/** @param {string} filePath @param {string} entry @returns {Promise<void>} */
async function appendProgress(filePath, entry) {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await access(filePath);
  } catch {
    await appendFile(filePath, HEADER, "utf8");
  }
  await appendFile(filePath, entry + "\n", "utf8");
}

module.exports = { formatProgressEntry, appendProgress };
