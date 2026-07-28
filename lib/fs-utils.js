"use strict";

const { readdir } = require("node:fs/promises");

/** Ported from .pi/extensions/ralph-loop/utils/fs.ts */

/** @param {string} dir @returns {Promise<number>} */
async function countFiles(dir) {
  try {
    const files = await readdir(dir);
    return files.length;
  } catch {
    return 0;
  }
}

/** @param {string} dir @returns {Promise<number>} */
async function countTestFiles(dir) {
  try {
    const files = await readdir(dir);
    return files.filter((f) => /\.(test|spec)\.(ts|tsx)$/.test(f)).length;
  } catch {
    return 0;
  }
}

module.exports = { countFiles, countTestFiles };
