import assert from "node:assert/strict";
import test from "node:test";
import { APP_ROLES, canTransitionOrder, isAdminRole, isApprovedCpa, isKnownAppRole, isOrderStatus } from "./cpa-access";

test("application roles are explicit and do not silently grant an employee role", () => {
  assert.deepEqual(APP_ROLES, ["user", "cpa", "admin"]);
  for (const role of APP_ROLES) assert.equal(isKnownAppRole(role), true);
  assert.equal(isKnownAppRole("employee"), false);
  assert.equal(isKnownAppRole("owner"), false);
  assert.equal(isKnownAppRole(undefined), false);
});

test("admin authorization is deny-by-default", () => {
  assert.equal(isAdminRole({ role: "admin" }), true);
  assert.equal(isAdminRole({ role: "user" }), false);
  assert.equal(isAdminRole({ role: "cpa" }), false);
  assert.equal(isAdminRole({ role: "employee" }), false);
  assert.equal(isAdminRole(null), false);
});

test("only an approved CPA row passes CPA authorization", () => {
  assert.equal(isApprovedCpa({ id: 1, role: "cpa", verification_status: "APPROVED" }), true);
  assert.equal(isApprovedCpa({ id: 1, role: "cpa", verification_status: "pending" }), false);
  assert.equal(isApprovedCpa({ id: 1, role: "admin", verification_status: "approved" }), false);
  assert.equal(isApprovedCpa(null), false);
});

test("accepts only known order statuses", () => {
  for (const status of ["pending", "active", "completed", "cancelled"]) assert.equal(isOrderStatus(status), true);
  assert.equal(isOrderStatus("refunded"), false);
  assert.equal(isOrderStatus(null), false);
});

test("allows forward order transitions and rejects reopening terminal orders", () => {
  assert.equal(canTransitionOrder("pending", "active"), true);
  assert.equal(canTransitionOrder("pending", "cancelled"), true);
  assert.equal(canTransitionOrder("active", "completed"), true);
  assert.equal(canTransitionOrder("completed", "active"), false);
  assert.equal(canTransitionOrder("cancelled", "pending"), false);
});
