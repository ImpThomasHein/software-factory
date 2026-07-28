"use strict";

/** Ported 1:1 from .pi/extensions/ralph-loop/utils/notify.ts */

/** @param {string} title @param {string} message @returns {Promise<void>} */
async function sendNtfyNotification(title, message) {
  const url = "https://ntfy.sh/";
  const topic = process.env.RALPH_NTFY_TOPIC ?? "SKtIGaG0TKvEP9UM";
  try {
    await fetch(`${url}${topic}`, { method: "POST", body: `${title}\n\n${message}` });
  } catch {
    // silently ignore — notification ist nicht kritisch
  }
}

module.exports = { sendNtfyNotification };
