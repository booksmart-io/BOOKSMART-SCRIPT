import type { ContractorFinancialRecord } from "./contractor-job-matcher";

export const CONTRACTOR_RECEIPT_SCHEMA_VERSION = "contractor-receipt-v1" as const;

export type ContractorReceiptExtraction = {
  vendor: string | null; date: string | null; subtotal: number | null; tax: number | null; total: number | null;
  paymentMethod: string | null; paymentLastFour: string | null; poNumber: string | null; jobNumber: string | null;
  customerOrProject: string | null; receiptNumber: string | null;
  lineItems: Array<{ sku: string | null; description: string; quantity: number | null; amount: number | null }>;
  warnings: string[];
};

export const contractorReceiptJsonSchema = {
  name: "contractor_receipt",
  strict: true,
  schema: {
    type: "object", additionalProperties: false,
    required: ["vendor","date","subtotal","tax","total","paymentMethod","paymentLastFour","poNumber","jobNumber","customerOrProject","receiptNumber","lineItems","warnings"],
    properties: {
      vendor: { type: ["string","null"] }, date: { type: ["string","null"] }, subtotal: { type: ["number","null"] },
      tax: { type: ["number","null"] }, total: { type: ["number","null"] }, paymentMethod: { type: ["string","null"] },
      paymentLastFour: { type: ["string","null"] }, poNumber: { type: ["string","null"] }, jobNumber: { type: ["string","null"] },
      customerOrProject: { type: ["string","null"] }, receiptNumber: { type: ["string","null"] },
      lineItems: { type: "array", items: { type: "object", additionalProperties: false, required: ["sku","description","quantity","amount"],
        properties: { sku: { type: ["string","null"] }, description: { type: "string" }, quantity: { type: ["number","null"] }, amount: { type: ["number","null"] } } } },
      warnings: { type: "array", items: { type: "string" } },
    },
  },
} as const;

export const CONTRACTOR_RECEIPT_PROMPT = `Extract only information explicitly printed on this contractor receipt or supplier invoice.
Return null for missing or ambiguous fields. Never invent a PO, job, customer, payment method, line item, date, or amount.
Dates must be YYYY-MM-DD. Amounts must be non-negative numbers. paymentLastFour must contain exactly four digits when printed.
PO number and job number are separate when the document distinguishes them. Preserve printed reference values.
Prioritize Home Depot, Lowe's, supply-house, materials, equipment-rental, and subcontractor document details.
Do not decide accounting category, deductibility, tax treatment, or final job assignment. Add a warning when totals conflict or the document is not a receipt or supplier invoice.`;

const nullableText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
const nullableMoney = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function normalizeContractorReceipt(value: any): ContractorReceiptExtraction {
  return {
    vendor: nullableText(value?.vendor), date: /^\d{4}-\d{2}-\d{2}$/.test(value?.date ?? "") ? value.date : null,
    subtotal: nullableMoney(value?.subtotal), tax: nullableMoney(value?.tax), total: nullableMoney(value?.total),
    paymentMethod: nullableText(value?.paymentMethod), paymentLastFour: /^\d{4}$/.test(value?.paymentLastFour ?? "") ? value.paymentLastFour : null,
    poNumber: nullableText(value?.poNumber), jobNumber: nullableText(value?.jobNumber), customerOrProject: nullableText(value?.customerOrProject),
    receiptNumber: nullableText(value?.receiptNumber), lineItems: Array.isArray(value?.lineItems) ? value.lineItems.slice(0, 250).map((row: any) => ({
      sku: nullableText(row?.sku), description: nullableText(row?.description) ?? "Unlabeled item", quantity: nullableMoney(row?.quantity), amount: nullableMoney(row?.amount),
    })) : [], warnings: Array.isArray(value?.warnings) ? value.warnings.map(nullableText).filter(Boolean).slice(0, 20) as string[] : [],
  };
}

export function receiptToFinancialRecord(sourceId: string, receipt: ContractorReceiptExtraction): ContractorFinancialRecord {
  return { source: "receipt", sourceId, explicitJobId: null, poNumber: receipt.poNumber ?? receipt.jobNumber,
    customerName: receipt.customerOrProject, memo: [receipt.vendor, receipt.poNumber, receipt.jobNumber, receipt.customerOrProject].filter(Boolean).join(" "), amount: receipt.total };
}
