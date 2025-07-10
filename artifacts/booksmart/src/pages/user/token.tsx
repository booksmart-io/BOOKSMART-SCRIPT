import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Zap, Loader2, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type PackageKey = "tokens_starter" | "tokens_growth" | "tokens_business" | "tokens_professional";

const PACKAGES: { key: PackageKey; label: string; tokens: number; price: number }[] = [
  { key: "tokens_starter", label: "Starter", tokens: 10, price: 10 },
  { key: "tokens_growth", label: "Growth", tokens: 25, price: 25 },
  { key: "tokens_business", label: "Business", tokens: 50, price: 50 },
  { key: "tokens_professional", label: "Professional", tokens: 100, price: 100 },
];

async function getAuthToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function fetchStatus() {
  const token = await getAuthToken();
  if (!token) return null;
  const res = await fetch("/api/stripe/status", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ tier: "free" | "plus" | "pro"; tokenBalance: number }>;
}

async function fetchTokenHistory() {
  const token = await getAuthToken();
  if (!token) return [];
  const { data: authUser } = await supabase.auth.getUser();
  if (!authUser.user) return [];
  const { data, error } = await supabase
    .from("token_transactions")
    .select("*")
    .eq("user_id", authUser.user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return [];
  return data ?? [];
}

export default function Token() {
  const queryClient = useQueryClient();
  const [loadingPackage, setLoadingPackage] = useState<PackageKey | null>(null);

  const { data: status } = useQuery({ queryKey: ["stripe_status"], queryFn: fetchStatus });
  const { data: history } = useQuery({ queryKey: ["token_transactions"], queryFn: fetchTokenHistory });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const checkoutResult = params.get("checkout");
    if (!sessionId || checkoutResult !== "success") return;

    (async () => {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch("/api/stripe/confirm-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.tokensAdded ? `+${data.tokensAdded} tokens added!` : "Tokens added!");
        queryClient.invalidateQueries({ queryKey: ["stripe_status"] });
        queryClient.invalidateQueries({ queryKey: ["token_transactions"] });
      } else {
        toast.error(data.error === "payment_not_completed" ? "Payment not completed yet." : "Could not confirm purchase.");
      }
      window.history.replaceState({}, "", window.location.pathname);
    })();
  }, [queryClient]);

  async function handleBuy(packageKey: PackageKey) {
    setLoadingPackage(packageKey);
    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error("Please sign in again.");
        return;
      }

      const origin = window.location.origin;
      const path = window.location.pathname;
      const successUrl = `${origin}${path}?checkout=success`;
      const cancelUrl = `${origin}${path}?checkout=cancelled`;

      const res = await fetch("/api/stripe/create-token-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ packageKey, successUrl, cancelUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not start checkout.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoadingPackage(null);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Token Wallet</h1>
        <p className="text-muted-foreground">Buy BookSmart tokens to unlock extra AI, reports, and CPA access.</p>
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <CardContent className="p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Current Balance</p>
            <div className="flex items-end justify-center sm:justify-start gap-2">
              <Coins className="h-10 w-10 text-primary mb-1" />
              <span className="text-5xl font-bold text-foreground">{status?.tokenBalance ?? 0}</span>
              <span className="text-xl text-muted-foreground mb-1 font-medium">BS</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" /> Buy Tokens
          </CardTitle>
          <CardDescription>1 Token = $1. No discounts — token value stays fixed.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PACKAGES.map((pkg) => (
              <div key={pkg.key} className="rounded-xl border border-border/50 bg-card p-5 flex flex-col items-center text-center gap-3">
                <Zap className="h-6 w-6 text-primary" />
                <div className="font-semibold">{pkg.label}</div>
                <div className="text-2xl font-bold">{pkg.tokens} <span className="text-sm font-normal text-muted-foreground">BS</span></div>
                <div className="text-sm text-muted-foreground">${pkg.price}</div>
                <Button
                  className="w-full mt-2"
                  disabled={loadingPackage !== null}
                  onClick={() => handleBuy(pkg.key)}
                >
                  {loadingPackage === pkg.key ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buy"}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No token transactions yet.</p>
          ) : (
            <div className="space-y-4">
              {history.map((tx) => (
                <div key={tx.id} className="flex justify-between items-center border-b border-border/30 pb-3 last:border-0 last:pb-0">
                  <div>
                    <div className="font-medium text-sm">{tx.use_case ?? tx.type}</div>
                    <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString()}</div>
                  </div>
                  <Badge variant="secondary" className={tx.amount >= 0 ? "text-primary" : "text-destructive"}>
                    {tx.amount >= 0 ? "+" : ""}{tx.amount} BS
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
