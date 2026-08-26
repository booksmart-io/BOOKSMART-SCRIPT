import assert from "node:assert/strict";
import test from "node:test";
import { classifyApiDuration, formatServerTiming } from "./api-timing";

test("classifies API duration using stable operational thresholds", () => {
  assert.equal(classifyApiDuration(749.9), "normal");
  assert.equal(classifyApiDuration(750), "slow");
  assert.equal(classifyApiDuration(1_999.9), "slow");
  assert.equal(classifyApiDuration(2_000), "very_slow");
});

test("formats a safe non-negative Server-Timing value", () => {
  assert.equal(formatServerTiming(123.456), "app;dur=123.5");
  assert.equal(formatServerTiming(-10), "app;dur=0.0");
});
