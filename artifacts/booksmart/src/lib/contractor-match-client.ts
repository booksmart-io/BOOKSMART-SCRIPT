import { apiErrorMessage, authenticatedApi } from "@/lib/authenticated-api";

export type ContractorMatchSuggestion = {
  sourceId: string;
  confidence: string;
  score: number;
  reasons: string[];
  requiresConfirmation: boolean;
  updatedAt: string;
  receipt: {
    vendor: string | null;
    receipt_date: string | null;
    total: number | null;
    po_number: string | null;
    job_number: string | null;
    customer_or_project: string | null;
    receipt_number: string | null;
    warnings: string[];
  } | null;
  job: {
    external_id: string;
    record_number?: string | null;
    title?: string | null;
    status?: string | null;
  } | null;
  transaction: {
    id: number;
    title: string | null;
    description: string | null;
    amount: number;
    date_time: string;
  } | null;
  transactionMatch: {
    confidence: string;
    score: number;
    reasons: string[];
  } | null;
};

export type ContractorReceipt = {
  source_id: string;
  vendor: string | null;
  receipt_date: string | null;
  total: number | null;
  po_number: string | null;
  job_number: string | null;
  customer_or_project: string | null;
  receipt_number: string | null;
  warnings: string[];
  created_at: string;
  updated_at: string;
  status: "unmatched" | "awaiting_review" | "processed";
  removable: boolean;
  confirmed: boolean;
};

export async function loadContractorMatchQueue(organizationId: number) {
  const response = await authenticatedApi(
    `/api/organizations/${organizationId}/contractor-receipts/review-queue`,
  );
  if (!response.ok)
    throw new Error(
      await apiErrorMessage(response, "Suggested matches are unavailable."),
    );
  return response.json() as Promise<{
    suggestions: ContractorMatchSuggestion[];
    receipts: ContractorReceipt[];
  }>;
}

export async function extractContractorReceipt(
  organizationId: number,
  file: File,
) {
  if (!(file.type === "application/pdf" || file.type.startsWith("image/")))
    throw new Error("Choose a PDF or image receipt.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Receipt files must be 10 MB or smaller.");
  const fileData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("The receipt could not be read."));
    reader.onerror = () => reject(new Error("The receipt could not be read."));
    reader.readAsDataURL(file);
  });
  const response = await authenticatedApi(
    `/api/organizations/${organizationId}/contractor-receipts/extract`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId: `upload:${crypto.randomUUID()}`,
        filename: file.name,
        mimeType: file.type,
        fileData,
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      await apiErrorMessage(response, "The receipt could not be processed."),
    );
  return response.json() as Promise<{
    receipt: {
      vendor: string | null;
      date: string | null;
      total: number | null;
    };
    accountingEffect: "none";
  }>;
}

export async function confirmContractorMatch(
  organizationId: number,
  suggestion: ContractorMatchSuggestion,
) {
  if (!suggestion.transaction || !suggestion.job)
    throw new Error(
      "This suggestion needs both a bank transaction and a Jobber job before it can be confirmed.",
    );
  const response = await authenticatedApi(
    `/api/organizations/${organizationId}/contractor-receipts/confirm-job-cost`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId: suggestion.sourceId,
        transactionId: suggestion.transaction.id,
        jobberJobId: suggestion.job.external_id,
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      await apiErrorMessage(response, "The job cost could not be confirmed."),
    );
  return response.json();
}

export async function rejectContractorMatch(
  organizationId: number,
  sourceId: string,
) {
  const response = await authenticatedApi(
    `/api/organizations/${organizationId}/contractor-receipts/reject-match`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId }),
    },
  );
  if (!response.ok)
    throw new Error(
      await apiErrorMessage(response, "The suggestion could not be rejected."),
    );
  return response.json();
}

export async function removeContractorReceipt(
  organizationId: number,
  sourceId: string,
) {
  const response = await authenticatedApi(
    `/api/organizations/${organizationId}/contractor-receipts/${encodeURIComponent(sourceId)}`,
    { method: "DELETE" },
  );
  if (!response.ok)
    throw new Error(
      await apiErrorMessage(response, "The receipt could not be removed."),
    );
  return response.json() as Promise<{
    removed: true;
    accountingEffect: "none";
    jobCostEffect: "preserved";
  }>;
}
