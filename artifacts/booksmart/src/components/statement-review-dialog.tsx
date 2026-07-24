import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  saveStatementReview,
  type StatementDraft,
  type ValidationFinding,
} from "@/lib/statement-workflow";

const LABELS: Record<string, string> = {
  revenue: "Revenue", cost_of_goods_sold: "Cost of Goods Sold", gross_profit: "Gross Profit",
  operating_expenses: "Operating Expenses", operating_income: "Operating Income",
  interest_expense: "Interest Expense", tax_expense: "Tax Expense", net_income: "Net Income",
  cash: "Cash", current_assets: "Current Assets", non_current_assets: "Non-Current Assets",
  total_assets: "Total Assets", current_liabilities: "Current Liabilities",
  long_term_liabilities: "Long-Term Liabilities", total_liabilities: "Total Liabilities",
  equity: "Equity", total_liabilities_and_equity: "Liabilities & Equity",
  beginning_cash: "Beginning Cash", operating_activities: "Operating Activities",
  investing_activities: "Investing Activities", financing_activities: "Financing Activities",
  net_cash_change: "Net Cash Change", ending_cash: "Ending Cash",
};

function localValidation(draft: StatementDraft, tolerance = 1): ValidationFinding[] {
  const v = draft.values;
  const checks: Array<[string, string, number | null, number | null]> = [];
  const sum = (...keys: string[]) => keys.some(k => v[k] === null) ? null : keys.reduce((n, k) => n + (v[k] ?? 0), 0);
  if (draft.metadata.statement_type === "pnl") {
    checks.push(["pnl_gross_profit", "Gross profit = revenue − COGS", v.revenue === null || v.cost_of_goods_sold === null ? null : v.revenue - v.cost_of_goods_sold, v.gross_profit]);
    checks.push(["pnl_operating_income", "Operating income = gross profit − operating expenses", v.gross_profit === null || v.operating_expenses === null ? null : v.gross_profit - v.operating_expenses, v.operating_income]);
  } else if (draft.metadata.statement_type === "bs") {
    checks.push(["bs_total_assets", "Total assets = current + non-current assets", sum("current_assets", "non_current_assets"), v.total_assets]);
    checks.push(["bs_total_liabilities", "Total liabilities = current + long-term liabilities", sum("current_liabilities", "long_term_liabilities"), v.total_liabilities]);
    checks.push(["bs_equation", "Assets = liabilities + equity", sum("total_liabilities", "equity"), v.total_assets]);
  } else {
    checks.push(["cf_net_change", "Net change = operating + investing + financing", sum("operating_activities", "investing_activities", "financing_activities"), v.net_cash_change]);
    checks.push(["cf_rollforward", "Ending cash = beginning cash + net change", sum("beginning_cash", "net_cash_change"), v.ending_cash]);
  }
  return checks.flatMap(([code, message, expected, actual]) => {
    if (expected === null || actual === null || Math.abs(actual - expected) <= tolerance) return [];
    return [{ code, severity: "warning" as const, message, expected, actual, difference: actual - expected, tolerance }];
  });
}

