import { createClient } from "@supabase/supabase-js";
import { scenarioById } from "../../../../e2e/all-scenarios";

const scenarioId = process.env.E2E_SCENARIO_ID?.trim() ?? "";
const entry = scenarioById(scenarioId);
if (!entry) throw new Error(`Unknown E2E_SCENARIO_ID: ${scenarioId}`);
if (process.env.E2E_TARGET !== "test") throw new Error("Refusing import unless E2E_TARGET=test");
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; };
const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const slug = scenarioId.toLowerCase().replaceAll("_", "-");
const ownerEmail = `${slug}@booksmart-e2e.example.test`;
const { data: organization, error: organizationError } = await admin.from("organizations").select("id,owner_id").eq("name", `E2E_SYNTHETIC_${scenarioId}`).single();
if (organizationError) throw organizationError;
const { data: owner, error: ownerError } = await admin.from("users").select("id,email,auth_id").eq("id", organization.owner_id).single();
if (ownerError) throw ownerError;
if (owner.email !== ownerEmail || !owner.auth_id) throw new Error("Refusing import: exact synthetic owner relationship failed");

const deposits = entry.fixture.quickbooks.deposits.map(deposit => ({ organization_id: organization.id, entity_type: "Deposit",
  external_id: deposit.id, display_name: deposit.description, transaction_date: deposit.date, total_amount: deposit.amount,
  payload: deposit, source_updated_at: `${deposit.date}T12:00:00.000Z`, import_status: "approved", deposit_classification: deposit.classification }));
const purchases = entry.fixture.quickbooks.purchases.map(purchase => ({ organization_id: organization.id, entity_type: "Purchase",
  external_id: purchase.id, display_name: `${purchase.vendor} — ${purchase.description}`, transaction_date: purchase.date,
  total_amount: purchase.amount, payload: purchase, source_updated_at: `${purchase.date}T12:00:00.000Z`, import_status: "approved" }));
const rows = [...deposits, ...purchases];
if (!rows.length) { console.log("No accounting cash records configured."); process.exit(0); }
const { error: upsertError } = await admin.from("quickbooks_staged_entities").upsert(rows, { onConflict: "organization_id,entity_type,external_id" });
if (upsertError) throw upsertError;
const { data: staged, error: stagedError } = await admin.from("quickbooks_staged_entities").select("id")
  .eq("organization_id", organization.id).in("external_id", rows.map(row => row.external_id));
if (stagedError) throw stagedError;
const { data: result, error: importError } = await admin.rpc("import_approved_quickbooks_transactions", {
  requested_organization_id: organization.id, requested_auth_user_id: owner.auth_id,
  requested_staged_ids: (staged ?? []).map(row => Number(row.id)),
});
if (importError) throw importError;
const { data: transactions, error: transactionError } = await admin.from("transactions").select("amount")
  .eq("org_id", organization.id).in("quickbooks_external_id", rows.map(row => row.external_id));
if (transactionError) throw transactionError;
const income = (transactions ?? []).filter(row => Number(row.amount) > 0).reduce((sum, row) => sum + Number(row.amount), 0);
const expenses = Math.abs((transactions ?? []).filter(row => Number(row.amount) < 0).reduce((sum, row) => sum + Number(row.amount), 0));
console.log(`Imported accounting records: ${transactions?.length ?? 0}`);
console.log(`Canonical cash income: ${income}`);
console.log(`Canonical cash expenses: ${expenses}`);
console.log(`Net cash movement: ${income - expenses}`);
console.log(`Importer result: ${JSON.stringify(result)}`);
