import { useEffect, useMemo, useState } from "react";
import {
  BarChart2,
  Building2,
  Coins,
  FileText,
  Loader2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type PackageKey = "tokens_starter" | "tokens_growth" | "tokens_business" | "tokens_professional";
type PlanTier = "free" | "plus" | "pro";

type TokenPackage = {
  priceId?: string;
  productId?: string;
  unitAmount: number;
  tokens: number;
  name: string;
};

type Catalog = {
  tokenPackages: Record<PackageKey, TokenPackage>;
};

type TokenStatus = {
  tier: PlanTier;
  tokenBalance: number;
};

type TokenTransaction = {
  id: string | number;
  amount: number;
  balance_after?: number | null;
  type?: string | null;
  status?: string | null;
  use_case?: string | null;
  created_at: string;
};

type PlanUsage = {
  tier: PlanTier;
  limits: {
    aiQuestionsPerMonth: number;
    aiStrategiesPerMonth: number;
    receiptUploadsPerMonth: number;
    statementUploadsPerMonth: number;
    connectedAccountsLimit: number;
    transactionsPerMonth: number;
    businessesLimit: number;
    pdfExport: boolean;
    excelExport: boolean;
    contactCpa: boolean;
    directCpaMessaging: boolean;
  };
  usage: {
    aiQuestions: number;
    aiStrategies: number;
    receiptUploads: number;
    statementUploads: number;
    businesses: number;
    transactions: number;
  };
};

type UnlockCatalog = {
  unlocks: Record<string, TokenUnlock>;
};

type TokenUnlock = {
  key: string;
  label: string;
  tokens: number;
  category: "transactions" | "ocr" | "ai" | "reports" | "cpa" | "funding" | "business";
  quantity?: number;
  durationDays?: number;
};

const FALLBACK_PACKAGES: Record<PackageKey, TokenPackage> = {
  tokens_starter: { name: "10 Tokens", tokens: 10, unitAmount: 1000 },
  tokens_growth: { name: "25 Tokens", tokens: 25, unitAmount: 2500 },
  tokens_business: { name: "50 Tokens", tokens: 50, unitAmount: 5000 },
  tokens_professional: { name: "100 Tokens", tokens: 100, unitAmount: 10000 },
};

const FEATURED_UNLOCK_KEYS = [
  "pl_pdf_export",
  "cash_flow_pdf_export",
  "full_financial_pdf_package",
  "cpa_consultation_request",
];

const CATEGORY_COPY: Record<string, { label: string; description: string; icon: typeof FileText }> = {
  reports: { label: "Report Exports", description: "Use tokens when your plan does not include a requested report export.", icon: BarChart2 },
  cpa: { label: "CPA Requests", description: "Use tokens to submit CPA consultation requests from the CPA Network.", icon: Building2 },
};

async function getAuthToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function fetchJson<T>(path: string, options: RequestInit = {}, fallback: T): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) return fallback;
  return res.json() as Promise<T>;
}

async function fetchStatus() {
  const token = await getAuthToken();
  if (!token) return null;
  return fetchJson<TokenStatus | null>(
    "/api/stripe/status",
    { headers: { Authorization: `Bearer ${token}` } },
    null,
  );
}

async function fetchCatalog() {
  return fetchJson<Catalog>("/api/stripe/catalog", {}, { tokenPackages: FALLBACK_PACKAGES });
}

async function fetchTokenHistory() {
  const { data: authUser } = await supabase.auth.getUser();
  if (!authUser.user) return [];
  const { data } = await supabase
    .from("token_transactions")
    .select("*")
    .eq("user_id", authUser.user.id)
    .order("created_at", { ascending: false })
    .limit(25);
  return (data ?? []) as TokenTransaction[];
}

async function fetchTokenUnlockSummary() {
  const token = await getAuthToken();
  if (!token) return null;
  return fetchJson<{ tokenBalance?: number; monthlyTokenSpend: number; upgradeMessage: string | null } | null>(
    "/api/token-unlocks/summary",
    { headers: { Authorization: `Bearer ${token}` } },
    null,
  );
}

async function fetchUnlockCatalog() {
  return fetchJson<UnlockCatalog>("/api/token-unlocks/catalog", {}, { unlocks: {} });
}

