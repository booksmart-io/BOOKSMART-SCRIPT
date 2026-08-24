export const CONTRACTOR_GMAIL_CLASSIFICATION_VERSION = "contractor-gmail-v1";

export const CONTRACTOR_GMAIL_TARGETED_QUERIES = [
  "newer_than:90d has:attachment (invoice OR receipt OR statement OR \"purchase order\")",
  "newer_than:90d (payment OR paid OR payroll OR insurance OR tax OR \"change order\")",
  "newer_than:90d (from:homedepot.com OR from:lowes.com OR Jobber OR QuickBooks)",
] as const;

export type GmailFinancialDocumentType =
  | "receipt" | "vendor_invoice" | "customer_invoice" | "payment_notice"
  | "purchase_order" | "change_order" | "insurance_notice" | "loan_notice"
  | "tax_notice" | "payroll_notice" | "statement" | "unknown";

export type GmailMessageMetadata = {
  messageId: string;
  threadId?: string | null;
  sender?: string | null;
  subject?: string | null;
  messageDate?: string | null;
  snippet?: string | null;
  attachmentNames?: string[];
};

export type GmailFinancialClassification = {
  relevant: boolean;
  documentType: GmailFinancialDocumentType;
  confidence: "high" | "medium" | "low";
  matchedSignals: string[];
  extractedReferenceNumbers: string[];
  requiresContentFetch: boolean;
  accountingEffect: "none";
  classificationVersion: string;
};

const rules: Array<{ type: GmailFinancialDocumentType; patterns: RegExp[] }> = [
  { type: "tax_notice", patterns: [/\btax\b/i, /\birs\b/i, /revenue service/i] },
  { type: "receipt", patterns: [/\breceipt\b/i, /home depot/i, /lowe'?s/i] },
  { type: "purchase_order", patterns: [/purchase order/i, /\bpo(?:\s*(?:#|no\.?))?\s*[-:]?\s*[a-z0-9-]+/i] },
  { type: "change_order", patterns: [/change order/i] },
  { type: "payment_notice", patterns: [/payment (?:received|confirmation|processed)/i, /\bpaid\b/i, /deposit notice/i] },
  { type: "payroll_notice", patterns: [/\bpayroll\b/i, /pay stub/i] },
  { type: "insurance_notice", patterns: [/\binsurance\b/i, /policy renewal/i] },
  { type: "loan_notice", patterns: [/\bloan\b/i, /payment due/i] },
  { type: "statement", patterns: [/\bstatement\b/i] },
  { type: "vendor_invoice", patterns: [/\binvoice\b/i, /amount due/i] },
];

const referencePattern = /\b(?:invoice|inv|po|job|order|estimate|quote)\s*(?:#|no\.?|number)?\s*[-:]?\s*([a-z0-9][a-z0-9-]{2,})\b/gi;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeGmailMessageMetadata(input: GmailMessageMetadata): GmailMessageMetadata {
  const messageId = clean(input.messageId, 300);
  if (!messageId) throw new Error("Gmail message ID is required.");
  const date = clean(input.messageDate, 100);
  if (date && Number.isNaN(Date.parse(date))) throw new Error("Gmail message date is invalid.");
  return {
    messageId,
    threadId: clean(input.threadId, 300) || null,
    sender: clean(input.sender, 500) || null,
    subject: clean(input.subject, 1000) || null,
    messageDate: date ? new Date(date).toISOString() : null,
    snippet: clean(input.snippet, 2000) || null,
    attachmentNames: [...new Set((input.attachmentNames ?? []).map(name => clean(name, 300)).filter(Boolean))].slice(0, 25),
  };
}

export function classifyGmailFinancialMetadata(input: GmailMessageMetadata): GmailFinancialClassification {
  const metadata = normalizeGmailMessageMetadata(input);
  const text = [metadata.sender, metadata.subject, metadata.snippet, ...(metadata.attachmentNames ?? [])].filter(Boolean).join(" \n ");
  let best: { type: GmailFinancialDocumentType; signals: string[] } | null = null;
  for (const rule of rules) {
    const signals = rule.patterns.filter(pattern => pattern.test(text)).map(pattern => pattern.source);
    if (signals.length && (!best || signals.length > best.signals.length)) best = { type: rule.type, signals };
  }
  const references = [...text.matchAll(referencePattern)].map(match => match[1].toUpperCase()).filter((value, index, all) => all.indexOf(value) === index).slice(0, 25);
  const hasAttachment = Boolean(metadata.attachmentNames?.length);
  const relevant = Boolean(best);
  const confidence = relevant && (hasAttachment || (best?.signals.length ?? 0) > 1) ? "high" : relevant ? "medium" : "low";
  return {
    relevant,
    documentType: best?.type ?? "unknown",
    confidence,
    matchedSignals: best?.signals ?? [],
    extractedReferenceNumbers: references,
    requiresContentFetch: relevant && (hasAttachment || references.length === 0),
    accountingEffect: "none",
    classificationVersion: CONTRACTOR_GMAIL_CLASSIFICATION_VERSION,
  };
}
