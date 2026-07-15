import { supabase } from "./supabase";

export type TokenUnlockKey =
  | "ai_tax_strategy_deep_dive"
  | "credit_score_boost"
  | "loan_readiness_simulation"
  | "cpa_quick_review"
  | "revenue_growth_forecast"
  | "double_xp_boost"
  | "streak_shield_7_day"
  | "pl_pdf_export"
  | "cash_flow_pdf_export"
  | "full_financial_pdf_package"
  | "cpa_contact"
  | "cpa_consultation_request";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function spendTokensForUnlock(featureKey: TokenUnlockKey, scopeKey?: string) {
  const headers = await authHeaders();
  const res = await fetch("/api/token-unlocks/spend", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ featureKey, scopeKey }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message ?? data?.error ?? "Could not unlock this feature with tokens.");
  }
  return data as {
    status: "unlocked" | "already_unlocked";
    tokenBalance: number | null;
    monthlyTokenSpend: number;
    upgradeMessage: string | null;
    config?: { label: string; tokens: number };
  };
}
