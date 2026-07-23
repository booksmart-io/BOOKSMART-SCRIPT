import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

type PlanKey = "plus" | "pro";
type PlanTier = "free" | "plus" | "pro";

type StripeStatus = {
  tier: PlanTier;
  tokenBalance: number;
};

const PROMPT_STORAGE_PREFIX = "booksmart:upgrade-prompt-dismissed";

function clearUpgradePromptDismissals() {
  for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
    const key = window.sessionStorage.key(i);
    if (key?.startsWith(PROMPT_STORAGE_PREFIX)) {
      window.sessionStorage.removeItem(key);
    }
  }
}

const PLAN_FEATURES: Record<PlanKey, string[]> = {
  plus: [
    "5 connected bank accounts",
    "1,000 transactions per month",
    "50 AI questions per month",
    "8 AI tax strategies per month",
    "Full financial reports and unlimited PDF exports",
    "CPA consultations",
  ],
  pro: [
    "Unlimited connected bank accounts",
    "25,000 transactions fair use",
    "Unlimited AI questions and tax strategies",
    "Unlimited PDF and Excel exports",
    "Direct CPA messaging and priority matching",
    "Up to 5 businesses",
  ],
};

const PLAN_DETAILS: Record<PlanKey, { name: string; price: string; tagline: string; badge?: string }> = {
  plus: {
    name: "BookSmart Plus",
    price: "$9.99",
    tagline: "For growing businesses ready for deeper tax and report tools.",
  },
  pro: {
    name: "BookSmart Pro",
    price: "$19.99",
    tagline: "For businesses that need unlimited AI, exports, and CPA support.",
    badge: "Best Value",
  },
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
  return res.json() as Promise<StripeStatus>;
}

export function SubscriptionUpgradePrompt({ userId }: { userId?: number | null }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);

  const storageKey = useMemo(
    () => `${PROMPT_STORAGE_PREFIX}:${userId ?? "anonymous"}`,
    [userId]
  );

  const { data: status, isLoading } = useQuery({
    queryKey: ["stripe_status", "upgrade_prompt", userId],
    queryFn: fetchStatus,
    enabled: Boolean(userId) && location.startsWith("/user") && location !== "/user/subscription",
    staleTime: 60_000,
  });

  const currentTier = status?.tier ?? null;

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") clearUpgradePromptDismissals();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isLoading || !userId || currentTier !== "free") return;
    if (location === "/user/subscription") return;
    if (window.sessionStorage.getItem(storageKey) === "1") return;
    const timer = window.setTimeout(() => setOpen(true), 500);
    return () => window.clearTimeout(timer);
  }, [currentTier, isLoading, location, storageKey, userId]);

  function dismiss() {
    window.sessionStorage.setItem(storageKey, "1");
    setOpen(false);
  }

  async function handleUpgrade(planKey: PlanKey) {
    setLoadingPlan(planKey);
    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error("Please sign in again.");
        return;
      }

      const origin = window.location.origin;
      const successUrl = `${origin}/user/subscription?checkout=success`;
      const cancelUrl = `${origin}/user/subscription?checkout=cancelled`;

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planKey, successUrl, cancelUrl }),
      });
      const data = await res.json() as { url?: string; error?: string; message?: string };
      if (!res.ok || !data.url) {
        toast.error(data.message ?? data.error ?? "Could not start checkout.");
        return;
      }
      window.sessionStorage.setItem(storageKey, "1");
      window.location.href = data.url;
    } finally {
      setLoadingPlan(null);
    }
  }

  if (currentTier !== "free") return null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-border/70 bg-background p-0">
        <DialogHeader className="border-b border-border/60 px-7 py-6">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <Badge variant="outline" className="mb-3 border-primary/60 text-primary">Current Plan: Free</Badge>
              <DialogTitle className="text-2xl font-bold">Upgrade BookSmart</DialogTitle>
              <DialogDescription className="mt-2 text-base">
                Add more bank connections, AI usage, financial exports, and CPA workflow tools.
              </DialogDescription>
            </div>
            <div className="hidden rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-right sm:block">
              <p className="text-xs text-muted-foreground">Free includes</p>
              <p className="font-semibold">1 bank - 50 transactions/mo</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-7 py-6">
          {(["pro", "plus"] as PlanKey[]).map((planKey) => {
            const plan = PLAN_DETAILS[planKey];
            const isLoadingPlan = loadingPlan === planKey;
            return (
              <div
                key={planKey}
                className={`grid gap-5 rounded-lg border p-5 md:grid-cols-[1.1fr_1.5fr_220px] md:items-center ${
                  planKey === "pro" ? "border-primary/60 bg-primary/5" : "border-border/70 bg-card/70"
                }`}
              >
                <div className="space-y-3">
                  {plan.badge && (
                    <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
                      <Sparkles className="h-4 w-4" />
                      {plan.badge}
                    </div>
                  )}
                  <div>
                    <h3 className="text-2xl font-bold">{plan.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                  </div>
                </div>

                <ul className="grid gap-2 text-sm">
                  {PLAN_FEATURES[planKey].map((feature) => (
                    <li key={feature} className="flex gap-2 leading-relaxed">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="space-y-4 rounded-lg border border-border/60 bg-background/50 p-4 text-center">
                  <div>
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground"> /mo</span>
                  </div>
                  <Button className="w-full" onClick={() => handleUpgrade(planKey)} disabled={loadingPlan !== null}>
                    {isLoadingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : `Select ${planKey === "pro" ? "Pro" : "Plus"}`}
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button variant="ghost" onClick={dismiss} className="gap-2 text-muted-foreground">
              <X className="h-4 w-4" />
              Skip for now
            </Button>
            <Button variant="outline" onClick={() => { dismiss(); window.location.href = "/user/subscription"; }}>
              Compare all plans
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
