import { createClient } from "@supabase/supabase-js";
import { scenarioById } from "../../../../e2e/all-scenarios";
import { matchReceiptToTransaction } from "../lib/contractor-receipt-transaction-matcher";
import { matchContractorFinancialRecord, type ContractorJobCandidate } from "../lib/contractor-job-matcher";

const scenarioId = process.env.E2E_SCENARIO_ID?.trim() ?? "";
const entry = scenarioById(scenarioId);
if (!entry) throw new Error(`Unknown E2E_SCENARIO_ID: ${scenarioId}`);
if (process.env.E2E_TARGET !== "test") throw new Error("Refusing receipt matching unless E2E_TARGET=test");
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; };
const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const slug = scenarioId.toLowerCase().replaceAll("_", "-");
const { data: organization, error: orgError } = await admin.from("organizations").select("id,owner_id").eq("name", `E2E_SYNTHETIC_${scenarioId}`).single();
if (orgError) throw orgError;
const { data: owner, error: ownerError } = await admin.from("users").select("email").eq("id", organization.owner_id).single();
if (ownerError) throw ownerError;
if (owner.email !== `${slug}@booksmart-e2e.example.test`) throw new Error("Refusing receipt matching: exact synthetic owner relationship failed");
const receipts = entry.fixture.receipts ?? [];
const { data: transactions, error: txError } = await admin.from("transactions").select("id,amount,date_time,title,description,plaid_transaction_id,quickbooks_external_id")
  .eq("org_id", organization.id).eq("pending", false);
if (txError) throw txError;
const { data: jobRows, error: jobsError } = await admin.from("jobber_records").select("external_id,record_number,title,amount,payload")
  .eq("organization_id", organization.id).eq("object_type", "jobs");
if (jobsError) throw jobsError;
const jobs: ContractorJobCandidate[] = (jobRows ?? []).map(row => ({ id: String(row.external_id), jobNumber: row.record_number, title: row.title,
  customerName: (row.payload as any)?.client?.name ?? null, amount: Number(row.amount ?? 0) }));
let confirmed = 0;
for (const receipt of receipts) {
  const { error: receiptError } = await admin.from("contractor_receipt_extractions").upsert({ organization_id: organization.id, document_id: null,
    source_id: receipt.id, vendor: receipt.vendor, receipt_date: receipt.date, subtotal: receipt.subtotal, tax: receipt.tax, total: receipt.total,
    payment_method: "card", payment_last_four: receipt.paymentLastFour, po_number: receipt.poNumber ?? null, job_number: receipt.jobNumber ?? null,
    customer_or_project: receipt.customerOrProject ?? null, receipt_number: receipt.receiptNumber,
    line_items: receipt.lineItems, warnings: [], schema_version: "contractor-receipt-v1" }, { onConflict: "organization_id,source_id" });
  if (receiptError) throw receiptError;
  const txMatch = matchReceiptToTransaction({ total: receipt.total, date: receipt.date, vendor: receipt.vendor }, (transactions ?? []).map(row => ({
    id: String(row.id), amount: Number(row.amount), date: row.date_time, title: row.title, description: row.description,
    plaidTransactionId: row.plaid_transaction_id, quickBooksExternalId: row.quickbooks_external_id })));
  const jobMatch = matchContractorFinancialRecord({ source: "receipt", sourceId: receipt.id, poNumber: receipt.poNumber ?? receipt.jobNumber,
    customerName: receipt.customerOrProject, memo: `${receipt.vendor} ${receipt.poNumber ?? ""}`, amount: receipt.total }, jobs);
  if (!txMatch.transactionId || txMatch.confidence !== "high" || !txMatch.transactionSource || !jobMatch.matchedJobId || !["high", "confirmed"].includes(jobMatch.confidence))
    throw new Error(`Receipt ${receipt.id} did not produce deterministic transaction and job matches`);
  const { error: linkError } = await admin.from("contractor_source_links").upsert({ organization_id: organization.id,
    left_provider: "receipt", left_record_type: "contractor_receipt_extraction", left_record_id: receipt.id,
    right_provider: txMatch.transactionSource, right_record_type: "transaction", right_record_id: txMatch.transactionId,
    confidence: txMatch.confidence, score: txMatch.score, match_reasons: txMatch.matchReasons, requires_confirmation: false,
    status: "confirmed", calculation_version: txMatch.calculationVersion, confirmed_by: organization.owner_id, confirmed_at: new Date().toISOString() },
    { onConflict: "organization_id,left_provider,left_record_type,left_record_id,right_provider,right_record_type,right_record_id" });
  if (linkError) throw linkError;
  const transaction = (transactions ?? []).find(row => String(row.id) === txMatch.transactionId)!;
  const { error: assignmentError } = await admin.from("contractor_job_cost_assignments").upsert({ organization_id: organization.id,
    jobber_job_id: jobMatch.matchedJobId, source_provider: txMatch.transactionSource, source_record_type: "transaction", source_record_id: txMatch.transactionId,
    amount: Math.abs(Number(transaction.amount)), cost_category: "materials", confidence: "confirmed" },
    { onConflict: "organization_id,source_provider,source_record_type,source_record_id" });
  if (assignmentError) throw assignmentError;
  confirmed++;
}
console.log(`Receipts matched to transactions and jobs: ${confirmed}`);
