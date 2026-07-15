import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type PlanKey = "plus" | "pro";

const PLAN_FEATURES: Record<"free" | PlanKey, string[]> = {
  free: [
    "1 connected bank account",
    "50 transactions categorized/month",
    "10 AI questions/month",
    "1 AI tax strategy/month",
    "View-only P&L, Cash Flow",
    "Browse CPA directory",
  ],
  plus: [
    "5 connected accounts",
    "1,000 transactions/month",
    "50 AI questions/month",
    "8 AI tax strategies/month",
    "Full P&L, Cash Flow, Balance Sheet",
    "Tax Deduction Report + unlimited PDF exports",
    "Contact CPAs & request consultations",
  ],
  pro: [
    "Unlimited accounts & transactions (25,000 fair use)",
    "Unlimited AI questions & tax strategies",
    "AI CFO, AI Funding Coach, AI Deduction Optimizer",
    "Unlimited PDF & Excel exports",
    "Direct CPA messaging + priority matching",
    "Up to 5 businesses",
    "Priority support",
  ],
};

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

export default function Subscription() {
  const queryClient = useQueryClient();
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);

  const { data: status } = useQuery({
    queryKey: ["stripe_status"],
    queryFn: fetchStatus,
  });

  const currentTier = status?.tier ?? "free";

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
        toast.success("Subscription activated!");
        queryClient.invalidateQueries({ queryKey: ["stripe_status"] });
      } else {
        toast.error(data.error === "payment_not_completed" ? "Payment not completed yet." : "Could not confirm subscription.");
      }
      window.history.replaceState({}, "", window.location.pathname);
    })();
  }, [queryClient]);

  async function handleUpgrade(planKey: PlanKey) {
    setLoadingPlan(planKey);
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

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planKey, successUrl, cancelUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not start checkout.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Upgrade Your Command Center</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Choose the plan that fits your business needs. Upgrade anytime to unlock AI insights and priority CPA matching.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 mt-8">
        <Card className="border-border/50 flex flex-col">
          <CardHeader>
            <CardTitle className="text-2xl">Free</CardTitle>
            <CardDescription>Essential tools for tracking finances.</CardDescription>
            <div className="mt-4 flex items-baseline text-4xl font-bold">
              $0
              <span className="text-lg text-muted-foreground font-normal ml-1">/mo</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-3">
              {PLAN_FEATURES.free.map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3 text-primary" />
                  </div>
                  {feature}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" disabled={currentTier === "free"}>
              {currentTier === "free" ? "Current Plan" : "Downgrade"}
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-border/50 flex flex-col">
          <CardHeader>
            <CardTitle className="text-2xl">Plus</CardTitle>
            <CardDescription>Tax optimization for growing businesses.</CardDescription>
            <div className="mt-4 flex items-baseline text-4xl font-bold">
              $9.99
              <span className="text-lg text-muted-foreground font-normal ml-1">/mo</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-3">
              {PLAN_FEATURES.plus.map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3 text-primary" />
                  </div>
                  {feature}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              className="w-full"
              disabled={currentTier === "plus" || loadingPlan !== null}
              onClick={() => handleUpgrade("plus")}
            >
              {loadingPlan === "plus" ? <Loader2 className="h-4 w-4 animate-spin" /> : currentTier === "plus" ? "Current Plan" : "Upgrade to Plus"}
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-primary/50 bg-primary/5 shadow-xl shadow-primary/5 flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
            Popular
          </div>
          <CardHeader>
            <CardTitle className="text-2xl text-primary">Pro</CardTitle>
            <CardDescription>The complete financial operating system.</CardDescription>
            <div className="mt-4 flex items-baseline text-4xl font-bold">
              $19.99
              <span className="text-lg text-muted-foreground font-normal ml-1">/mo</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-3">
              {PLAN_FEATURES.pro.map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                  <span className={i === 0 ? "font-semibold" : ""}>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full" disabled={currentTier === "pro" || loadingPlan !== null} onClick={() => handleUpgrade("pro")}>
              {loadingPlan === "pro" ? <Loader2 className="h-4 w-4 animate-spin" /> : currentTier === "pro" ? "Current Plan" : "Upgrade to Pro"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
