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
  source: "gmail" | "upload";
  removable: boolean;
  confirmed: boolean;
  linked_transaction: ContractorTransactionOption | null;
};

export type ContractorTransactionOption = {
  id: number;
  title: string | null;
  description: string | null;
  amount: number;
  date_time: string;
  plaid_transaction_id: string | null;
  quickbooks_external_id: string | null;
};

export type ContractorTransactionJobSuggestion = {
  transaction: {
    id: number; title: string | null; description: string | null;
    receipt_number: string | null; amount: number; date_time: string;
  };
  job: { external_id: string; record_number?: string | null; title?: string | null };
  sourceProvider: "booksmart" | "quickbooks" | "plaid";
  confidence: string; score: number; reasons: string[];
  requiresConfirmation: boolean; updatedAt: string;
};

export type ApprovedContractorJobCost = {
  assignmentId: number;
  transaction: {
    id: number; title: string | null; description: string | null;
    amount: number; date_time: string;
  };
  job: { external_id: string; record_number?: string | null; title?: string | null };
  sourceProvider: "booksmart" | "quickbooks" | "plaid";
  amount: number; confidence: string; confirmedAt: string; receiptLinked: boolean;
};

export type JobberExpensePreview = {
  enabled: boolean; alreadySent: boolean;
  prior: { status: "pending" | "succeeded" | "failed"; external_expense_id?: string | null; created_at: string } | null;
  expense: { title: string; description: string; date: string; total: number; linkedJobId: string };
  job: { external_id: string; record_number?: string | null; title?: string | null };
  warning: string;
};

export async function loadJobberExpensePreview(organizationId: number, assignmentId: number) {
  const response = await authenticatedApi(`/api/organizations/${organizationId}/contractor-job-costs/${assignmentId}/jobber-expense-preview`);
  if (!response.ok) throw new Error(await apiErrorMessage(response, "The Jobber expense preview is unavailable."));
  return response.json() as Promise<JobberExpensePreview>;
}

export async function sendJobCostToJobber(organizationId: number, assignmentId: number) {
  const response = await authenticatedApi(`/api/organizations/${organizationId}/contractor-job-costs/${assignmentId}/send-to-jobber`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true }) });
  if (!response.ok) throw new Error(await apiErrorMessage(response, "The expense could not be sent to Jobber."));
  return response.json() as Promise<{ sent: true; expense: { id: string; title?: string; total?: number }; accountingEffect: "none" }>;
}

export async function loadContractorTransactionJobQueue(organizationId: number) {
  const response = await authenticatedApi(`/api/organizations/${organizationId}/contractor-job-costs/review-queue`);
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Transaction job suggestions are unavailable."));
  return response.json() as Promise<{ suggestions: ContractorTransactionJobSuggestion[]; approved: ApprovedContractorJobCost[] }>;
}

export async function confirmContractorTransactionJob(organizationId: number, suggestion: ContractorTransactionJobSuggestion) {
  const response = await authenticatedApi(`/api/organizations/${organizationId}/contractor-job-costs/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactionId: suggestion.transaction.id, jobberJobId: suggestion.job.external_id }),
  });
  if (!response.ok) throw new Error(await apiErrorMessage(response, "The job cost could not be confirmed."));
  return response.json();
}

export async function rejectContractorTransactionJob(organizationId: number, transactionId: number) {
  const response = await authenticatedApi(`/api/organizations/${organizationId}/contractor-job-costs/reject`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId }),
  });
  if (!response.ok) throw new Error(await apiErrorMessage(response, "The suggestion could not be dismissed."));
  return response.json();
}

export async function removeContractorTransactionJobCost(organizationId: number, assignmentId: number) {
  const response = await authenticatedApi(`/api/organizations/${organizationId}/contractor-job-costs/remove`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignmentId }),
  });
  if (!response.ok) throw new Error(await apiErrorMessage(response, "The job assignment could not be removed."));
  return response.json() as Promise<{ removed: true; accountingEffect: "none"; receiptEffect: "none" }>;
}

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

export async function loadContractorReceiptTransactionOptions(organizationId: number) {
  const response = await authenticatedApi(`/api/organizations/${organizationId}/contractor-receipts/transaction-options`);
  if (!response.ok) throw new Error(await apiErrorMessage(response, "Approved transactions are unavailable."));
  return response.json() as Promise<{ transactions: ContractorTransactionOption[] }>;
}

export async function linkContractorReceiptTransaction(organizationId: number, sourceId: string, transactionId: number) {
  const response = await authenticatedApi(`/api/organizations/${organizationId}/contractor-receipts/link-transaction`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId, transactionId }),
  });
  if (!response.ok) throw new Error(await apiErrorMessage(response, "The receipt could not be linked."));
  return response.json() as Promise<{ linked: true; accountingEffect: "none"; transactionId: number }>;
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