export function StatementReviewDialog({
  open, statementId, organizationId, initial, serverWarnings = [], onDone, onDeleteUpload,
}: {
  open: boolean;
  statementId: number;
  organizationId: number;
  initial: StatementDraft;
  serverWarnings?: string[];
  onDone: () => void;
  onDeleteUpload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<StatementDraft>(() => structuredClone(initial));
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [acknowledge, setAcknowledge] = useState(false);
  const [decision, setDecision] = useState<"keep_booksmart" | "use_uploaded" | "investigate" | "review_later" | "propose_adjustments">("use_uploaded");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const validation = useMemo(() => localValidation(draft), [draft]);

  function updateValue(field: string, raw: string) {
    const value = raw.trim() === "" ? null : Number(raw);
    setDraft(prev => ({ ...prev, values: { ...prev.values, [field]: Number.isFinite(value) ? value : null } }));
    setEdited(prev => new Set(prev).add(field));
  }

  async function save(action: "save_draft" | "confirm") {
    setSaving(true); setError("");
    try {
      await saveStatementReview({ id: statementId, organizationId, statement: draft, action, acknowledgeWarnings: acknowledge, reportingDecision: decision });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed."); }
    finally { setSaving(false); }
  }

  const warnings = [...serverWarnings, ...validation.map(v => `${v.message}; difference ${v.difference?.toFixed(2)} (tolerance ${v.tolerance.toFixed(2)}).`)];
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
        <DialogHeader><DialogTitle className="flex gap-2 items-center"><FileText className="h-5 w-5" />Review Financial Statement</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Processed by the configured AI provider. Review and correct every value before confirmation.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><Label>Entity</Label><Input value={draft.metadata.entity_name ?? ""} onChange={e => setDraft(p => ({ ...p, metadata: { ...p.metadata, entity_name: e.target.value || null } }))} /></div>
          <div><Label>Currency</Label><Input maxLength={3} value={draft.metadata.currency} onChange={e => setDraft(p => ({ ...p, metadata: { ...p.metadata, currency: e.target.value.toUpperCase() } }))} /></div>
          <div><Label>Scale</Label><Select value={draft.metadata.scale} onValueChange={scale => setDraft(p => ({ ...p, metadata: { ...p.metadata, scale: scale as StatementDraft["metadata"]["scale"] } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ones">Ones</SelectItem><SelectItem value="thousands">Thousands</SelectItem><SelectItem value="millions">Millions</SelectItem></SelectContent></Select></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {Object.entries(draft.values).map(([field, value]) => {
            const evidence = draft.evidence.find(e => e.field === field);
            return <div key={field} className="rounded-md border p-2">
              <Label className="flex justify-between"><span>{LABELS[field] ?? field}</span>{edited.has(field) && <span className="text-amber-500 text-[10px]">User edited</span>}</Label>
              <Input type="number" step="0.01" value={value ?? ""} onChange={e => updateValue(field, e.target.value)} />
              {evidence && <p className="text-[10px] text-muted-foreground mt-1">{evidence.page ? `Page ${evidence.page} · ` : ""}{evidence.location ?? evidence.excerpt}</p>}
            </div>;
          })}
        </div>
        {warnings.length > 0 && <div className="rounded-md border border-amber-500/40 p-3 space-y-2"><p className="text-sm font-semibold flex gap-2"><AlertTriangle className="h-4 w-4" />Warnings</p>{warnings.map((w, i) => <p key={i} className="text-xs">{w}</p>)}<label className="flex items-center gap-2 text-xs"><Checkbox checked={acknowledge} onCheckedChange={v => setAcknowledge(v === true)} />I reviewed and acknowledge these warnings.</label></div>}
        <div><Label>Reporting decision</Label><Select value={decision} onValueChange={v => setDecision(v as typeof decision)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="keep_booksmart">Keep BookSmart values (no transactions)</SelectItem><SelectItem value="use_uploaded">Use uploaded statement (create summarized transactions)</SelectItem><SelectItem value="investigate">Investigate differences (no transactions)</SelectItem><SelectItem value="review_later">Review later (no transactions)</SelectItem><SelectItem value="propose_adjustments">Create draft proposed adjustments (no transactions)</SelectItem></SelectContent></Select></div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="destructive" disabled={saving} onClick={onDeleteUpload}>Delete Upload</Button>
          <Button variant="outline" disabled={saving} onClick={async () => { await saveStatementReview({ id: statementId, organizationId, statement: draft, action: "abandon" }); onDone(); }}>Cancel</Button>
          <Button variant="outline" disabled={saving} onClick={() => save("save_draft")}>Save Draft</Button>
          <Button disabled={saving || (warnings.length > 0 && !acknowledge)} onClick={() => save("confirm")}><CheckCircle2 className="h-4 w-4 mr-1" />Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
