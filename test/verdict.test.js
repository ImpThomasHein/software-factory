"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseVerdict } = require("../lib/verdict");

describe("parseVerdict", () => {
  it("returns READY when the verdict line says READY", () => {
    assert.equal(parseVerdict("Some notes...\n\nVerdict: READY"), "READY");
  });

  it("returns NEEDS_WORK when the verdict line says NEEDS_WORK", () => {
    assert.equal(parseVerdict("Issues found.\nVerdict: NEEDS_WORK"), "NEEDS_WORK");
  });

  it("tolerates markdown bold around the token", () => {
    assert.equal(parseVerdict("Verdict: **READY**"), "READY");
    assert.equal(parseVerdict("Verdict: **NEEDS_WORK**"), "NEEDS_WORK");
  });

  it("is case-insensitive", () => {
    assert.equal(parseVerdict("verdict: ready"), "READY");
    assert.equal(parseVerdict("VERDICT: needs_work"), "NEEDS_WORK");
  });

  it("prefers the LAST verdict line if several appear", () => {
    assert.equal(parseVerdict("Verdict: NEEDS_WORK\n...more...\nVerdict: READY"), "READY");
  });

  it("defaults to NEEDS_WORK when no verdict token is found", () => {
    assert.equal(parseVerdict("Just some review notes, no verdict"), "NEEDS_WORK");
  });

  it("ignores the tokens appearing inside other words", () => {
    assert.equal(parseVerdict("The code is ALREADY done"), "NEEDS_WORK");
  });
});
