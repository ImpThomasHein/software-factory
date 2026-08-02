"use strict";

/** Ported 1:1 from .pi/extensions/ralph-loop/utils/notify.ts */

async function sendNtfyNotification(title, message) {
  const url = "https://ntfy.sh/";
  const topic = process.env.RALPH_NTFY_TOPIC ?? "SKtIGaG0TKvEP9UM";
  try {
    await fetch(`${url}${topic}`, { method: "POST", body: `${title}\n\n${message}`, signal: AbortSignal.timeout(5000) });
  } catch {
    // silently ignore — notification ist nicht kritisch
  }
}

module.exports = { sendNtfyNotification };
