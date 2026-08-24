export const CONTRACTOR_JOB_MATCH_VERSION = "contractor-job-match-v1" as const;

export type JobMatchConfidence = "confirmed" | "high" | "medium" | "low" | "unmatched";

export type ContractorJobCandidate = {
  id: string;
  jobNumber?: string | null;
  title?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  amount?: number | null;
};

export type ContractorFinancialRecord = {
  source: "booksmart" | "quickbooks" | "plaid" | "receipt" | "gmail";
  sourceId: string;
  explicitJobId?: string | null;
  poNumber?: string | null;
  invoiceNumber?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  memo?: string | null;
  amount?: number | null;
};

export type ContractorJobMatch = {
  matchedJobId: string | null;
  confidence: JobMatchConfidence;
  score: number;
  matchReasons: string[];
  sourceIds: string[];
  requiresConfirmation: boolean;
  calculationVersion: typeof CONTRACTOR_JOB_MATCH_VERSION;
};

const normalized = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const reference = (value: unknown) => normalized(value).replace(/^(?:po|job)/, "");
const text = (value: unknown) => String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const same = (left: unknown, right: unknown) => !!normalized(left) && normalized(left) === normalized(right);
const contains = (haystack: unknown, needle: unknown) => {
  const left = text(haystack);
  const right = text(needle);
  return right.length >= 4 && left.includes(right);
};

function scoreCandidate(record: ContractorFinancialRecord, job: ContractorJobCandidate) {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => { score += points; reasons.push(reason); };

  if (same(record.explicitJobId, job.id)) add(100, "exact_jobber_job_id");
  if (!!reference(record.poNumber) && reference(record.poNumber) === reference(job.jobNumber)) add(85, "exact_po_to_job_number");
  if (same(record.invoiceNumber, job.jobNumber)) add(70, "invoice_reference_to_job_number");
  if (same(record.customerEmail, job.customerEmail)) add(45, "customer_email");
  if (same(record.customerPhone, job.customerPhone)) add(40, "customer_phone");
  if (same(record.customerName, job.customerName)) add(30, "customer_name");
  if (same(record.address, job.address)) add(40, "job_address");
  if (contains(record.memo, job.jobNumber)) add(55, "memo_contains_job_number");
  if (contains(record.memo, job.title)) add(25, "memo_contains_job_name");
  if (record.amount != null && job.amount != null && Math.abs(record.amount - job.amount) <= 0.01) add(15, "amount_equal");
  return { job, score, reasons };
}

export function matchContractorFinancialRecord(
  record: ContractorFinancialRecord,
  jobs: ContractorJobCandidate[],
): ContractorJobMatch {
  const ranked = jobs.map(job => scoreCandidate(record, job)).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  const ambiguous = !!best && !!second && best.score === second.score;
  if (!best || best.score < 15 || ambiguous) {
    return { matchedJobId: null, confidence: "unmatched", score: best?.score ?? 0,
      matchReasons: ambiguous ? ["ambiguous_best_match"] : [], sourceIds: [record.sourceId],
      requiresConfirmation: false, calculationVersion: CONTRACTOR_JOB_MATCH_VERSION };
  }

  const deterministic = best.reasons.includes("exact_jobber_job_id");
  const confidence: JobMatchConfidence = deterministic ? "confirmed"
    : best.score >= 80 ? "high" : best.score >= 45 ? "medium" : "low";
  return { matchedJobId: best.job.id, confidence, score: best.score, matchReasons: best.reasons,
    sourceIds: [record.sourceId, best.job.id], requiresConfirmation: confidence === "medium" || confidence === "low",
    calculationVersion: CONTRACTOR_JOB_MATCH_VERSION };
}