async function fetchPlanUsage() {
  const token = await getAuthToken();
  if (!token) return null;
  return fetchJson<PlanUsage | null>(
    "/api/plan-limits/usage",
    { headers: { Authorization: `Bearer ${token}` } },
    null,
  );
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTokens(value: number) {
  return value.toLocaleString();
}

function formatLimit(value: number) {
  return Number.isFinite(value) ? value.toLocaleString() : "Unlimited";
}

function percent(used: number, limit: number) {
  if (!Number.isFinite(limit)) return 0;
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function historyLabel(tx: TokenTransaction) {
  const useCase = tx.use_case ?? tx.type ?? "Token activity";
  if (useCase.startsWith("unlock:")) {
    return useCase
      .replace("unlock:", "")
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  if (useCase === "purchase") return "Token Purchase";
  if (useCase === "spend") return "Token Spend";
  if (useCase === "bonus") return "Token Bonus";
  return useCase;
}

function historyDay(dateValue: string) {
  const date = new Date(dateValue);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function usageRows(data: PlanUsage | null | undefined) {
  if (!data) return [];
  return [
    { label: "Transactions", used: data.usage.transactions, limit: data.limits.transactionsPerMonth },
    { label: "AI Questions", used: data.usage.aiQuestions, limit: data.limits.aiQuestionsPerMonth },
    { label: "AI Strategies", used: data.usage.aiStrategies, limit: data.limits.aiStrategiesPerMonth },
    { label: "Receipts", used: data.usage.receiptUploads, limit: data.limits.receiptUploadsPerMonth },
    { label: "Statements", used: data.usage.statementUploads, limit: data.limits.statementUploadsPerMonth },
    { label: "Businesses", used: data.usage.businesses, limit: data.limits.businessesLimit },
  ];
}

export default function Token() {
  const queryClient = useQueryClient();
  const [loadingPackage, setLoadingPackage] = useState<PackageKey | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PackageKey>("tokens_professional");
  const [showAllHistory, setShowAllHistory] = useState(false);

  const { data: status } = useQuery({ queryKey: ["stripe_status"], queryFn: fetchStatus });
  const { data: catalog } = useQuery({ queryKey: ["stripe_catalog"], queryFn: fetchCatalog });
  const { data: history = [] } = useQuery({ queryKey: ["token_transactions"], queryFn: fetchTokenHistory });
  const { data: unlockSummary } = useQuery({ queryKey: ["token_unlock_summary"], queryFn: fetchTokenUnlockSummary });
  const { data: unlockCatalog } = useQuery({ queryKey: ["token_unlock_catalog"], queryFn: fetchUnlockCatalog });
  const { data: planUsage } = useQuery({ queryKey: ["plan_limits_usage"], queryFn: fetchPlanUsage });

  const packages = useMemo(() => {
    const source = catalog?.tokenPackages ?? FALLBACK_PACKAGES;
    return (Object.entries(source) as [PackageKey, TokenPackage][])
      .filter(([key]) => key in FALLBACK_PACKAGES)
      .map(([key, value]) => ({ key, ...value }));
  }, [catalog]);

  const tokenBalance = unlockSummary?.tokenBalance ?? status?.tokenBalance ?? 0;
  const tier = planUsage?.tier ?? status?.tier ?? "free";
  const monthlySpend = unlockSummary?.monthlyTokenSpend ?? 0;

  const featuredUnlocks = FEATURED_UNLOCK_KEYS
    .map((key) => unlockCatalog?.unlocks[key])
    .filter((unlock): unlock is TokenUnlock => Boolean(unlock));
  const groupedUnlocks = featuredUnlocks.reduce<Record<string, TokenUnlock[]>>((acc, unlock) => {
    const key = unlock.category;
    acc[key] = [...(acc[key] ?? []), unlock];
    return acc;
  }, {});
  const visibleHistory = showAllHistory ? history : history.slice(0, 6);

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
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.tokensAdded ? `+${data.tokensAdded} tokens added!` : "Tokens added!");
        refreshTokenData();
      } else {
        toast.error(data.error === "payment_not_completed" ? "Payment not completed yet." : data.message ?? "Could not confirm purchase.");
      }
      window.history.replaceState({}, "", window.location.pathname);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshTokenData() {
    queryClient.invalidateQueries({ queryKey: ["stripe_status"] });
    queryClient.invalidateQueries({ queryKey: ["token_transactions"] });
    queryClient.invalidateQueries({ queryKey: ["token_unlock_summary"] });
    queryClient.invalidateQueries({ queryKey: ["plan_limits_usage"] });
  }

  async function handleBuy(packageKey = selectedPackage) {
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        toast.error(data.message ?? data.error ?? "Could not start checkout.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setLoadingPackage(null);
    }
  }

  return (
    <div className="min-h-full bg-background px-3 py-5 text-foreground sm:px-6 sm:py-7">
      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_414px]">
        <main className="space-y-8">
          <section className="grid gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Coins className="h-12 w-12" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Token Wallet</p>
              <h1 className="mt-1 text-3xl font-extrabold">{formatTokens(tokenBalance)} Tokens</h1>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                {tier.toUpperCase()} plan · {formatTokens(monthlySpend)} tokens spent this month
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 px-4 py-3 text-sm">
              <p className="font-bold text-card-foreground">Use tokens when you hit a plan limit.</p>
              <p className="mt-1 text-muted-foreground">Purchases, spends, and admin adjustments appear in activity.</p>
            </div>
          </section>

          {unlockSummary?.upgradeMessage && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 px-5 py-3 text-sm font-semibold text-primary">
              {unlockSummary.upgradeMessage}
            </div>
          )}

          <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-extrabold">Current Token Uses</h2>
                <p className="text-sm font-medium text-muted-foreground">These are the token actions currently wired into active app flows.</p>
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {Object.entries(groupedUnlocks).map(([category, items]) => {
                const meta = CATEGORY_COPY[category] ?? CATEGORY_COPY.reports;
                const Icon = meta.icon;
                return (
                  <div key={category} className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
                    <div className="mb-4 flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-extrabold">{meta.label}</h3>
                        <p className="text-sm font-medium text-muted-foreground">{meta.description}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {items.map((item) => (
                        <div key={item.key} className="flex items-center justify-between gap-4 rounded-lg bg-background/60 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{item.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.durationDays ? `${item.durationDays} days` : item.quantity ? `${item.quantity.toLocaleString()} included` : "One-time unlock"}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-extrabold text-primary">
                            {item.tokens} tokens
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-5">
              <h2 className="text-2xl font-extrabold">Current Plan Usage</h2>
              <p className="text-sm font-medium text-muted-foreground">Live monthly usage from your current subscription limits.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {usageRows(planUsage).map((row) => {
                const pct = percent(row.used, row.limit);
                return (
                  <div key={row.label} className="rounded-lg border border-border bg-card p-4 text-card-foreground">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="font-bold">{row.label}</span>
                      <span className="text-sm font-semibold text-muted-foreground">
                        {row.used.toLocaleString()} / {formatLimit(row.limit)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {!planUsage && (
                <div className="rounded-lg border border-border bg-card p-4 text-sm font-medium text-muted-foreground">
                  Plan usage will appear after the backend responds.
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <h2 className="mb-6 text-2xl font-extrabold">Buy Tokens</h2>
            <div className="space-y-4">
              {packages.map((pkg) => {
                const active = selectedPackage === pkg.key;
                return (
                  <button
                    key={pkg.key}
                    type="button"
                    onClick={() => setSelectedPackage(pkg.key)}
                    className={`block w-full rounded-lg border p-4 text-left transition ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border/60 bg-background/35 hover:border-primary/50 hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-lg font-extrabold">{pkg.tokens.toLocaleString()} Tokens</div>
                        <div className="mt-1 text-sm font-semibold text-muted-foreground">{pkg.name}</div>
                      </div>
                      <div className="text-lg font-extrabold text-primary">{money(pkg.unitAmount)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              disabled={loadingPackage !== null}
              onClick={() => handleBuy()}
              className="mt-7 h-13 w-full rounded-lg bg-primary text-lg font-extrabold text-primary-foreground hover:bg-primary/90"
            >
              {loadingPackage ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                `Buy ${packages.find((pkg) => pkg.key === selectedPackage)?.tokens ?? ""} Tokens`
              )}
            </Button>
          </section>

          <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-extrabold">Token Activity</h2>
              {history.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllHistory((v) => !v)}
                  className="text-sm font-bold text-primary"
                >
                  {showAllHistory ? "Show Less" : "View More"}
                </button>
              )}
            </div>
            {!visibleHistory.length ? (
              <p className="text-sm font-medium text-muted-foreground">No token activity yet.</p>
            ) : (
              <div className="space-y-4">
                {visibleHistory.map((tx) => (
                  <div key={tx.id} className="grid grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                    <div className="font-bold text-card-foreground">{historyDay(tx.created_at)}</div>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-card-foreground">{historyLabel(tx)}</p>
                      {typeof tx.balance_after === "number" && (
                        <p className="text-xs text-muted-foreground">Balance: {formatTokens(tx.balance_after)}</p>
                      )}
                    </div>
                    <div className={`font-extrabold ${tx.amount >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      {tx.amount >= 0 ? "+" : ""}
                      {tx.amount}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-6 text-card-foreground">
            <h2 className="mb-4 text-xl font-extrabold">Included With Plan</h2>
            <div className="space-y-3 text-sm font-medium">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">PDF Export</span>
                <span className={planUsage?.limits.pdfExport ? "text-emerald-500" : "text-muted-foreground"}>
                  {planUsage?.limits.pdfExport ? "Included" : "Not included"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Excel Export</span>
                <span className={planUsage?.limits.excelExport ? "text-emerald-500" : "text-muted-foreground"}>
                  {planUsage?.limits.excelExport ? "Included" : "Not included"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Contact CPA</span>
                <span className={planUsage?.limits.contactCpa ? "text-emerald-500" : "text-muted-foreground"}>
                  {planUsage?.limits.contactCpa ? "Included" : "Not included"}
                </span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
