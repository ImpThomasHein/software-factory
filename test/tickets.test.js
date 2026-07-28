"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseTickets, findFrontier, setTicketDone } = require("../lib/tickets");

const FIXTURE = `# Tickets: Foo

Work the frontier.

## 1. First Thing

**What to build:** A thing.

**Blocked by:** None — can start immediately.

- [ ] Do alpha
- [ ] Do beta

## 2. Second Thing

**What to build:** Another thing.

**Blocked by:** 1. First Thing

- [ ] Do gamma

## 3. Third Thing

**Blocked by:** 2.

- [x] Already done
`;

describe("parseTickets", () => {
  it("returns one Ticket per ## N. heading", () => {
    const tickets = parseTickets(FIXTURE);
    assert.equal(tickets.length, 3);
    assert.deepEqual(tickets.map((t) => t.id), [1, 2, 3]);
  });

  it("parses blockedBy from the Blocked by line, resolving ids and titles", () => {
    const tickets = parseTickets(FIXTURE);
    assert.deepEqual(tickets[0].blockedBy, []);
    assert.deepEqual(tickets[1].blockedBy, [1]);
    assert.deepEqual(tickets[2].blockedBy, [2]);
  });

  it("collects checkbox lines and sets done when all are - [x]", () => {
    const tickets = parseTickets(FIXTURE);
    assert.equal(tickets[0].checkboxes.length, 2);
    assert.equal(tickets[0].done, false);
    assert.equal(tickets[2].done, true);
  });

  it("records start and end line offsets", () => {
    const tickets = parseTickets(FIXTURE);
    assert.ok(tickets[0].startLine < tickets[1].startLine);
    assert.ok(tickets[0].endLine < tickets[1].startLine + 1);
  });
});

describe("findFrontier", () => {
  it("picks the lowest-id ticket whose blockers are all done", () => {
    const tickets = parseTickets(FIXTURE);
    assert.equal(findFrontier(tickets).id, 1);
  });

  it("skips done tickets and blocked tickets", () => {
    const withFirstDone = FIXTURE.replace("- [ ] Do alpha\n- [ ] Do beta", "- [x] Do alpha\n- [x] Do beta");
    const tickets = parseTickets(withFirstDone);
    assert.equal(findFrontier(tickets).id, 2);
  });

  it("returns undefined when every ticket is done or blocked forever", () => {
    const allDone = FIXTURE
      .replace("- [ ] Do alpha\n- [ ] Do beta", "- [x] Do alpha\n- [x] Do beta")
      .replace("- [ ] Do gamma", "- [x] Do gamma");
    const tickets = parseTickets(allDone);
    assert.equal(findFrontier(tickets), undefined);
  });
});

describe("setTicketDone", () => {
  it("flips only the target ticket's open checkboxes to [x]", () => {
    const updated = setTicketDone(FIXTURE, 1);
    const tickets = parseTickets(updated);
    assert.equal(tickets[0].done, true);
    assert.equal(tickets[1].done, false);
  });

  it("throws for an unknown ticket id", () => {
    assert.throws(() => setTicketDone(FIXTURE, 999), /unknown ticket id/);
  });
});
