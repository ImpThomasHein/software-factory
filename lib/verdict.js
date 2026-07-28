"use strict";

/** Ported 1:1 from .pi/extensions/ralph-loop/tickets/verdict.ts */

const VERDICT_LINE_RE = /verdict\s*:\s*\**\s*(ready|needs_work)\s*\**/gi;

/** @param {string} reviewerText @returns {"READY"|"NEEDS_WORK"} */
function parseVerdict(reviewerText) {
  const matches = [...reviewerText.matchAll(VERDICT_LINE_RE)];
  if (matches.length === 0) return "NEEDS_WORK";
  const last = matches[matches.length - 1][1].toLowerCase();
  return last === "ready" ? "READY" : "NEEDS_WORK";
}

module.exports = { parseVerdict };
