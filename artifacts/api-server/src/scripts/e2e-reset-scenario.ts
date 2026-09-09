import { createClient } from "@supabase/supabase-js";
import { scenarioById } from "../../../../e2e/all-scenarios";

const scenarioId = process.env.E2E_SCENARIO_ID?.trim() ?? "";
if (!scenarioById(scenarioId)) throw new Error(`Unknown E2E_SCENARIO_ID: ${scenarioId}`);
if (process.env.E2E_TARGET !== "test") throw new Error("Refusing reset unless E2E_TARGET=test");
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; };
const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const slug = scenarioId.toLowerCase().replaceAll("_", "-");
const exactName = `E2E_SYNTHETIC_${scenarioId}`;
const exactEmail = `${slug}@booksmart-e2e.example.test`;
const { data: organization, error: organizationError } = await admin.from("organizations").select("id,owner_id,name").eq("name", exactName).maybeSingle();
if (organizationError) throw organizationError;
if (!organization) {
  const { data: orphan, error: orphanError } = await admin.from("users").select("id,email,auth_id").eq("email", exactEmail).maybeSingle();
  if (orphanError) throw orphanError;
  if (!orphan) {
    console.log("Synthetic scenario is already absent.");
  } else {
    const { count: orphanOrgCount, error: orphanCountError } = await admin.from("organizations").select("*", { count: "exact", head: true }).eq("owner_id", orphan.id);
    if (orphanCountError) throw orphanCountError;
    if (orphanOrgCount !== 0) throw new Error(`Refusing orphan cleanup: exact synthetic owner has ${orphanOrgCount} organizations`);
    console.log(`RESET ${scenarioId}: organization is absent; retained the exact synthetic owner for safe reseeding.`);
  }
  process.exit(0);
}
const { data: owner, error: ownerError } = await admin.from("users").select("id,email,auth_id").eq("id", organization.owner_id).single();
if (ownerError) throw ownerError;
if (organization.name !== exactName || owner.email !== exactEmail || !owner.auth_id) throw new Error("Refusing reset: exact synthetic identity check failed");
const { count, error: countError } = await admin.from("organizations").select("*", { count: "exact", head: true }).eq("owner_id", owner.id);
if (countError) throw countError;
if (count !== 1) throw new Error(`Refusing reset: synthetic owner has ${count} organizations`);
// These child tables have DELETE activity triggers. Remove their rows while the
// exact organization still exists, then clear the notifications they emit.
const { error: deleteAssignmentsError } = await admin.from("contractor_job_cost_assignments").delete().eq("organization_id", organization.id);
if (deleteAssignmentsError) throw deleteAssignmentsError;
const { error: deleteTransactionsError } = await admin.from("transactions").delete().eq("org_id", organization.id);
if (deleteTransactionsError) throw deleteTransactionsError;
const { error: deleteNotificationsError } = await admin.from("account_activity_notifications").delete().eq("organization_id", organization.id);
if (deleteNotificationsError) throw deleteNotificationsError;
const { error: deleteOrgError } = await admin.from("organizations").delete().eq("id", organization.id).eq("name", exactName);
if (deleteOrgError) throw deleteOrgError;
console.log(`RESET ${scenarioId}: deleted only organization ${organization.id}; retained its exact synthetic owner for safe reseeding.`);
