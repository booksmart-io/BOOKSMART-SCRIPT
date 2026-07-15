import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  Coins,
  FileText,
  Gauge,
  Loader2,
  Lock,
  Shield,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { TokenUnlockKey } from "@/lib/token-unlocks";

type PackageKey = "tokens_starter" | "tokens_growth" | "tokens_business" | "tokens_professional";

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
  tier: "free" | "plus" | "pro";
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

type StoreItem = {
  key: TokenUnlockKey;
  title: string;
  description: string;
  tokens: number;
  button: string;
  icon: typeof FileText;
  rewardText?: string;
};

const FALLBACK_PACKAGES: Record<PackageKey, TokenPackage> = {
  tokens_starter: { name: "10 Tokens", tokens: 10, unitAmount: 1000 },
  tokens_growth: { name: "25 Tokens", tokens: 25, unitAmount: 2500 },
  tokens_business: { name: "50 Tokens", tokens: 50, unitAmount: 5000 },
  tokens_professional: { name: "100 Tokens", tokens: 100, unitAmount: 10000 },
};

const PACKAGE_BONUSES: Record<PackageKey, number> = {
  tokens_starter: 20,
  tokens_growth: 75,
  tokens_business: 200,
  tokens_professional: 500,
};

const STORE_ITEMS: StoreItem[] = [
  {
    key: "ai_tax_strategy_deep_dive",
    title: "AI Tax Strategy Deep Dive",
    description: "Personalized 3 scenario tax optimization model",
    tokens: 150,
    button: "UNLOCK STRATEGY",
    icon: FileText,
  },
  {
    key: "credit_score_boost",
    title: "Credit Score Boost",
    description: "Step-by-step utilization restructuring plan",
    tokens: 120,
    button: "ACTIVATE PLAN",
    icon: Gauge,
  },
  {
    key: "ai_tax_strategy_deep_dive",
    title: "AI Tax Strategy Deep Dive",
    description: "Personalized 3 scenario tax optimization model",
    tokens: 150,
    button: "UNLOCK STRATEGY",
    icon: FileText,
    rewardText: "+150 Tokens",
  },
  {
    key: "loan_readiness_simulation",
    title: "Loan Readiness Simulation",
    description: "See approval odds before applying",
    tokens: 200,
    button: "RUN SIMULATION",
    icon: Building2,
  },
  {
    key: "cpa_quick_review",
    title: "CPA Quick Review",
    description: "AI pre review of books before CPA meeting",
    tokens: 180,
    button: "GENERATE REVIEW",
    icon: FileText,
    rewardText: "+180 Tokens",
  },
  {
    key: "revenue_growth_forecast",
    title: "Revenue Growth Forecast",
    description: "12 month revenue projection model",
    tokens: 220,
    button: "SCAN NOW",
    icon: TrendingUp,
  },
];

const BOOSTS: StoreItem[] = [
  {
    key: "double_xp_boost",
    title: "Double XP Boost + 80 Tokens",
    description: "Double XP on missions for 24 hours.",
    tokens: 80,
    button: "80 TOKENS",
    icon: Zap,
  },
  {
    key: "streak_shield_7_day",
    title: "7 Day Streak Shield + 60 Tokens",
    description: "Protect streak if you miss one day.",
    tokens: 60,
    button: "60 TOKENS",
    icon: Shield,
  },
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
  return res.json() as Promise<TokenStatus>;
}

async function fetchCatalog() {
  const res = await fetch("/api/stripe/catalog");
  if (!res.ok) return { tokenPackages: FALLBACK_PACKAGES } as Catalog;
  return res.json() as Promise<Catalog>;
}

async function fetchTokenHistory() {
  const { data: authUser } = await supabase.auth.getUser();
  if (!authUser.user) return [];
  const { data } = await supabase
    .from("token_transactions")
    .select("*")
    .eq("user_id", authUser.user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []) as TokenTransaction[];
}

async function fetchTokenUnlockSummary() {
  const token = await getAuthToken();
  if (!token) return null;
  const res = await fetch("/api/token-unlocks/summary", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ monthlyTokenSpend: number; upgradeMessage: string | null }>;
}

function money(cents: number) {
  return `$ ${Math.round(cents / 100).toLocaleString()}`;
}

