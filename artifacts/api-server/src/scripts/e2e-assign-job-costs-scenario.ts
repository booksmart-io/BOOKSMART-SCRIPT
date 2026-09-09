import { createClient } from "@supabase/supabase-js";
import { scenarioById } from "../../../../e2e/all-scenarios";

const scenarioId = process.env.E2E_SCENARIO_ID?.trim() ?? "";
const entry = scenarioById(scenarioId);
if (!entry) throw new Error(`Unknown E2E_SCENARIO_ID: ${scenarioId}`);
if (process.env.E2E_TARGET !== "test") throw new Error("Refusing assignment unless E2E_TARGET=test");
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; };
const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const slug = scenarioId.toLowerCase().replaceAll("_", "-");
const exactName = `E2E_SYNTHETIC_${scenarioId}`;
const exactEmail = `${slug}@booksmart-e2e.example.test`;
const { data: organization, error: organizationError } = await admin.from("organizations").select("id,owner_id").eq("name", exactName).single();
if (organizationError) throw organizationError;
const { data: owner, error: ownerError } = await admin.from("users").select("email").eq("id", organization.owner_id).single();
if (ownerError) throw ownerError;
if (owner.email !== exactEmail) throw new Error("Refusing assignment: exact synthetic owner relationship failed");

const configured = entry.fixture.quickbooks.purchases.filter(purchase => purchase.jobNumber);
if (!configured.length) { console.log("No explicit job-cost assignments configured."); process.exit(0); }
const { data: transactions, error: transactionError } = await admin.from("transactions").select("id,quickbooks_external_id,amount")
  .eq("org_id", organization.id).in("quickbooks_external_id", configured.map(row => row.id));
if (transactionError) throw transactionError;
const { data: jobs, error: jobError } = await admin.from("jobber_records").select("external_id,record_number")
  .eq("organization_id", organization.id).eq("object_type", "jobs").in("record_number", configured.map(row => row.jobNumber!));
if (jobError) throw jobError;
const transactionByExternalId = new Map((transactions ?? []).map(row => [String(row.quickbooks_external_id), row]));
const jobByNumber = new Map((jobs ?? []).map(row => [String(row.record_number), row]));
const rows = configured.map(purchase => {
  const transaction = transactionByExternalId.get(purchase.id);
  const job = jobByNumber.get(purchase.jobNumber!);
  if (!transaction || !job) throw new Error(`Missing canonical evidence for ${purchase.id} -> ${purchase.jobNumber}`);
  return { organization_id: organization.id, jobber_job_id: job.external_id, source_provider: "quickbooks", source_record_type: "transaction",
    source_record_id: String(transaction.id), amount: Math.abs(Number(transaction.amount)), cost_category: "job_cost", confidence: "confirmed" };
});
const { error: assignmentError } = await admin.from("contractor_job_cost_assignments").upsert(rows,
  { onConflict: "organization_id,source_provider,source_record_type,source_record_id" });
if (assignmentError) throw assignmentError;
console.log(`Confirmed job-cost assignments: ${rows.length}`);
