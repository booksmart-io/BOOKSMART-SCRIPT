import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStateId } from "./state-id";

test("normalizes numeric and numeric-string state IDs for deduction matching", () => {
  assert.equal(normalizeStateId(6), 6);
  assert.equal(normalizeStateId("6"), 6);
  assert.equal(normalizeStateId(" 6 "), 6);
});

test("rejects missing or invalid state IDs", () => {
  assert.equal(normalizeStateId(null), null);
  assert.equal(normalizeStateId(undefined), null);
  assert.equal(normalizeStateId(""), null);
  assert.equal(normalizeStateId("California"), null);
  assert.equal(normalizeStateId(0), null);
  assert.equal(normalizeStateId(6.5), null);
});
