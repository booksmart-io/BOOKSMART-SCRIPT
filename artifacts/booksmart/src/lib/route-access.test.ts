import assert from "node:assert/strict";
import test from "node:test";
import { canRenderProtectedRoute, homeRouteForRole, isActiveCpaEngagement } from "./route-access";

test("rejects a user or admin from CPA routes", () => {
  assert.equal(canRenderProtectedRoute({ requiredRole: "cpa", profileRole: "user", location: "/cpa" }), false);
  assert.equal(canRenderProtectedRoute({ requiredRole: "cpa", profileRole: "admin", location: "/cpa/orders" }), false);
});

test("rejects an unapproved CPA from operational CPA routes", () => {
  for (const verificationStatus of [undefined, null, "pending", "rejected"]) {
    assert.equal(
      canRenderProtectedRoute({ requiredRole: "cpa", profileRole: "cpa", verificationStatus, location: "/cpa/clients" }),
      false,
    );
  }
});

test("allows an unapproved CPA to complete or review their profile", () => {
  assert.equal(
    canRenderProtectedRoute({ requiredRole: "cpa", profileRole: "cpa", verificationStatus: "pending", location: "/cpa/profile" }),
    true,
  );
  assert.equal(
    canRenderProtectedRoute({ requiredRole: "cpa", profileRole: "cpa", verificationStatus: "rejected", location: "/cpa/under-review" }),
    true,
  );
});

test("allows an approved CPA to render operational routes", () => {
  assert.equal(
    canRenderProtectedRoute({ requiredRole: "cpa", profileRole: "cpa", verificationStatus: "APPROVED", location: "/cpa/orders" }),
    true,
  );
});

test("maps each role to its own dashboard", () => {
  assert.equal(homeRouteForRole("user"), "/user");
  assert.equal(homeRouteForRole("cpa"), "/cpa");
  assert.equal(homeRouteForRole("admin"), "/admin");
});

test("financial access is limited to active engagement statuses", () => {
  for (const status of ["active", "in_progress", "in-progress"]) assert.equal(isActiveCpaEngagement(status), true);
  for (const status of ["pending", "completed", "cancelled", "rejected"]) assert.equal(isActiveCpaEngagement(status), false);
});
