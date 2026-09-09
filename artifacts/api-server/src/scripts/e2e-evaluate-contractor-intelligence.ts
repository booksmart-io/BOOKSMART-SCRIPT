import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { exactContractorIntelligenceScenarios } from "../../../../e2e/contractor-intelligence/exact-scenarios";
import { evaluateProductOutput, type ProductSignal } from "../../../../e2e/contractor-intelligence/evaluate-product-output";

if (process.env.E2E_TARGET !== "test") throw new Error("Refusing evaluation unless E2E_TARGET=test");
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; };
const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const requested = process.env.E2E_SCENARIO_ID?.trim();
const entries = requested ? exactContractorIntelligenceScenarios.filter(row => row.fixture.manifest.scenarioId === requested) : [...exactContractorIntelligenceScenarios];
if (!entries.length) throw new Error(`Unknown exact contractor-intelligence scenario: ${requested}`);
const sections: string[] = ["# BookSmart Contractor Intelligence Actual Product Evaluation", "", "> Fixture validation is not counted as a product pass.", ""];
let passed = 0, partial = 0, failed = 0;
for (const entry of entries) {
  const id = entry.fixture.manifest.scenarioId;
  const { data: organization, error: orgError } = await admin.from("organizations").select("id,owner_id").eq("name", `E2E_SYNTHETIC_${id}`).maybeSingle();
  if (orgError) throw orgError;
  if (!organization) { failed++; sections.push(`## ${id} — ${entry.fixture.manifest.scenarioName}`, "", "**FAIL — tenant has not been seeded/analyzed.**", ""); continue; }
  const expectedEmail = `${id.toLowerCase().replaceAll("_", "-")}@booksmart-e2e.example.test`;
  const { data: owner, error: ownerError } = await admin.from("users").select("email").eq("id", organization.owner_id).single();
  if (ownerError) throw ownerError;
  if (owner.email !== expectedEmail) throw new Error(`Refusing evaluation for ${id}: synthetic owner relationship failed`);
  const { data: rows, error: signalError } = await admin.from("business_signals").select("signal_key,title,amount,source_ids,metadata").eq("organization_id", organization.id).eq("status", "active");
  if (signalError) throw signalError;
  const result = evaluateProductOutput(entry.answerKey, (rows ?? []) as ProductSignal[]);
  if (result.status === "PASS") passed++; else if (result.status === "PARTIAL") partial++; else failed++;
  const missing = [...result.missingInsights.map(v=>`insight ${v}`),...result.missingNumericValues.map(v=>`numeric ${v}`),...result.missingMatches.map(v=>`match ${v}`),...result.missingDuplicates.map(v=>`duplicate ${v}`),...result.missingConflicts.map(v=>`conflict ${v}`),...result.missingConfidenceIssues.map(v=>`confidence ${v}`),...result.prohibitedConclusionsFound.map(v=>`prohibited conclusion ${v}`)];
  sections.push(`## ${id} — ${entry.fixture.manifest.scenarioName}`, "", `**${result.status} — ${result.satisfiedChecks}/${result.expectedChecks} declared checks evidenced by actual signals.**`, "", `Actual insights: ${result.actualInsightKeys.length ? result.actualInsightKeys.join(", ") : "none"}`, "", `Missing output: ${missing.length ? missing.join("; ") : "none"}`, "");
}
sections.splice(4, 0, `Summary: **${passed} PASS / ${partial} PARTIAL / ${failed} FAIL**`, "");
const output = resolve(import.meta.dirname, "../../../../BOOKSMART_CONTRACTOR_INTELLIGENCE_ACTUAL_RESULTS.md");
await writeFile(output, `${sections.join("\n")}\n`, "utf8");
console.log(`Wrote actual-output evaluation to ${output}`);
console.log(`${passed} PASS / ${partial} PARTIAL / ${failed} FAIL`);
if (failed || partial) process.exitCode = 2;
