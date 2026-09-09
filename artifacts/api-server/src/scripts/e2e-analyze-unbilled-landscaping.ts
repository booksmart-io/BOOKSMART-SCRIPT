import { createClient } from "@supabase/supabase-js";
import { runMonitoring } from "../lib/monitoring-runner";

const ORG_NAME = "E2E_SYNTHETIC_04_UNBILLED_LANDSCAPING";
const OWNER_EMAIL = "scenario-04@booksmart-e2e.example.test";
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (process.env.E2E_TARGET !== "test") throw new Error("Refusing analysis unless E2E_TARGET=test");
process.env.CONTRACTOR_INTELLIGENCE_MONITORING_ENABLED = "true";
const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const { data: organization, error } = await admin.from("organizations").select("id,owner_id,name").eq("name", ORG_NAME).single();
if (error) throw error;
const { data: owner, error: ownerError } = await admin.from("users").select("email").eq("id", organization.owner_id).single();
if (ownerError) throw ownerError;
if (owner.email !== OWNER_EMAIL) throw new Error("Refusing analysis: exact synthetic owner check failed");
const run = await runMonitoring(admin, "manual", Number(organization.id), { idempotencyKey: `e2e-04-${Date.now()}` });
const { data: signals, error: signalError } = await admin.from("business_signals")
  .select("signal_key,title,amount,status,source_ids").eq("organization_id", organization.id).eq("signal_key", "contractor:completed-work-unbilled");
if (signalError) throw signalError;
console.log(`Monitoring run: ${run.status}`);
console.log(JSON.stringify(signals ?? [], null, 2));
