import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Search, Loader2, UserCircle2, Settings2 } from "lucide-react";
import { toast } from "sonner";

type Account = {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  createdAt: string;
  tokenBalance: number;
  verificationStatus: string;
  tier: "free" | "plus" | "pro";
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const tierColor: Record<string, string> = {
  free: "text-muted-foreground border-border",
  plus: "text-blue-400 border-blue-400/30",
  pro: "text-primary border-primary/30",
};

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editTokens, setEditTokens] = useState("");
  const [editTier, setEditTier] = useState<"free" | "plus" | "pro">("free");
  const qc = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ["admin_accounts"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/accounts", { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Failed to load accounts");
      }
      const body = await res.json() as { accounts: Account[] };
      return body.accounts;
    },
  });

  const savePlanAndTokens = useMutation({
    mutationFn: async () => {
      if (!editingAccount) return;
      const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
      const tokenBalance = Number(editTokens);
      if (!Number.isFinite(tokenBalance) || tokenBalance < 0) throw new Error("Token balance must be a non-negative number");

      const [tokenRes, planRes] = await Promise.all([
        fetch("/api/admin/set-token-balance", {
          method: "POST", headers,
          body: JSON.stringify({ userId: editingAccount.id, tokenBalance }),
        }),
        editTier !== editingAccount.tier
          ? fetch("/api/admin/set-plan", {
              method: "POST", headers,
              body: JSON.stringify({ userId: editingAccount.id, tier: editTier }),
            })
          : Promise.resolve(null),
      ]);

      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(body?.message ?? "Failed to update tokens");
      }
      if (planRes && !planRes.ok) {
        const body = await planRes.json().catch(() => ({}));
        throw new Error(body?.message ?? "Failed to update plan");
      }
    },
    onSuccess: () => {
      toast.success("Account updated.");
      qc.invalidateQueries({ queryKey: ["admin_accounts"] });
      setEditingAccount(null);
    },
    onError: (e: Error) => {
      toast.error(e.message || "Failed to update account");
    },
  });

  function openEdit(a: Account) {
    setEditingAccount(a);
    setEditTokens(String(a.tokenBalance));
    setEditTier(a.tier);
  }

  const filtered = accounts.filter((u) => {
    if (u.role !== "user") return false;
    const matchesSearch =
      !search ||
      `${u.firstName ?? ""} ${u.lastName ?? ""} ${u.email}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const roleColor: Record<string, string> = {
    user: "text-blue-400 border-blue-400/30",
    cpa: "text-purple-400 border-purple-400/30",
    admin: "text-primary border-primary/30",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">View and manage all platform accounts, plans, and token balances.</p>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>All Users <span className="text-muted-foreground text-base font-normal">({filtered.length})</span></CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email…"
                className="pl-9 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="border rounded-md border-border/50">
            <Table>
              <TableHeader className="bg-secondary/20">
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10">
                      <div className="flex flex-col items-center gap-2">
                        <UserCircle2 className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No users match your search.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">
                        {u.firstName || u.lastName
                          ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
                          : <span className="text-muted-foreground italic">No name</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${roleColor[u.role] ?? ""}`}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(u.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${tierColor[u.tier] ?? ""}`}>
                        {u.tier}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-primary">{u.tokenBalance ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(u)}>
                        <Settings2 className="h-3.5 w-3.5" /> Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Account</DialogTitle>
          </DialogHeader>
          {editingAccount && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">
                  {editingAccount.firstName || editingAccount.lastName
                    ? `${editingAccount.firstName ?? ""} ${editingAccount.lastName ?? ""}`.trim()
                    : editingAccount.email}
                </p>
                <p className="text-xs text-muted-foreground">{editingAccount.email}</p>
              </div>

              <div className="space-y-2">
                <Label>Plan Tier</Label>
                <Select value={editTier} onValueChange={(v) => setEditTier(v as "free" | "plus" | "pro")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="plus">Plus</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This overrides the account's plan directly — it does not create or charge a real Stripe subscription.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Token Balance</Label>
                <Input
                  type="number"
                  min={0}
                  value={editTokens}
                  onChange={(e) => setEditTokens(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAccount(null)}>Cancel</Button>
            <Button onClick={() => savePlanAndTokens.mutate()} disabled={savePlanAndTokens.isPending}>
              {savePlanAndTokens.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
