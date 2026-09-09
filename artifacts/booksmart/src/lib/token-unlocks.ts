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
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error("Sign in to unlock this feature.");
  // Preserve the logical request across network failures, retries and page reloads.
  const retryStorageKey = JSON.stringify(["token-spend", sessionData.session.user.id, featureKey, scopeKey ?? null]);
  const requestId = sessionStorage.getItem(retryStorageKey) ?? crypto.randomUUID();
  sessionStorage.setItem(retryStorageKey, requestId);
  const headers = await authHeaders();
  const res = await fetch("/api/token-unlocks/spend", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ featureKey, scopeKey, requestId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) sessionStorage.removeItem(retryStorageKey);
    throw new Error(data?.message ?? data?.error ?? "Could not unlock this feature with tokens.");
  }
  sessionStorage.removeItem(retryStorageKey);
  return data as {
    status: "unlocked" | "already_unlocked";
    tokenBalance: number | null;
    monthlyTokenSpend: number;
    upgradeMessage: string | null;
    config?: { label: string; tokens: number };
  };
}
