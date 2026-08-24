import assert from "node:assert/strict";
import test from "node:test";
import { evaluateJobberCpaEscalationPreview, jobberCpaSharingEligibility } from "./jobber-cpa-escalation";
import type { JobberMonitoringRecord } from "./jobber-monitoring";

const now = new Date("2026-08-20T12:00:00.000Z");
const record = (overrides: Partial<JobberMonitoringRecord> = {}): JobberMonitoringRecord => ({
  external_id: "job-1", object_type: "jobs", record_number: "12", status: "requires_invoicing", title: "Example",
  amount: 99_999, starts_at: null, ends_at: null, source_created_at: null, source_updated_at: null,
  direct_url: "https://secure.getjobber.com/job-1", is_archived: false,
  payload: { uninvoicedTotal: 5_000, completedAt: "2026-08-06T12:00:00.000Z" }, ...overrides,
});

test("CPA escalation preview requires explicit amount, completion evidence, amount boundary, and 14 days", () => {
  assert.equal(evaluateJobberCpaEscalationPreview([record()], now).length, 1);
  assert.equal(evaluateJobberCpaEscalationPreview([record({ payload: { uninvoicedTotal: 4_999.99, completedAt: "2026-08-06T12:00:00.000Z" } })], now).length, 0);
  assert.equal(evaluateJobberCpaEscalationPreview([record({ payload: { uninvoicedTotal: 5_000, completedAt: "2026-08-07T12:00:00.000Z" } })], now).length, 0);
  assert.equal(evaluateJobberCpaEscalationPreview([record({ payload: { completedAt: "2026-08-01T12:00:00.000Z" } })], now).length, 0);
  assert.equal(evaluateJobberCpaEscalationPreview([record({ payload: { uninvoicedTotal: 9_000 } })], now).length, 0);
});

test("CPA preview stays operational and owner consent plus an active approved engagement are both required", () => {
  const candidate = evaluateJobberCpaEscalationPreview([record()], now)[0]!;
  assert.equal(candidate.accountingEffect, "none");
  assert.match(candidate.description, /not recognized BookSmart revenue/i);
  assert.deepEqual(jobberCpaSharingEligibility({ consentEnabled: false, activeApprovedCpaEngagement: true }), { eligible: false, reasons: ["owner_consent_required"] });
  assert.deepEqual(jobberCpaSharingEligibility({ consentEnabled: true, activeApprovedCpaEngagement: false }), { eligible: false, reasons: ["active_approved_cpa_engagement_required"] });
  assert.deepEqual(jobberCpaSharingEligibility({ consentEnabled: true, activeApprovedCpaEngagement: true }), { eligible: true, reasons: [] });
});
