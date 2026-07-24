import { supabase } from "@/lib/supabase";

export type StatementType = "pnl" | "bs" | "cf";
export type StatementValue = number | null;
export type StatementDraft = {
  metadata: {
    statement_type: StatementType;
    entity_name: string | null;
    period_start: string | null;
    period_end: string | null;
    as_of_date: string | null;
    currency: string;
    scale: "ones" | "thousands" | "millions";
    comparative_periods: unknown[];
  };
  values: Record<string, StatementValue>;
  evidence: Array<{ field: string; page: number | null; location: string | null; excerpt: string | null }>;
  warnings: string[];
  confidence: number | null;
};

export type ValidationFinding = {
  code: string;
  severity: "error" | "warning";
  message: string;
  expected: number | null;
  actual: number | null;
  difference: number | null;
  tolerance: number;
};

export type ExtractionResult = {
  extracted: StatementDraft;
  docType: StatementType;
  validation: ValidationFinding[];
  warnings: string[];
  rawResponse: unknown;
  fileHash: string;
  detectedFormat: string;
  pageCount: number | null;
  model: string;
  modelVersion: string | null;
  promptVersion: string;
  schemaVersion: string;
};

async function token() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Not authenticated.");
  return data.session.access_token;
}

export async function extractFinancialStatement(file: File, docType: StatementType): Promise<ExtractionResult> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",").pop() ?? "");
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
  const response = await fetch("/api/extract-document", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ fileData: base64, mimeType: file.type || "application/octet-stream", filename: file.name, docType }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Extraction failed.");
  return payload as ExtractionResult;
}

export async function createStatementReview(args: {
  organizationId: number;
  documentId: number;
  idempotencyKey: string;
  extraction: ExtractionResult;
}) {
  const response = await fetch("/api/financial-statements", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({
      organization_id: args.organizationId,
      document_id: args.documentId,
      idempotency_key: args.idempotencyKey,
      file_hash: args.extraction.fileHash,
      extraction: args.extraction.extracted,
      raw_response: args.extraction.rawResponse,
      model: args.extraction.model,
      model_version: args.extraction.modelVersion,
      prompt_version: args.extraction.promptVersion,
      schema_version: args.extraction.schemaVersion,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Could not create review.");
  return payload.statement as { id: number; normalized_draft: StatementDraft; validation_results: ValidationFinding[]; extraction_warnings: string[] };
}

export async function saveStatementReview(args: {
  id: number;
  organizationId: number;
  statement: StatementDraft;
  action: "save_draft" | "confirm" | "abandon";
  acknowledgeWarnings?: boolean;
  reportingDecision?: "keep_booksmart" | "use_uploaded" | "investigate" | "review_later" | "propose_adjustments";
}) {
  const response = await fetch(`/api/financial-statements/${args.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({
      organization_id: args.organizationId,
      action: args.action,
      statement: args.statement,
      acknowledge_warnings: args.acknowledgeWarnings,
      reporting_decision: args.reportingDecision,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message ?? payload.error ?? "Could not save review.") as Error & { validation?: ValidationFinding[] };
    error.validation = payload.validation;
    throw error;
  }
  return payload;
}
