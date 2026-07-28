"use strict";

const { appendFile, access, mkdir } = require("node:fs/promises");
const { dirname } = require("node:path");

/** Ported 1:1 from .pi/extensions/ralph-loop/logging/improvements.ts */

const HEADER = "# Ralph Loop — Improvement Suggestions\n\nAppend-only. Newest sections at the bottom.\n\n---\n\n";

/** @param {string} filePath @param {string} section @returns {Promise<void>} */
async function appendImprovement(filePath, section) {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await access(filePath);
  } catch {
    await appendFile(filePath, HEADER, "utf8");
  }
  await appendFile(filePath, section + "\n\n---\n\n", "utf8");
}

module.exports = { appendImprovement };
