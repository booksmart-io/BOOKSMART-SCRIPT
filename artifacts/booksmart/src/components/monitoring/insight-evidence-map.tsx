import { ArrowDown, Calculator, CircleAlert, FileQuestion, Landmark, Link2, Mail, ReceiptText, Wrench } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type InsightEvidenceReference = {
  provider: "booksmart" | "quickbooks" | "jobber" | "gmail" | "plaid" | "receipt" | "payroll" | "contract";
  recordType: string;
  recordId: string;
  label: string;
  state?: "confirmed" | "estimated" | "missing" | "stale" | "conflicting";
  route?: string | null;
  reason?: string;
};

export type InsightCalculation = {
  summary: string;
  operands: Array<{ label: string; value: number; format: "currency" | "number" | "percent"; operation?: "add" | "subtract" | "compare" }>;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const providerLabel = (provider: InsightEvidenceReference["provider"]) => ({
  booksmart: "BookSmart", quickbooks: "QuickBooks", jobber: "Jobber", gmail: "Gmail", plaid: "Bank",
  receipt: "Receipt", payroll: "Payroll", contract: "Contract",
})[provider];

const providerIcon = (provider: InsightEvidenceReference["provider"]) => {
  if (provider === "gmail") return Mail;
  if (provider === "plaid") return Landmark;
  if (provider === "jobber") return Wrench;
  if (provider === "receipt") return ReceiptText;
  if (provider === "quickbooks") return Calculator;
  return Link2;
};

const stateTone = (state: InsightEvidenceReference["state"]) => state === "conflicting"
  ? "border-rose-400/50 text-rose-700 dark:text-rose-300"
  : state === "missing" || state === "stale"
    ? "border-amber-400/50 text-amber-700 dark:text-amber-300"
    : state === "estimated"
      ? "border-blue-400/50 text-blue-700 dark:text-blue-300"
      : "border-emerald-400/50 text-emerald-700 dark:text-emerald-300";

const value = (operand: InsightCalculation["operands"][number]) => operand.format === "currency"
  ? money.format(operand.value)
  : operand.format === "percent" ? `${number.format(operand.value)}%` : number.format(operand.value);

export function InsightEvidenceMap({ evidence, calculation, confidence, exclusions, recommendation }: {
  evidence: InsightEvidenceReference[];
  calculation: InsightCalculation | null;
  confidence: number | null;
  exclusions: string[];
  recommendation: string | null;
}) {
  if (!evidence.length && !calculation) return <p className="mt-2 text-xs text-muted-foreground">Structured source connections are not available for this insight yet.</p>;
  return <section className="mt-3 space-y-3" aria-label="Evidence connections" data-testid="evidence-map">
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {evidence.map((item, index) => {
        const Icon = item.state === "missing" ? FileQuestion : item.state === "conflicting" ? CircleAlert : providerIcon(item.provider);
        return <div key={`${item.provider}:${item.recordType}:${item.recordId}:${index}`} className="rounded-lg border border-border/70 bg-background/30 p-3" data-testid="evidence-node" data-source={item.provider} data-record-type={item.recordType} data-record-id={item.recordId} data-state={item.state ?? "confirmed"}>
          <div className="flex items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><p className="font-medium text-foreground">{item.label}</p><Badge variant="outline" className={`h-5 capitalize ${stateTone(item.state)}`}>{item.state ?? "confirmed"}</Badge></div><p className="mt-1 text-muted-foreground">{providerLabel(item.provider)} · {item.recordType.replaceAll("_", " ")}</p>{item.reason && <p className="mt-1 text-foreground/80" data-testid="evidence-reason">Matched because: {item.reason}</p>}</div></div>
          {item.route && <Button asChild size="sm" variant="link" className="mt-1 h-auto p-0 text-xs" data-testid="evidence-record-link"><Link href={item.route}>Open source record</Link></Button>}
        </div>;
      })}
    </div>
    <div className="flex justify-center text-muted-foreground" aria-hidden="true"><ArrowDown className="h-4 w-4" /></div>
    {calculation && <div className="rounded-lg border border-primary/25 bg-primary/5 p-3" data-testid="evidence-calculation"><div className="flex items-center gap-2 font-medium text-foreground"><Calculator className="h-4 w-4 text-primary" />Calculation</div><p className="mt-1 text-muted-foreground">{calculation.summary}</p><div className="mt-2 flex flex-wrap gap-2">{calculation.operands.map((operand, index) => <Badge key={`${operand.label}:${index}`} variant="secondary" className="gap-1.5"><span>{operand.operation === "subtract" ? "−" : operand.operation === "compare" ? "↔" : "+"}</span><span>{operand.label}: {value(operand)}</span></Badge>)}</div></div>}
    <div className="grid gap-2 sm:grid-cols-2"><p data-testid="evidence-confidence"><span className="font-medium text-foreground">Confidence:</span> {confidence == null ? "Not scored" : `${Math.round(confidence * 100)}%`}</p><p><span className="font-medium text-foreground">Excluded:</span> {exclusions.length ? exclusions.join(", ").replaceAll("_", " ") : "None"}</p></div>
    {recommendation && <p data-testid="evidence-recommendation"><span className="font-medium text-foreground">Recommended action:</span> {recommendation}</p>}
  </section>;
}
