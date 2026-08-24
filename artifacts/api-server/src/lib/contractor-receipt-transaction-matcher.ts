export const RECEIPT_TRANSACTION_MATCH_VERSION = "receipt-transaction-match-v1" as const;

export type ReceiptTransactionCandidate = {
  id: string; amount: number; date: string; title?: string | null; description?: string | null;
  plaidTransactionId?: string | null; quickBooksExternalId?: string | null;
};

export type ReceiptTransactionMatch = {
  transactionId: string | null; confidence: "high" | "medium" | "low" | "unmatched";
  score: number; matchReasons: string[]; requiresConfirmation: boolean;
  transactionSource: "quickbooks" | "plaid" | "booksmart" | null;
  calculationVersion: typeof RECEIPT_TRANSACTION_MATCH_VERSION;
};

const words = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(word => word.length >= 3);
const dayDifference = (left: string, right: string) => Math.abs(new Date(left).getTime() - new Date(right).getTime()) / 86_400_000;

export function matchReceiptToTransaction(receipt: { total: number | null; date: string | null; vendor: string | null }, candidates: ReceiptTransactionCandidate[]): ReceiptTransactionMatch {
  if (receipt.total == null || !receipt.date) return { transactionId: null, confidence: "unmatched", score: 0, matchReasons: [], requiresConfirmation: false, transactionSource: null, calculationVersion: RECEIPT_TRANSACTION_MATCH_VERSION };
  const ranked = candidates.map(candidate => {
    let score = 0; const matchReasons: string[] = [];
    const candidateAmount = Math.abs(Number(candidate.amount));
    if (Math.abs(candidateAmount - receipt.total!) <= 0.01) { score += 55; matchReasons.push("exact_amount"); }
    const days = dayDifference(receipt.date!, candidate.date);
    if (days <= 1) { score += 30; matchReasons.push("date_within_one_day"); }
    else if (days <= 3) { score += 20; matchReasons.push("date_within_three_days"); }
    else if (days <= 7) { score += 10; matchReasons.push("date_within_seven_days"); }
    const vendorWords = words(receipt.vendor);
    const candidateWords = new Set(words(`${candidate.title ?? ""} ${candidate.description ?? ""}`));
    if (vendorWords.length && vendorWords.some(word => candidateWords.has(word))) { score += 25; matchReasons.push("vendor_name"); }
    return { candidate, score, matchReasons };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0]; const second = ranked[1];
  if (!best || best.score < 55 || (second && second.score === best.score)) return { transactionId: null, confidence: "unmatched", score: best?.score ?? 0,
    matchReasons: second?.score === best?.score ? ["ambiguous_best_match"] : [], requiresConfirmation: false, transactionSource: null, calculationVersion: RECEIPT_TRANSACTION_MATCH_VERSION };
  const confidence = best.score >= 100 ? "high" : best.score >= 75 ? "medium" : "low";
  const transactionSource = best.candidate.quickBooksExternalId ? "quickbooks" : best.candidate.plaidTransactionId ? "plaid" : "booksmart";
  return { transactionId: best.candidate.id, confidence, score: best.score, matchReasons: best.matchReasons,
    requiresConfirmation: confidence !== "high", transactionSource, calculationVersion: RECEIPT_TRANSACTION_MATCH_VERSION };
}
