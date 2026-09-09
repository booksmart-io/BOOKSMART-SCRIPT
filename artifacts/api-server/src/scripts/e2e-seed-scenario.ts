import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { scenarioById } from "../../../../e2e/all-scenarios";

const scenarioId = process.env.E2E_SCENARIO_ID?.trim() ?? "";
const entry = scenarioById(scenarioId);
if (!entry) throw new Error(`Unknown E2E_SCENARIO_ID: ${scenarioId}`);
if (process.env.E2E_TARGET !== "test") throw new Error("Refusing seed unless E2E_TARGET=test");
const fixture = entry.fixture;
const slug = scenarioId.toLowerCase().replaceAll("_", "-");
const orgName = `E2E_SYNTHETIC_${scenarioId}`;
const ownerEmail = `${slug}@booksmart-e2e.example.test`;
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; };
const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const { data: existing, error: existingError } = await admin.from("organizations").select("id,owner_id,name").eq("name", orgName).maybeSingle();
if (existingError) throw existingError;
if (existing) {
  const { data: owner, error } = await admin.from("users").select("email").eq("id", existing.owner_id).single();
  if (error) throw error;
  if (owner.email !== ownerEmail) throw new Error("Refusing collision with a non-matching owner");
  console.log(`Scenario already seeded safely at organization ${existing.id}; no rows changed.`);
  process.exit(0);
}

