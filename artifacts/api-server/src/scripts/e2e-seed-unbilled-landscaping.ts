import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { scenario } from "../../../../e2e/scenarios/04_unbilled_landscaping/scenario";

const ORG_NAME = "E2E_SYNTHETIC_04_UNBILLED_LANDSCAPING";
const OWNER_EMAIL = "scenario-04@booksmart-e2e.example.test";
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (process.env.E2E_TARGET !== "test") throw new Error("Refusing seed unless E2E_TARGET=test");

const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: existingOrg, error: existingOrgError } = await admin.from("organizations")
  .select("id,owner_id,name").eq("name", ORG_NAME).maybeSingle();
if (existingOrgError) throw existingOrgError;
if (existingOrg) {
  const { data: owner, error } = await admin.from("users").select("email").eq("id", existingOrg.owner_id).single();
  if (error) throw error;
  if (owner.email !== OWNER_EMAIL) throw new Error("Refusing collision: synthetic organization owner does not match the exact E2E identity");
  console.log(`Scenario already seeded safely at organization ${existingOrg.id}; no rows changed.`);
  process.exit(0);
}

const { data: publicOwner, error: publicOwnerError } = await admin.from("users").select("id,auth_id,email").eq("email", OWNER_EMAIL).maybeSingle();
if (publicOwnerError) throw publicOwnerError;
let authId = publicOwner?.auth_id as string | null | undefined;
if (!authId) {
  const password = `E2E-${randomBytes(24).toString("base64url")}!9a`;
  const { data, error } = await admin.auth.admin.createUser({ email: OWNER_EMAIL, password, email_confirm: true,
    user_metadata: { role: "user", e2e_synthetic: true, scenario_id: scenario.manifest.scenarioId } });
  if (error) throw error;
  authId = data.user.id;
}

let ownerId = publicOwner?.id as number | undefined;
if (!ownerId) {
  const { data, error } = await admin.from("users").insert({ auth_id: authId, email: OWNER_EMAIL, role: "user",
    first_name: "Synthetic", last_name: "Landscaper", phone_number: "", token_balance: 0 }).select("id").single();
  if (error) throw error;
  ownerId = Number(data.id);
}

const { data: organization, error: organizationError } = await admin.from("organizations").insert({
  owner_id: ownerId, name: ORG_NAME, org_type: "llc", industry: scenario.manifest.industry,
  email: OWNER_EMAIL, ein_tin: "00-0000004", state: 1, street: "404 Synthetic Way",
  city: "Testville", zip: "00004", phone: "5550000004", website: "https://scenario-04.example.test",
}).select("id").single();
if (organizationError) throw organizationError;
const organizationId = Number(organization.id);

const now = "2026-08-31T23:00:00.000Z";
const { data: jobberConnection, error: jobberConnectionError } = await admin.from("jobber_connections").insert({
  organization_id: organizationId, jobber_account_id: `e2e-${scenario.manifest.scenarioId}`,
  jobber_account_name: scenario.manifest.companyName, api_version: "2026-08-28", status: "active",
  verified_at: now, last_successful_sync_at: now,
}).select("id").single();
if (jobberConnectionError) throw jobberConnectionError;
const connectionId = Number(jobberConnection.id);

const contentHash = (payload: unknown) => createHash("sha256").update(JSON.stringify(payload)).digest("hex");
const clientRows = scenario.jobber.clients.map(client => ({ organization_id: organizationId, connection_id: connectionId,
  object_type: "clients", external_id: client.id, title: client.name, payload: { name: client.name, emails: [{ address: client.email }] },
  content_hash: contentHash(client), last_seen_at: now }));
const jobRows = scenario.jobber.jobs.map(job => ({ organization_id: organizationId, connection_id: connectionId,
  object_type: "jobs", external_id: job.id, related_client_id: job.clientId, record_number: job.jobNumber,
  status: job.status, title: job.title, amount: job.total, ends_at: `${job.completedAt}T17:00:00.000Z`,
  source_updated_at: `${job.completedAt}T17:00:00.000Z`, payload: { total: job.total, invoicedTotal: 0, client: { id: job.clientId }, lineItems: job.lineItems },
  content_hash: contentHash(job), last_seen_at: now }));
const { error: jobberRecordsError } = await admin.from("jobber_records").insert([...clientRows, ...jobRows]);
if (jobberRecordsError) throw jobberRecordsError;

const { error: quickBooksConnectionError } = await admin.from("quickbooks_connections").insert({ organization_id: organizationId,
  realm_id: `e2e-${scenario.manifest.scenarioId}`, company_name: scenario.manifest.companyName, country: "US", status: "active",
  verified_at: now, last_synced_at: now, last_sync_status: "completed" });
if (quickBooksConnectionError) throw quickBooksConnectionError;
const { error: stagedError } = await admin.from("quickbooks_staged_entities").insert(scenario.quickbooks.invoices.map(invoice => ({
  organization_id: organizationId, entity_type: "Invoice", external_id: invoice.id, display_name: invoice.invoiceNumber,
  transaction_date: invoice.issuedDate, total_amount: invoice.total, payload: invoice, source_updated_at: `${invoice.issuedDate}T12:00:00.000Z`, import_status: "staged",
})));
if (stagedError) throw stagedError;

const { error: gmailConnectionError } = await admin.from("gmail_connections").insert({ organization_id: organizationId,
  connected_by_user_id: ownerId, google_account_email: OWNER_EMAIL, status: "active", last_scan_at: now, last_scan_status: "completed" });
if (gmailConnectionError) throw gmailConnectionError;
const { error: gmailError } = await admin.from("contractor_gmail_financial_messages").insert(scenario.gmail.messages.map(message => ({
  organization_id: organizationId, gmail_message_id: message.id, gmail_thread_id: message.threadId, sender: message.sender,
  subject: message.subject, message_date: message.timestamp, detected_document_type: "customer_invoice",
  extracted_reference_numbers: message.subject.match(/[A-Z]+-\d+/g) ?? [], linked_records: [], confidence: "medium",
  matched_signals: [], requires_content_fetch: false, status: "detected", classification_version: "e2e-synthetic-v1",
})));
if (gmailError) throw gmailError;

console.log(`SEEDED ${scenario.manifest.scenarioId}`);
console.log(`Organization ID: ${organizationId}`);
console.log(`Jobber clients: ${clientRows.length}`);
console.log(`Completed unbilled jobs: ${jobRows.length}`);
console.log("No existing development tenant was updated or deleted.");
