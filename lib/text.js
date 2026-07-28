"use strict";

/** Ported 1:1 from .pi/extensions/ralph-loop/utils/text.ts */

/**
 * @param {string} text
 * @param {RegExp} markerRe
 * @returns {string[]}
 */
function extractBullets(text, markerRe) {
  const lines = text.split("\n");
  const out = [];
  let capture = false;
  for (const line of lines) {
    if (markerRe.test(line)) {
      capture = true;
      continue;
    }
    if (capture && /^\s*[-*]\s+/.test(line)) out.push(line.replace(/^\s*[-*]\s+/, "").trim());
    else if (capture && line.trim() === "") capture = false;
  }
  return out.slice(0, 10);
}

module.exports = { extractBullets };
