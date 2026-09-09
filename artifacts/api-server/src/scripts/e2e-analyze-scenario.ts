import { createClient } from "@supabase/supabase-js";
import { scenarioById } from "../../../../e2e/all-scenarios";
import { runMonitoring } from "../lib/monitoring-runner";
import { evaluateProductOutput } from "../../../../e2e/contractor-intelligence/evaluate-product-output";

const scenarioId = process.env.E2E_SCENARIO_ID?.trim() ?? "";
const entry = scenarioById(scenarioId);
if (!entry) throw new Error(`Unknown E2E_SCENARIO_ID: ${scenarioId}`);
if (process.env.E2E_TARGET !== "test") throw new Error("Refusing analysis unless E2E_TARGET=test");
process.env.CONTRACTOR_INTELLIGENCE_MONITORING_ENABLED = "true";
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; };
const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const orgName = `E2E_SYNTHETIC_${scenarioId}`;
const ownerEmail = `${scenarioId.toLowerCase().replaceAll("_", "-")}@booksmart-e2e.example.test`;
const { data: organization, error } = await admin.from("organizations").select("id,owner_id,name").eq("name", orgName).single();
if (error) throw error;
const { data: owner, error: ownerError } = await admin.from("users").select("email").eq("id", organization.owner_id).single();
if (ownerError) throw ownerError;
if (owner.email !== ownerEmail) throw new Error("Refusing analysis: exact synthetic owner relationship failed");
const run = await runMonitoring(admin, "manual", Number(organization.id), { idempotencyKey: `e2e-${scenarioId}-${Date.now()}` });
const { data: signals, error: signalError } = await admin.from("business_signals")
  .select("signal_key,title,amount,status,severity,source_ids,metadata").eq("organization_id", organization.id).eq("status", "active");
if (signalError) throw signalError;
const active = signals ?? [];
const prohibited = active.filter(signal => entry.fixture.manifest.prohibitedInsightKeys.includes(signal.signal_key));
const missingExpected = entry.fixture.manifest.expectedInsightKeys.filter(expected => !active.some(signal => signal.signal_key === expected || signal.signal_key.startsWith(`${expected}:`)));
console.log(`Monitoring run: ${run.status}`);
console.log(`Active insights: ${active.length}`);
for (const signal of active) console.log(`${signal.severity} ${signal.signal_key}: ${signal.title}`);
if (prohibited.length) throw new Error(`Prohibited false positives: ${prohibited.map(signal => signal.signal_key).join(", ")}`);
if (missingExpected.length) throw new Error(`Missing expected insights: ${missingExpected.join(", ")}`);
const hasRichChecks = Boolean(entry.answerKey.expectedInsights?.length || Object.keys(entry.answerKey.expectedNumericValues ?? {}).length || entry.answerKey.expectedMatches?.length || entry.answerKey.expectedDuplicates?.length || entry.answerKey.expectedConflicts?.length || entry.answerKey.expectedConfidenceIssues?.length || entry.answerKey.prohibitedConclusions?.length);
if (hasRichChecks) {
  const evaluation = evaluateProductOutput(entry.answerKey, active);
  console.log(`Actual product evaluation: ${evaluation.status} (${evaluation.satisfiedChecks}/${evaluation.expectedChecks})`);
  const missing = [...evaluation.missingInsights, ...evaluation.missingNumericValues, ...evaluation.missingMatches, ...evaluation.missingDuplicates, ...evaluation.missingConflicts, ...evaluation.missingConfidenceIssues, ...evaluation.prohibitedConclusionsFound.map(value => `prohibited:${value}`)];
  if (missing.length) console.log(`Missing actual outputs: ${missing.join(", ")}`);
  if (evaluation.status !== "PASS") process.exitCode = 2;
} else {
  console.log("Expected insight check: PASS");
}
console.log("Prohibited insight check: PASS");
