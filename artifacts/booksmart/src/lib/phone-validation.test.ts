import assert from "node:assert/strict";
import test from "node:test";
import { formatUsPhoneNumber, isValidUsPhone } from "./phone-validation";

test("formats U.S. phone numbers while typing", () => {
  assert.equal(formatUsPhoneNumber("2125550123"), "(212) 555-0123");
  assert.equal(formatUsPhoneNumber("12125550123"), "(212) 555-0123");
  assert.equal(formatUsPhoneNumber("21255"), "(212) 55");
});

test("validates North American numbering rules", () => {
  assert.equal(isValidUsPhone("(212) 555-0123"), true);
  assert.equal(isValidUsPhone("+1 212 555 0123"), true);
  assert.equal(isValidUsPhone("123-555-0123"), false);
  assert.equal(isValidUsPhone("212-155-0123"), false);
  assert.equal(isValidUsPhone("212-555-012"), false);
});
