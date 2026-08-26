import assert from "node:assert/strict";
import test from "node:test";
import { authenticatedSubject } from "./require-auth";

test("accepts only a non-empty verified JWT subject", () => {
  assert.equal(authenticatedSubject({ sub: "auth-user-id" }), "auth-user-id");
  assert.equal(authenticatedSubject({ sub: "" }), null);
  assert.equal(authenticatedSubject({ sub: 123 }), null);
  assert.equal(authenticatedSubject(null), null);
});