const { data: publicOwner, error: publicOwnerError } = await admin.from("users").select("id,auth_id,email").eq("email", ownerEmail).maybeSingle();
if (publicOwnerError) throw publicOwnerError;
let authId = publicOwner?.auth_id as string | undefined;
if (!authId) {
  const { data, error } = await admin.auth.admin.createUser({ email: ownerEmail,
    password: `E2E-${randomBytes(24).toString("base64url")}!9a`, email_confirm: true,
    user_metadata: { role: "user", e2e_synthetic: true, scenario_id: scenarioId } });
  if (error) throw error;
  authId = data.user.id;
}
let ownerId = publicOwner?.id as number | undefined;
if (!ownerId) {
  const { data, error } = await admin.from("users").insert({ auth_id: authId, email: ownerEmail, role: "user",
    first_name: "Synthetic", last_name: fixture.manifest.scenarioName, phone_number: "", token_balance: 0 }).select("id").single();
  if (error) throw error;
  ownerId = Number(data.id);
}
const numericSuffix = Number(scenarioId.slice(0, 2));
const { data: organization, error: organizationError } = await admin.from("organizations").insert({ owner_id: ownerId,
  name: orgName, org_type: "llc", industry: fixture.manifest.industry, email: ownerEmail,
  ein_tin: `00-00000${String(numericSuffix).padStart(2, "0")}`, state: 1, street: `${numericSuffix} Synthetic Way`,
  city: "Testville", zip: `000${String(numericSuffix).padStart(2, "0")}`, phone: `55500000${String(numericSuffix).padStart(2, "0")}`,
  website: `https://${slug}.example.test`,
}).select("id").single();
if (organizationError) throw organizationError;
const organizationId = Number(organization.id);
const now = `${fixture.manifest.dateRange.end}T23:00:00.000Z`;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
let jobberRecordCount = 0;
if (fixture.manifest.connectedSources.includes("jobber")) {
  const { data: connection, error: connectionError } = await admin.from("jobber_connections").insert({ organization_id: organizationId,
    jobber_account_id: `e2e-${scenarioId}`, jobber_account_name: fixture.manifest.companyName, api_version: "2026-08-28",
    status: "active", verified_at: now, last_successful_sync_at: now }).select("id").single();
  if (connectionError) throw connectionError;
  const clientRows = fixture.jobber.clients.map(client => ({ organization_id: organizationId, connection_id: connection.id,
    object_type: "clients", external_id: client.id, title: client.name, payload: { name: client.name, emails: [{ address: client.email }] }, content_hash: hash(client), last_seen_at: now }));
  const jobRows = fixture.jobber.jobs.map(job => ({ organization_id: organizationId, connection_id: connection.id,
    object_type: "jobs", external_id: job.id, related_client_id: job.clientId, record_number: job.jobNumber, status: job.status,
    title: job.title, amount: job.total, ends_at: job.completedAt ? `${job.completedAt}T17:00:00.000Z` : null, source_updated_at: job.completedAt ? `${job.completedAt}T17:00:00.000Z` : now,
    payload: { total: job.total, client: { id: job.clientId }, lineItems: job.lineItems, estimatedCosts: job.estimatedCosts },
    content_hash: hash(job), last_seen_at: now }));
  const invoiceRows = (fixture.jobber.invoices ?? []).map(invoice => ({ organization_id: organizationId, connection_id: connection.id,
    object_type: "invoices", external_id: invoice.id, related_client_id: invoice.clientId, record_number: invoice.invoiceNumber,
    status: invoice.status, title: `Invoice ${invoice.invoiceNumber}`, amount: invoice.balance, starts_at: `${invoice.issuedDate}T12:00:00.000Z`,
    ends_at: `${invoice.dueDate}T12:00:00.000Z`, source_updated_at: `${invoice.issuedDate}T12:00:00.000Z`,
    payload: { jobId: invoice.jobId, clientId: invoice.clientId, client: { id: invoice.clientId }, dueDate: invoice.dueDate, issuedDate: invoice.issuedDate, amounts: { total: invoice.total, invoiceBalance: invoice.balance } },
    content_hash: hash(invoice), last_seen_at: now }));
  const { error: recordsError } = await admin.from("jobber_records").insert([...clientRows, ...jobRows, ...invoiceRows]);
  if (recordsError) throw recordsError;
  jobberRecordCount = clientRows.length + jobRows.length + invoiceRows.length;
}
if (fixture.manifest.connectedSources.includes("quickbooks") || fixture.manifest.sourceHealth?.quickbooks) {
  const quickBooksHealth = fixture.manifest.sourceHealth?.quickbooks;
  const { error: qbConnectionError } = await admin.from("quickbooks_connections").insert({ organization_id: organizationId,
    realm_id: `e2e-${scenarioId}`, company_name: fixture.manifest.companyName, country: "US", status: quickBooksHealth?.status ?? "active", verified_at: now,
    last_synced_at: quickBooksHealth?.stale ? "2026-07-01T12:00:00.000Z" : now, last_sync_status: quickBooksHealth?.status === "error" ? "failed" : "completed" });
  if (qbConnectionError) throw qbConnectionError;
  const qbEvidenceRows = [
    ...fixture.quickbooks.invoices.map(invoice => ({
      organization_id: organizationId, entity_type: "Invoice", external_id: invoice.id, display_name: invoice.invoiceNumber,
      transaction_date: invoice.issuedDate, total_amount: invoice.total, payload: invoice, source_updated_at: `${invoice.issuedDate}T12:00:00.000Z`, import_status: "staged" })),
    ...(fixture.quickbooks.payments ?? []).map(payment => ({ organization_id: organizationId, entity_type: "Payment", external_id: payment.id,
      display_name: `Payment ${payment.id}`, transaction_date: payment.date, total_amount: payment.amount, payload: payment,
      source_updated_at: `${payment.date}T12:00:00.000Z`, import_status: "staged" })),
    // The current staging schema supports Payment but not CreditMemo. Preserve the
    // explicit credit/refund semantics in payload instead of dropping the record.
    ...(fixture.quickbooks.credits ?? []).map(credit => ({ organization_id: organizationId, entity_type: "Payment", external_id: credit.id,
      display_name: `Credit ${credit.id}`, transaction_date: credit.date, total_amount: credit.amount, payload: credit,
      source_updated_at: `${credit.date}T12:00:00.000Z`, import_status: "staged" })),
    ...(fixture.quickbooks.liabilities ?? []).map(liability => ({ organization_id: organizationId, entity_type: "Bill", external_id: liability.id,
      display_name: `${liability.payee} ${liability.kind}`, transaction_date: liability.dueDate, total_amount: liability.amount, payload: liability,
      source_updated_at: `${liability.dueDate}T12:00:00.000Z`, import_status: "staged" })),
  ];
  if (qbEvidenceRows.length) {
    const { error: stagedError } = await admin.from("quickbooks_staged_entities").insert(qbEvidenceRows);
    if (stagedError) throw stagedError;
  }
}
if (fixture.manifest.connectedSources.includes("plaid")) {
  const plaidAccountId = (accountId: string) => `e2e-${scenarioId.toLowerCase()}-${accountId}`;
  const { data: item, error: itemError } = await admin.from("plaid_items").insert({ user_id: ownerId, org_id: organizationId,
    plaid_item_id: `e2e-${scenarioId}`, access_token: `synthetic-${scenarioId}`, institution_id: "e2e-bank",
    institution_name: fixture.plaid.institutionName, status: "active", last_synced_at: now, last_sync_status: "completed" }).select("id").single();
  if (itemError) throw itemError;
  const { error: accountError } = await admin.from("plaid_accounts").insert(fixture.plaid.accounts.map(account => ({ plaid_item_id: item.id,
    plaid_account_id: plaidAccountId(account.id), name: account.name, official_name: account.name, mask: "0008", type: account.type, subtype: account.subtype })));
  if (accountError) throw accountError;
  const balanceTimestamp = "2026-08-28T12:00:00.000Z";
  const { error: balanceError } = await admin.from("account_balance_snapshots").insert(fixture.plaid.accounts.map(account => ({ organization_id: organizationId,
    provider: "plaid", external_account_id: plaidAccountId(account.id), account_name: account.name, account_type: account.type, account_subtype: account.subtype,
    current_balance: account.currentBalance, available_balance: account.availableBalance, currency: "USD", balance_timestamp: balanceTimestamp, fetched_at: balanceTimestamp })));
  if (balanceError) throw balanceError;
  const allBankTransactions = [...fixture.plaid.transactions, ...(fixture.plaid.manualTransactions ?? [])];
  const { error: transactionError } = await admin.from("transactions").insert(allBankTransactions.map(transaction => ({ user_id: ownerId, org_id: organizationId,
    title: transaction.merchant, amount: transaction.amount, type: "Business", date_time: `${transaction.date}T12:00:00.000Z`, description: transaction.description,
    deductible: transaction.amount < 0, plaid_transaction_id: `e2e-${scenarioId.toLowerCase()}-${transaction.id}`, plaid_account_id: plaidAccountId(transaction.accountId),
    plaid_category: [transaction.kind ?? (transaction.amount > 0 ? "INCOME" : "GENERAL_MERCHANDISE"),
      ...(transaction.relatedTransactionId ? [`related:${transaction.relatedTransactionId}`] : []),
      ...("originalTransactionId" in transaction && transaction.originalTransactionId ? [`original:${transaction.originalTransactionId}`] : [])],
    pending: transaction.pending ?? false })));
  if (transactionError) throw transactionError;
}
if (fixture.manifest.connectedSources.includes("gmail")) {
  const { error: gmailConnectionError } = await admin.from("gmail_connections").insert({ organization_id: organizationId,
    connected_by_user_id: ownerId, google_account_email: ownerEmail, status: "active", last_scan_at: now, last_scan_status: "completed" });
  if (gmailConnectionError) throw gmailConnectionError;
  if (fixture.gmail.messages.length) {
    const { error: gmailError } = await admin.from("contractor_gmail_financial_messages").insert(fixture.gmail.messages.map(message => ({
      organization_id: organizationId, gmail_message_id: message.id, gmail_thread_id: message.threadId, sender: message.sender,
      subject: message.subject, message_date: message.timestamp, detected_document_type: message.subject.toLowerCase().includes("payment") ? "payment_notice" : message.subject.toLowerCase().includes("invoice") ? "vendor_invoice" : "unknown",
      extracted_reference_numbers: message.subject.match(/[A-Z]+-\d+/g) ?? [], linked_records: [], confidence: "medium", matched_signals: [],
      requires_content_fetch: false, status: "detected", classification_version: "e2e-synthetic-v1" })));
    if (gmailError) throw gmailError;
  }
}
console.log(`SEEDED ${scenarioId}`);
console.log(`Organization ID: ${organizationId}`);
console.log(`Jobber records: ${jobberRecordCount}`);
console.log("No existing development tenant was updated or deleted.");