function formatTokens(value: number) {
  return value.toLocaleString();
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

function activityStreak(history: TokenTransaction[]) {
  const days = new Set(history.map((tx) => new Date(tx.created_at).toDateString()));
  return Math.max(1, Math.min(5, days.size));
}

function StoreCard({
  item,
}: {
  item: StoreItem;
}) {
  const Icon = item.icon;

  return (
    <div className="relative flex min-h-[176px] flex-col rounded-lg border border-[#1d4b82] bg-[#102d51] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
      {item.rewardText && <div className="absolute right-5 top-5 text-sm font-bold text-[#ffc41e]">{item.rewardText}</div>}
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#1b426f] text-[#6da8ff]">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 pr-8">
          <h3 className="text-base font-bold leading-tight text-white">{item.title}</h3>
          <p className="mt-1 text-sm font-medium text-white/90">{item.description}</p>
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-4 pt-8">
        <div className="flex items-center gap-2 text-base font-bold text-white">
          <Coins className="h-4 w-4 fill-[#ffc41e] text-[#ffc41e]" />
          {item.tokens} Tokens
        </div>
        <Button
          type="button"
          variant="outline"
          disabled
          className="h-10 min-w-[154px] rounded-lg border-[#ffc41e]/40 bg-transparent px-5 text-sm font-extrabold text-[#ffc41e]/50 opacity-70"
        >
          {item.button}
        </Button>
      </div>
    </div>
  );
}

export default function Token() {
  const queryClient = useQueryClient();
  const [loadingPackage, setLoadingPackage] = useState<PackageKey | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PackageKey>("tokens_professional");

  const { data: status } = useQuery({ queryKey: ["stripe_status"], queryFn: fetchStatus });
  const { data: catalog } = useQuery({ queryKey: ["stripe_catalog"], queryFn: fetchCatalog });
  const { data: history = [] } = useQuery({ queryKey: ["token_transactions"], queryFn: fetchTokenHistory });
  const { data: unlockSummary } = useQuery({ queryKey: ["token_unlock_summary"], queryFn: fetchTokenUnlockSummary });

  const packages = useMemo(() => {
    const source = catalog?.tokenPackages ?? FALLBACK_PACKAGES;
    return (Object.entries(source) as [PackageKey, TokenPackage][])
      .filter(([key]) => key in FALLBACK_PACKAGES)
      .map(([key, value]) => ({ key, ...value }));
  }, [catalog]);

  const tokenBalance = status?.tokenBalance ?? 0;
  const streak = activityStreak(history);
  const xp = Math.max(0, tokenBalance * 20 + (unlockSummary?.monthlyTokenSpend ?? 0) * 10);

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
      const data = await res.json();
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
    <div className="min-h-full bg-[#05182d] px-3 py-5 text-white sm:px-6 sm:py-7">
      <div className="mb-6 flex flex-wrap justify-start gap-3 sm:mb-10 sm:justify-end sm:gap-4">
        <button className="flex h-10 items-center gap-2 rounded-full bg-[#102d51] px-4 text-base font-bold text-white">
          <Coins className="h-5 w-5 fill-[#ffc41e] text-[#ffc41e]" />
          {formatTokens(tokenBalance)}
          <ChevronDown className="h-4 w-4 text-white/60" />
        </button>
        <button className="flex h-10 items-center gap-2 rounded-full bg-[#102d51] px-4 text-base font-bold text-white">
          <ShieldCheck className="h-5 w-5 text-[#5cf0a7]" />
          {formatTokens(xp)}
          <span className="text-[#ff9f19]">🔥</span>
          <span className="text-sm text-white/80">{streak} Days</span>
          <ChevronDown className="h-4 w-4 text-white/60" />
        </button>
      </div>

      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_414px]">
        <main className="space-y-8">
          <section className="flex min-h-[130px] flex-col items-start gap-4 rounded-lg bg-[#102d51] px-5 py-5 sm:flex-row sm:items-center sm:px-8 sm:py-0">
            <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full bg-[#344b4c] text-[#ffc83d] sm:h-[74px] sm:w-[74px]">
              <Coins className="h-11 w-11" />
            </div>
            <div className="min-w-0 sm:ml-7">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Token Wallet</h1>
              <div className="mt-1 flex items-center gap-2 text-xl font-bold text-white">
                <span className="text-[#ffae00]">🔥</span>
                {formatTokens(tokenBalance)}
                <span className="font-medium text-white/70">Tokens</span>
              </div>
            </div>
          </section>

          {unlockSummary?.upgradeMessage && (
            <div className="rounded-lg border border-[#ffc41e]/40 bg-[#ffc41e]/10 px-5 py-3 text-sm font-semibold text-[#ffc41e]">
              {unlockSummary.upgradeMessage}
            </div>
          )}

          <section>
            <h2 className="mb-5 text-2xl font-extrabold">Premium Strategy Store</h2>
            <div className="grid gap-5 lg:grid-cols-2">
              {STORE_ITEMS.slice(0, 2).map((item) => (
                <StoreCard
                  key={`${item.key}-${item.button}-top`}
                  item={item}
                />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-5 text-2xl font-extrabold">Premium Strategy Store</h2>
            <div className="grid gap-5 lg:grid-cols-2">
              {STORE_ITEMS.slice(2).map((item) => (
                <StoreCard
                  key={`${item.key}-${item.button}-more`}
                  item={item}
                />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-5 text-2xl font-extrabold">Power Boosts</h2>
            <div className="grid gap-5 lg:grid-cols-2">
              {BOOSTS.map((item) => (
                <StoreCard
                  key={item.key}
                  item={item}
                />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-5 text-2xl font-extrabold">Exclusive Level Unlocks</h2>
            <div className="flex h-[72px] items-center justify-center rounded-lg bg-[#102d51] text-base font-semibold text-white/45">
              <Lock className="mr-4 h-5 w-5" />
              Reach Level 10 to unlock exclusive strategies
            </div>
          </section>
        </main>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-lg bg-[#102d51] p-6">
            <h2 className="mb-6 text-2xl font-extrabold">Buy More Tokens</h2>
            <div className="space-y-5">
              {packages.map((pkg, index) => {
                const active = selectedPackage === pkg.key;
                const percent = 32 + index * 18;
                return (
                  <button
                    key={pkg.key}
                    type="button"
                    onClick={() => setSelectedPackage(pkg.key)}
                    className={`block w-full rounded-lg border p-3 text-left transition ${
                      active
                        ? "border-[#ffc41e] bg-[#173b66]"
                        : "border-transparent hover:border-[#ffc41e]/50 hover:bg-[#17365c]"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <div className="text-lg font-extrabold">{pkg.tokens.toLocaleString()} Tokens</div>
                      <div className="text-sm font-extrabold text-[#ffc41e]">+ {PACKAGE_BONUSES[pkg.key]} Tokens</div>
                    </div>
                    <div className="mb-2 text-base font-bold">{money(pkg.unitAmount)}</div>
                    <div className="h-1.5 rounded-full bg-white/25">
                      <div
                        className={`h-full rounded-full ${active ? "bg-[#ffc41e]" : "bg-[#ffb800]"}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              disabled={loadingPackage !== null}
              onClick={() => handleBuy()}
              className="mt-9 h-14 w-full rounded-lg border border-[#ffc41e] bg-transparent text-lg font-extrabold text-[#ffc41e] hover:bg-[#ffc41e] hover:text-[#06172d]"
            >
              {loadingPackage ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                `Buy ${packages.find((pkg) => pkg.key === selectedPackage)?.tokens ?? ""} Tokens`
              )}
            </Button>
          </section>

          <section className="rounded-lg bg-[#102d51] p-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold">Token History</h2>
              <button className="text-sm font-bold text-white">View More &gt;</button>
            </div>
            {!history.length ? (
              <p className="text-sm font-medium text-white/65">No token activity yet.</p>
            ) : (
              <div className="space-y-5">
                {history.slice(0, 4).map((tx) => (
                  <div key={tx.id} className="grid grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                    <div className="font-bold text-white">{historyDay(tx.created_at)}</div>
                    <div className="truncate font-bold text-white">{historyLabel(tx)}</div>
                    <div className={`font-extrabold ${tx.amount >= 0 ? "text-[#42d678]" : "text-[#ff5656]"}`}>
                      {tx.amount >= 0 ? "+" : ""}
                      {tx.amount}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {history.length > 4 && (
              <button className="mt-8 flex w-full items-center justify-center gap-2 text-base font-bold text-white">
                View More
                <ArrowUpRight className="h-4 w-4" />
              </button>
            )}
          </section>

          <section className="rounded-lg bg-[#102d51] p-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold">Token History</h2>
              <button className="text-sm font-bold text-white">View More &gt;</button>
            </div>
            <div className="space-y-5">
              {history.slice(0, 2).map((tx) => (
                <div key={`mini-${tx.id}`} className="grid grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                  <div className="font-bold text-white">{historyDay(tx.created_at)}</div>
                  <div className="truncate font-bold text-white">{historyLabel(tx)}</div>
                  <div className={`font-extrabold ${tx.amount >= 0 ? "text-[#42d678]" : "text-[#ff5656]"}`}>
                    {tx.amount >= 0 ? "+" : ""}
                    {tx.amount}
                  </div>
                </div>
              ))}
              {!history.length && <p className="text-sm font-medium text-white/65">Activity will appear after purchases or unlocks.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
