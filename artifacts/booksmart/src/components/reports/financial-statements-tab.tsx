import { FileText, Upload, Sparkles, PenLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  statementPeriodLabel,
  type StatementPeriod,
  type DocType,
} from "@/lib/financial-statements";

function fmt(v: number) {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  pnl: "Profit & Loss",
  bs: "Balance Sheet",
  cf: "Cash Flow",
};

export function sortByPeriodDesc(a: StatementPeriod, b: StatementPeriod) {
  const aDate = a.periodEnd ?? a.asOf ?? new Date(0);
  const bDate = b.periodEnd ?? b.asOf ?? new Date(0);
  return bDate.getTime() - aDate.getTime();
}

export function SourceBadge({ source }: { source: "ai" | "manual" }) {
  return source === "ai" ? (
    <Badge variant="outline" className="gap-1 border-primary/40 text-primary text-[10px]">
      <Sparkles className="h-3 w-3" /> AI Extracted
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-border/60 text-muted-foreground text-[10px]">
      <PenLine className="h-3 w-3" /> Manual Entry
    </Badge>
  );
}

export function PnLCard({ p }: { p: StatementPeriod }) {
  const f = p.pnl!;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{statementPeriodLabel(p)}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{p.docName}</p>
          </div>
          <SourceBadge source={p.source} />
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-muted-foreground">Revenue</p><p className="font-semibold text-emerald-400">{fmt(f.revenue)}</p></div>
        <div><p className="text-muted-foreground">COGS</p><p className="font-semibold">{fmt(f.cogs)}</p></div>
        <div><p className="text-muted-foreground">Gross Profit</p><p className="font-semibold">{fmt(f.grossProfit)}</p></div>
        <div><p className="text-muted-foreground">Operating Expenses</p><p className="font-semibold text-rose-400">{fmt(f.opex)}</p></div>
        <div className="col-span-2 pt-2 border-t border-border/50">
          <p className="text-muted-foreground">Net Income</p>
          <p className={`text-lg font-bold ${f.netIncome >= 0 ? "text-primary" : "text-destructive"}`}>{fmt(f.netIncome)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function BSCard({ p }: { p: StatementPeriod }) {
  const f = p.bs!;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{statementPeriodLabel(p)}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{p.docName}</p>
          </div>
          <SourceBadge source={p.source} />
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-muted-foreground">Current Assets</p><p className="font-semibold">{fmt(f.currentAssets)}</p></div>
        <div><p className="text-muted-foreground">Non-Current Assets</p><p className="font-semibold">{fmt(f.nonCurrentAssets)}</p></div>
        <div><p className="text-muted-foreground">Total Assets</p><p className="font-semibold text-emerald-400">{fmt(f.totalAssets)}</p></div>
        <div><p className="text-muted-foreground">Total Liabilities</p><p className="font-semibold text-rose-400">{fmt(f.totalLiabilities)}</p></div>
        <div className="col-span-2 pt-2 border-t border-border/50">
          <p className="text-muted-foreground">Equity</p>
          <p className="text-lg font-bold text-primary">{fmt(f.equity)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function CFCard({ p }: { p: StatementPeriod }) {
  const f = p.cf!;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{statementPeriodLabel(p)}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{p.docName}</p>
          </div>
          <SourceBadge source={p.source} />
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-muted-foreground">Operating</p><p className="font-semibold">{fmt(f.operating)}</p></div>
        <div><p className="text-muted-foreground">Investing</p><p className="font-semibold">{fmt(f.investing)}</p></div>
        <div><p className="text-muted-foreground">Financing</p><p className="font-semibold">{fmt(f.financing)}</p></div>
        <div className="pt-2 border-t border-border/50">
          <p className="text-muted-foreground">Net Change</p>
          <p className={`text-lg font-bold ${f.netChange >= 0 ? "text-primary" : "text-destructive"}`}>{fmt(f.netChange)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function FinancialStatementsTab({
  periods,
  isLoading,
  onUploadClick,
}: {
  periods: StatementPeriod[];
  isLoading: boolean;
  onUploadClick: () => void;
}) {
  const pnlPeriods = periods.filter((p) => p.docType === "pnl").sort(sortByPeriodDesc);
  const bsPeriods = periods.filter((p) => p.docType === "bs").sort(sortByPeriodDesc);
  const cfPeriods = periods.filter((p) => p.docType === "cf").sort(sortByPeriodDesc);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Financial Statements</h1>
          <p className="text-sm text-muted-foreground">
            Official figures from your uploaded and manually entered documents — kept separate from your day-to-day transaction reports.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 shrink-0" onClick={onUploadClick}>
          <Upload className="h-3.5 w-3.5" />
          Upload / Add Statement
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-40 animate-pulse bg-secondary/30" />
          ))}
        </div>
      ) : periods.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center gap-3">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No financial statements yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upload a P&L, Balance Sheet, or Cash Flow document — or enter one manually — to see it here.
              </p>
            </div>
            <Button size="sm" className="mt-2 gap-1.5" onClick={onUploadClick}>
              <Upload className="h-3.5 w-3.5" />
              Upload / Add Statement
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {pnlPeriods.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{DOC_TYPE_LABEL.pnl}</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pnlPeriods.map((p, i) => <PnLCard key={`${p.docId}-${i}`} p={p} />)}
              </div>
            </section>
          )}
          {bsPeriods.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{DOC_TYPE_LABEL.bs}</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {bsPeriods.map((p, i) => <BSCard key={`${p.docId}-${i}`} p={p} />)}
              </div>
            </section>
          )}
          {cfPeriods.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{DOC_TYPE_LABEL.cf}</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {cfPeriods.map((p, i) => <CFCard key={`${p.docId}-${i}`} p={p} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
