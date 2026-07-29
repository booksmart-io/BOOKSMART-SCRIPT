import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidatePaymentQueries } from "@/lib/payment-query-cache";
import {
  embeddedCheckoutAvailable,
  StripeCheckoutModal,
} from "@/components/stripe-checkout-modal";

type PlanKey = "plus" | "pro";
type SubscriptionStatus = {
  tier: "free" | "plus" | "pro";
  tokenBalance: number;
  subscription: {
    status: string;
    stripe_price_id: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
};

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
  return res.json() as Promise<SubscriptionStatus>;
}

function formatBillingDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function Subscription() {
  const queryClient = useQueryClient();
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [downgradeOpen, setDowngradeOpen] = useState(false);
  const [subscriptionAction, setSubscriptionAction] =
    useState<"cancel" | "resume" | null>(null);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
  const checkoutInFlight = useRef(false);
  const subscriptionActionInFlight = useRef(false);

  const { data: status } = useQuery({
    queryKey: ["stripe_status"],
    queryFn: fetchStatus,
  });

  const currentTier = status?.tier ?? "free";
  const cancellationPending =
    currentTier !== "free" &&
    status?.subscription?.cancel_at_period_end === true;
  const billingEndDate = formatBillingDate(
    status?.subscription?.current_period_end,
  );

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
        invalidatePaymentQueries(queryClient);
      } else {
        toast.error(data.error === "payment_not_completed" ? "Payment not completed yet." : "Could not confirm subscription.");
      }
      window.history.replaceState({}, "", window.location.pathname);
    })();
  }, [queryClient]);

  async function completeEmbeddedCheckout() {
    if (!checkoutSessionId) return;
    const token = await getAuthToken();
    if (!token) {
      toast.error("Please sign in again.");
      return;
    }
    const res = await fetch("/api/stripe/confirm-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionId: checkoutSessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error === "payment_not_completed" ? "Payment not completed yet." : "Could not confirm subscription.");
      return;
    }
    setCheckoutClientSecret(null);
    setCheckoutSessionId(null);
    toast.success("Subscription activated!");
    invalidatePaymentQueries(queryClient);
  }

  async function handleUpgrade(planKey: PlanKey) {
    if (checkoutInFlight.current) return;
    checkoutInFlight.current = true;
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
      const checkoutAttemptId = crypto.randomUUID();

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planKey,
          successUrl,
          cancelUrl,
          checkoutAttemptId,
          uiMode: embeddedCheckoutAvailable ? "embedded" : "hosted",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message ?? data.error ?? "Could not start checkout.");
        return;
      }
      if (embeddedCheckoutAvailable && data.clientSecret && data.sessionId) {
        setCheckoutClientSecret(data.clientSecret);
        setCheckoutSessionId(data.sessionId);
      } else if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Stripe did not return a checkout session.");
      }
    } finally {
      checkoutInFlight.current = false;
      setLoadingPlan(null);
    }
  }

  async function updateCancellation(
    action: "cancel" | "resume",
  ) {
    if (subscriptionActionInFlight.current) return;
    subscriptionActionInFlight.current = true;
    setSubscriptionAction(action);
    try {
      const token = await getAuthToken();
      if (!token) {
        toast.error("Please sign in again.");
        return;
      }

      const endpoint = action === "cancel"
        ? "/api/stripe/cancel-subscription"
        : "/api/stripe/resume-subscription";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          data.message ??
            (action === "cancel"
              ? "Could not schedule the downgrade."
              : "Could not cancel the downgrade."),
        );
        return;
      }

      invalidatePaymentQueries(queryClient);
      await queryClient.refetchQueries({ queryKey: ["stripe_status"] });
      setDowngradeOpen(false);
      toast.success(
        action === "cancel"
          ? "Downgrade scheduled."
          : "Your paid plan will continue.",
      );
    } finally {
      subscriptionActionInFlight.current = false;
      setSubscriptionAction(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 sm:space-y-8">
      <StripeCheckoutModal
        clientSecret={checkoutClientSecret}
        title="Complete Your Subscription"
        onClose={() => {
          setCheckoutClientSecret(null);
          setCheckoutSessionId(null);
        }}
        onComplete={completeEmbeddedCheckout}
      />
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Upgrade Your Command Center</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Choose the plan that fits your business needs. Upgrade anytime to unlock AI insights and priority CPA matching.
        </p>
      </div>

      {cancellationPending && (
        <div className="flex flex-col gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-bold text-amber-200">Downgrade scheduled</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your {currentTier === "pro" ? "Pro" : "Plus"} plan remains active
              {billingEndDate
                ? ` until ${billingEndDate}. After that, your account will move to Free.`
                : " until the end of the current billing period. After that, your account will move to Free."}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={subscriptionAction !== null}
            onClick={() => updateCancellation("resume")}
          >
            {subscriptionAction === "resume"
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : "Cancel Downgrade"}
          </Button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:mt-8 xl:grid-cols-3">
        <Card className="flex min-w-0 flex-col border-border/50">
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
                  <span className="min-w-0 break-words">{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              className="w-full"
              disabled={currentTier === "free" || cancellationPending || subscriptionAction !== null}
              onClick={() => setDowngradeOpen(true)}
            >
              {currentTier === "free"
                ? "Current Plan"
                : cancellationPending
                  ? "Downgrade Scheduled"
                  : "Downgrade to Free"}
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex min-w-0 flex-col border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Plus</CardTitle>
            <CardDescription>Tax optimization for growing businesses.</CardDescription>
            {currentTier === "plus" && cancellationPending && (
              <p className="text-sm font-semibold text-amber-300">
                Current Plan · Downgrade scheduled
              </p>
            )}
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
                  <span className="min-w-0 break-words">{feature}</span>
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
              {loadingPlan === "plus" ? <Loader2 className="h-4 w-4 animate-spin" /> : currentTier === "plus" ? "Current Plan" : currentTier === "pro" ? "Change to Plus" : "Upgrade to Plus"}
            </Button>
          </CardFooter>
        </Card>

        <Card className="relative flex min-w-0 flex-col overflow-hidden border-primary/50 bg-primary/5 shadow-xl shadow-primary/5 sm:col-span-2 xl:col-span-1">
          <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
            Popular
          </div>
          <CardHeader>
            <CardTitle className="text-2xl text-primary">Pro</CardTitle>
            <CardDescription>The complete financial operating system.</CardDescription>
            {currentTier === "pro" && cancellationPending && (
              <p className="text-sm font-semibold text-amber-300">
                Current Plan · Downgrade scheduled
              </p>
            )}
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
                  <span className={`min-w-0 break-words ${i === 0 ? "font-semibold" : ""}`}>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full" disabled={currentTier === "pro" || loadingPlan !== null} onClick={() => handleUpgrade("pro")}>
              {loadingPlan === "pro" ? <Loader2 className="h-4 w-4 animate-spin" /> : currentTier === "pro" ? "Current Plan" : currentTier === "plus" ? "Change to Pro" : "Upgrade to Pro"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Dialog
        open={downgradeOpen}
        onOpenChange={(open) => {
          if (subscriptionAction === null) setDowngradeOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Downgrade to Free?</DialogTitle>
            <DialogDescription className="pt-2">
              Your {currentTier === "pro" ? "Pro" : "Plus"} plan will remain
              active
              {billingEndDate
                ? ` until ${billingEndDate}.`
                : " until the end of your current billing period."}
              {" "}You will not be charged again after that date, and no
              automatic refund will be issued.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={subscriptionAction !== null}
              onClick={() => setDowngradeOpen(false)}
            >
              Keep My Plan
            </Button>
            <Button
              variant="destructive"
              disabled={subscriptionAction !== null}
              onClick={() => updateCancellation("cancel")}
            >
              {subscriptionAction === "cancel"
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : "Downgrade to Free"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
