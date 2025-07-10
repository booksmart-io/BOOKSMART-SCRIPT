import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Eye, Loader2, ShoppingBag, MessageSquare } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Order = {
  id: number;
  user_id: number | null;
  cpa_id: number | null;
  title: string | null;
  services: string | null;
  description: string | null;
  status: "pending" | "active" | "completed" | "cancelled" | string;
  payment_status: string | null;
  created_at: string;
  amount: number | null;
  cpa: { first_name: string | null; last_name: string | null } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function orderId(id: number) {
  return `ORD-${String(id).padStart(4, "0")}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function statusColors(status: string) {
  switch (status) {
    case "completed": return "text-emerald-500 border-emerald-500/30 bg-emerald-500/5";
    case "active":    return "text-primary border-primary/30 bg-primary/10";
    case "cancelled": return "text-rose-500 border-rose-500/30 bg-rose-500/5";
    default:          return "text-yellow-500 border-yellow-500/30 bg-yellow-500/5"; // pending
  }
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────

function OrderDetail({ order, onClose, onChat }: { order: Order; onClose: () => void; onChat: () => void }) {
  const cpaName = [order.cpa?.first_name, order.cpa?.last_name].filter(Boolean).join(" ") || "—";
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{orderId(order.id)}</DialogTitle>
          <DialogDescription>Order details and current status</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <Row label="Status">
            <Badge variant="outline" className={statusColors(order.status)}>
              {order.status}
            </Badge>
          </Row>
          {order.payment_status && (
            <Row label="Payment">
              <span className="capitalize">{order.payment_status}</span>
            </Row>
          )}
          <Row label="CPA">{cpaName}</Row>
          <Row label="Service">{order.title ?? order.services ?? "—"}</Row>
          <Row label="Date submitted">{fmtDate(order.created_at)}</Row>
          {order.amount != null && (
            <Row label="Amount">${order.amount.toFixed(2)}</Row>
          )}
          {order.description && (
            <div className="pt-2 border-t border-border/30">
              <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Notes</p>
              <p className="text-muted-foreground">{order.description}</p>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-2">
          {order.cpa_id ? (
            <Button variant="default" size="sm" className="gap-2" onClick={onChat}>
              <MessageSquare className="h-4 w-4" /> Message CPA
            </Button>
          ) : (
            <span />
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground w-32 flex-shrink-0">{label}</span>
      <span className="font-medium text-right flex-1">{children}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Orders() {
  const { profile } = useAuth();
  const numericId = profile?.numericId ?? null;
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewOrder, setViewOrder] = useState<Order | null>(null);

  function chatWithCpa(cpaId: number | null) {
    if (!cpaId) return;
    navigate(`/user/chat?cpa_id=${cpaId}`);
  }

  // ── Fetch real orders for this user ─────────────────────────────────────────
  const { data: orders = [], isLoading, error } = useQuery<Order[]>({
    queryKey: ["user_orders", numericId],
    enabled: numericId !== null,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, user_id, cpa_id, title, services, description, status, payment_status, amount, created_at, cpa:users!cpa_id(first_name, last_name)")
        .eq("user_id", numericId!)
        .order("created_at", { ascending: false });
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      return (data ?? []) as unknown as Order[];
    },
  });

  // ── Filter ──────────────────────────────────────────────────────────────────
  const cpaFullName = (o: Order) => {
    const parts = [o.cpa?.first_name, o.cpa?.last_name].filter(Boolean).join(" ");
    return parts || "—";
  };

  const filtered = orders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      orderId(o.id).toLowerCase().includes(q) ||
      cpaFullName(o).toLowerCase().includes(q) ||
      (o.title ?? "").toLowerCase().includes(q) ||
      (o.services ?? "").toLowerCase().includes(q)
    );
  });

  const STATUS_OPTIONS = ["all", "pending", "active", "completed", "cancelled"];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">Manage your active and past CPA service orders.</p>
        </div>
        {!isLoading && orders.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors capitalize ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {s === "all" ? "All" : s}
                {s !== "all" && (
                  <span className="ml-1 opacity-70">
                    ({orders.filter(o => o.status === s).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Order History</CardTitle>
          <CardDescription>Track the status of your tax prep and consultation orders.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search row */}
          <div className="flex justify-between items-center mb-4 gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders…"
                className="pl-9 h-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {search && (
              <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                Clear
              </Button>
            )}
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Could not load orders. Please try again later.
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && orders.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium">No orders yet</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                When you hire a CPA from the CPA Network, your orders will appear here.
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href="/user/cpa-network">Browse CPA Network</a>
              </Button>
            </div>
          )}

          {/* No search matches */}
          {!isLoading && !error && orders.length > 0 && filtered.length === 0 && (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No orders match your search.{" "}
              <button className="underline text-foreground" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                Clear filters
              </button>
            </div>
          )}

          {/* Table */}
          {!isLoading && !error && filtered.length > 0 && (
            <div className="border rounded-md border-border/50">
              <Table>
                <TableHeader className="bg-secondary/20">
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>CPA Name</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(order => (
                    <TableRow key={order.id} className="hover:bg-secondary/10">
                      <TableCell className="font-medium text-primary">{orderId(order.id)}</TableCell>
                      <TableCell>{cpaFullName(order)}</TableCell>
                      <TableCell>{order.title ?? order.services ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(order.created_at)}</TableCell>
                      <TableCell>
                        {order.amount != null
                          ? `$${order.amount.toFixed(2)}`
                          : <span className="text-muted-foreground text-xs">TBD</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors(order.status)}>
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {order.cpa_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-muted-foreground hover:text-primary hover:bg-primary/10"
                              title="Message CPA"
                              onClick={() => chatWithCpa(order.cpa_id)}
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-muted-foreground hover:text-primary hover:bg-primary/10"
                            onClick={() => setViewOrder(order)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      {viewOrder && (
        <OrderDetail
          order={viewOrder}
          onClose={() => setViewOrder(null)}
          onChat={() => { setViewOrder(null); chatWithCpa(viewOrder.cpa_id); }}
        />
      )}
    </div>
  );
}
