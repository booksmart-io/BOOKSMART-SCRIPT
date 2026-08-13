import assert from "node:assert/strict";
import test from "node:test";
import { taskAssignmentLabel, taskSourceLabel } from "./monitoring-task-presentation";

test("task ownership is explicit for owners, CPAs, and BookSmart", () => {
  assert.equal(taskAssignmentLabel("owner"), "Assigned to you");
  assert.equal(taskAssignmentLabel("cpa"), "Assigned to CPA");
  assert.equal(taskAssignmentLabel("booksmart"), "Managed by BookSmart");
});

test("persistent task sources use production-facing explanations", () => {
  assert.equal(taskSourceLabel("signal"), "Created from a monitored change");
  assert.equal(taskSourceLabel("bookkeeping"), "Created from bookkeeping review");
  assert.equal(taskSourceLabel("tax_calendar"), "Created from the tax calendar");
});
