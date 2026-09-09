export type GmailObligationMessage = { id: string; sender: string | null; subject: string | null; messageDate: string | null; documentType: string; confidence: "high" | "medium" | "low"; status?: string | null };
export type UpcomingObligation = { id: string; kind: "payroll" | "vendor_bill"; label: string; amount: number; dueDate: string; confidence: "high" | "medium" };

const months: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const amountFrom = (text: string) => { const match = text.match(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/); const amount = match ? Number(match[1].replaceAll(",", "")) : NaN; return Number.isFinite(amount) && amount > 0 ? amount : null; };
function dateFrom(text: string, messageDate: string | null) {
  const iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/); if (iso && !Number.isNaN(Date.parse(`${iso[0]}T12:00:00Z`))) return iso[0];
  const named = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,?\s+(20\d{2}))?/i); if (!named) return null;
  const year = Number(named[3] ?? (messageDate ? new Date(messageDate).getUTCFullYear() : NaN)); const month = months[named[1].toLowerCase()]; const day = Number(named[2]);
  const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}
export function extractUpcomingObligations(messages: GmailObligationMessage[], now: Date): UpcomingObligation[] {
  const today = now.toISOString().slice(0, 10); const horizon = new Date(now); horizon.setUTCDate(horizon.getUTCDate() + 45); const lastDate = horizon.toISOString().slice(0, 10);
  const seen = new Set<string>(); const results: UpcomingObligation[] = [];
  for (const message of messages) {
    const text = message.subject?.trim() ?? "";
    if (message.status === "dismissed" || message.confidence === "low" || /\b(paid|processed|received|receipt|confirmation)\b/i.test(text)) continue;
    const payroll = message.documentType === "payroll_notice" || /\bpayroll\b/i.test(text); const vendor = message.documentType === "vendor_invoice" || /\b(?:vendor|supplier|invoice|balance)\b/i.test(text);
    if (!payroll && !vendor) continue;
    const amount = amountFrom(text); const dueDate = dateFrom(text, message.messageDate); if (amount == null || dueDate == null || dueDate < today || dueDate > lastDate) continue;
    const kind = payroll ? "payroll" as const : "vendor_bill" as const; const fingerprint = `${kind}|${amount.toFixed(2)}|${dueDate}|${(message.sender ?? "").toLowerCase()}`; if (seen.has(fingerprint)) continue; seen.add(fingerprint);
    results.push({ id: `gmail:${message.id}`, kind, label: payroll ? "Payroll debit" : "Vendor bill", amount, dueDate, confidence: message.confidence === "high" ? "high" : "medium" });
  }
  return results.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
}
