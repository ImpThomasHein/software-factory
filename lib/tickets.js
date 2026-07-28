"use strict";

/**
 * Pure ticket parsing/mutation functions, ported 1:1 from
 * .pi/extensions/ralph-loop/tickets/parser.ts so both implementations stay
 * behaviourally identical. No side effects except setTicketDone (which
 * returns new content — callers persist it).
 */

const HEADING_RE = /^##\s+(\d+)\.\s+(.*)$/;
const BLOCKED_BY_RE = /\*\*Blocked by:\*\*\s*(.*)$/;

function parseBlockedBy(raw, allTitles) {
  if (/none|—/i.test(raw)) return [];
  const idMatches = [...raw.matchAll(/(\d+)(?:\.|,|;|\s|$)/g)];
  const ids = idMatches.map((m) => Number(m[1])).filter((n) => allTitles.has(n));
  return [...new Set(ids)];
}

/** @param {string} content @returns {Array<object>} */
function parseTickets(content) {
  const lines = content.split("\n");
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE);
    if (m) headings.push({ id: Number(m[1]), title: m[2].trim(), line: i + 1 });
  }
  const titleMap = new Map(headings.map((h) => [h.id, h.title]));

  const tickets = [];
  for (let h = 0; h < headings.length; h++) {
    const { id, title, line: startLine } = headings[h];
    const endLine = h + 1 < headings.length ? headings[h + 1].line - 1 : lines.length;
    let blockedBy = [];
    const checkboxes = [];
    for (let i = startLine - 1; i < endLine; i++) {
      const bl = lines[i].match(BLOCKED_BY_RE);
      if (bl) blockedBy = parseBlockedBy(bl[1], titleMap);
      const cb = lines[i].match(/^\s*-\s+\[(x| )\]\s+.*/i);
      if (cb) checkboxes.push(lines[i].trimStart());
    }
    const done = checkboxes.length > 0 && checkboxes.every((c) => /^-\s+\[x\]/i.test(c));
    tickets.push({ id, title, headingLine: lines[startLine - 1], blockedBy, checkboxes, done, startLine, endLine });
  }
  return tickets;
}

/** @param {Array<object>} tickets @returns {object|undefined} */
function findFrontier(tickets) {
  const byId = new Map(tickets.map((t) => [t.id, t]));
  for (const t of tickets) {
    if (t.done) continue;
    if (t.blockedBy.every((bid) => byId.get(bid)?.done ?? false)) return t;
  }
  return undefined;
}

/** @param {string} content @param {number} ticketId @returns {string} */
function setTicketDone(content, ticketId) {
  const tickets = parseTickets(content);
  const ticket = tickets.find((t) => t.id === ticketId);
  if (!ticket) throw new Error(`unknown ticket id: ${ticketId}`);
  const lines = content.split("\n");
  for (let i = ticket.startLine - 1; i < ticket.endLine; i++) {
    if (/^\s*-\s+\[\s\]/.test(lines[i])) {
      lines[i] = lines[i].replace(/(\[\s\])/, "[x]");
    }
  }
  return lines.join("\n");
}

module.exports = { parseTickets, findFrontier, setTicketDone };
