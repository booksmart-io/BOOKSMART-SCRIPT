import { createClient } from "@supabase/supabase-js";

const E2E_ORG_PREFIX = "E2E_SYNTHETIC_";
const E2E_EMAIL_SUFFIX = "@booksmart-e2e.example.test";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.env.E2E_TARGET !== "test") {
  throw new Error("Refusing E2E database access unless E2E_TARGET=test");
}

const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: organizations, error: organizationError } = await admin
  .from("organizations")
  .select("id,owner_id,name")
  .like("name", `${E2E_ORG_PREFIX}%`)
  .order("id");
if (organizationError) throw organizationError;

const ownerIds = [...new Set((organizations ?? []).map(row => Number(row.owner_id)))];
const { data: owners, error: ownerError } = ownerIds.length
  ? await admin.from("users").select("id,email,auth_id").in("id", ownerIds)
  : { data: [], error: null };
if (ownerError) throw ownerError;
const ownerById = new Map((owners ?? []).map(owner => [Number(owner.id), owner]));

const scopedTables = [
  ["transactions", "org_id"], ["jobber_records", "organization_id"], ["jobber_connections", "organization_id"],
  ["quickbooks_connections", "organization_id"], ["quickbooks_staged_entities", "organization_id"],
  ["plaid_items", "org_id"], ["account_balance_snapshots", "organization_id"],
  ["business_signals", "organization_id"], ["monitoring_tasks", "organization_id"],
  ["contractor_financial_matches", "organization_id"], ["contractor_job_cost_assignments", "organization_id"],
  ["contractor_receipt_extractions", "organization_id"], ["contractor_source_links", "organization_id"],
] as const;

console.log("BOOKSMART E2E SAFETY AUDIT (READ ONLY)");
console.log(`Synthetic organization prefix: ${E2E_ORG_PREFIX}`);
console.log(`Synthetic owner suffix: ${E2E_EMAIL_SUFFIX}`);
console.log(`Candidate organizations: ${organizations?.length ?? 0}`);

for (const organization of organizations ?? []) {
  const owner = ownerById.get(Number(organization.owner_id));
  const ownerSafe = typeof owner?.email === "string" && owner.email.endsWith(E2E_EMAIL_SUFFIX);
  console.log(`\nOrganization ${organization.id}: ${organization.name}`);
  console.log(`Owner: ${owner?.email ?? "missing"} (${ownerSafe ? "SAFE" : "REFUSED"})`);
  if (!ownerSafe) {
    console.log("No reset may target this organization because its owner is not synthetic.");
    continue;
  }
  for (const [table, column] of scopedTables) {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, organization.id);
    console.log(`${table}: ${error ? `unavailable (${error.code})` : count ?? 0}`);
  }
}

console.log("\nDry run complete. This command contains no insert, update, delete, RPC, or auth-admin operation.");
