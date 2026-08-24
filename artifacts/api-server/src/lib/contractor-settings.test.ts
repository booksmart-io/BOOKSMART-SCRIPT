import test from "node:test";
import assert from "node:assert/strict";
import { parseContractorMarginSetting } from "./contractor-settings";

test("accepts explicit organization and industry target margins", () => {
  assert.deepEqual(parseContractorMarginSetting({ targetGrossMargin: 0.3, targetMarginSource: "organization" }), { targetGrossMargin: 0.3, targetMarginSource: "organization" });
  assert.deepEqual(parseContractorMarginSetting({ targetGrossMargin: 0.25, targetMarginSource: "industry" }), { targetGrossMargin: 0.25, targetMarginSource: "industry" });
});

test("allows clearing but rejects invented or malformed defaults", () => {
  assert.deepEqual(parseContractorMarginSetting({ targetGrossMargin: null, targetMarginSource: null }), { targetGrossMargin: null, targetMarginSource: null });
  assert.throws(() => parseContractorMarginSetting({ targetGrossMargin: 30, targetMarginSource: "organization" }));
  assert.throws(() => parseContractorMarginSetting({ targetGrossMargin: 0.3, targetMarginSource: "global" }));
});
