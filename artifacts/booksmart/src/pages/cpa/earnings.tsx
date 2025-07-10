import { useQuery } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Wallet, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

interface Order {
  id: number;
  user_id: number;
  title: string;
  status: string;
  payment_status: string;
  amount: number;
  cpa_payout_amount: number | null;
  cpa_payout_status: string | null;
  created_at: string;
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// The amount the CPA actually receives (after platform fee), fallback to full amount
function cpaPayout(o: Order) {
  return o.cpa_payout_amount ?? o.amount ?? 0;
}

function monthKey(ts: string) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function CpaEarnings() {
  const { profile } = useAuth();
  const numericId = profile?.numericId as number | undefined;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  // ── All orders for this CPA ────────────────────────────────────────────────
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["cpa_orders", numericId],
    enabled: !!numericId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,user_id,title,status,payment_status,amount,cpa_payout_amount,cpa_payout_status,created_at")
        .eq("cpa_id", numericId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── KPI computations ───────────────────────────────────────────────────────
  const completed = orders.filter((o) => o.status === "completed");
  const lifetimeEarnings = completed.reduce((s, o) => s + cpaPayout(o), 0);

  const thisMonthEarnings = completed
    .filter((o) => o.created_at >= monthStart)
    .reduce((s, o) => s + cpaPayout(o), 0);

  const lastMonthEarnings = completed
    .filter((o) => o.created_at >= lastMonthStart && o.created_at < monthStart)
    .reduce((s, o) => s + cpaPayout(o), 0);

  // Pending payout: completed orders where CPA hasn't been paid out yet
  const pendingPayout = completed
    .filter((o) => o.cpa_payout_status === "pending" || (!o.cpa_payout_status && o.payment_status !== "paid"))
    .reduce((s, o) => s + cpaPayout(o), 0);

  const pendingPayoutCount = completed.filter(
    (o) => o.cpa_payout_status === "pending" || (!o.cpa_payout_status && o.payment_status !== "paid")
  ).length;

  const monthPct = lastMonthEarnings > 0
    ? Math.round(((thisMonthEarnings - lastMonthEarnings) / lastMonthEarnings) * 100)
    : null;

  // ── Monthly breakdown ──────────────────────────────────────────────────────
  const monthlyMap: Record<string, { earned: number; count: number }> = {};
  for (const o of completed) {
    const key = monthKey(o.created_at);
    if (!monthlyMap[key]) monthlyMap[key] = { earned: 0, count: 0 };
    monthlyMap[key].earned += cpaPayout(o);
    monthlyMap[key].count += 1;
  }
  const monthlyRows = Object.entries(monthlyMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12);

  // ── Recent completed orders ────────────────────────────────────────────────
  const recentCompleted = completed.slice(0, 10);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Earnings</h1>
        <p className="text-muted-foreground">Track your income from completed orders.</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payout</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <>
                <div className="text-3xl font-bold">{fmtCurrency(pendingPayout)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {pendingPayoutCount} completed {pendingPayoutCount === 1 ? "order" : "orders"} awaiting payout
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Earned This Month</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <>
                <div className="text-3xl font-bold">{fmtCurrency(thisMonthEarnings)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {monthPct !== null
                    ? `${monthPct >= 0 ? "+" : ""}${monthPct}% vs last month`
                    : "No prior month data"}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lifetime Earnings</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <>
                <div className="text-3xl font-bold">{fmtCurrency(lifetimeEarnings)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  from {completed.length} completed {completed.length === 1 ? "order" : "orders"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Monthly breakdown */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Monthly Breakdown</CardTitle>
            <CardDescription>Your payout earnings per month.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : monthlyRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No completed orders yet.</p>
            ) : (
              <div className="border rounded-md border-border/50">
                <Table>
                  <TableHeader className="bg-secondary/20">
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-center">Orders</TableHead>
                      <TableHead className="text-right">Payout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyRows.map(([key, { earned, count }]) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium">{monthLabel(key)}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{count}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-500">{fmtCurrency(earned)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent completed orders */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Recent Completed Orders</CardTitle>
            <CardDescription>Latest orders you've fulfilled.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : recentCompleted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No completed orders yet.</p>
            ) : (
              <div className="border rounded-md border-border/50">
                <Table>
                  <TableHeader className="bg-secondary/20">
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Payout Status</TableHead>
                      <TableHead className="text-right">Your Payout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentCompleted.map((o) => {
                      const isPaid = o.cpa_payout_status === "paid" || o.payment_status === "paid";
                      return (
                        <TableRow key={o.id}>
                          <TableCell>
                            <div className="font-medium text-sm truncate max-w-[140px]">{o.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(o.created_at).toLocaleDateString()}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                isPaid
                                  ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-xs"
                                  : "text-yellow-500 border-yellow-500/30 bg-yellow-500/10 text-xs"
                              }
                            >
                              {isPaid ? "paid" : "pending"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{fmtCurrency(cpaPayout(o))}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
