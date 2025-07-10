import { supabase } from "./supabase";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Calls a plan-limits check endpoint before performing a gated action.
 * Throws a user-facing Error with the server's upgrade message if the
 * limit has been reached; resolves silently if the action is allowed.
 */
async function checkLimit(path: string, body?: Record<string, unknown>): Promise<void> {
  const headers = await authHeader();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message ?? "You've reached your plan's limit. Upgrade your plan to continue.");
  }
}

export function checkAddBusiness(): Promise<void> {
  return checkLimit("/api/plan-limits/check-add-business");
}

export function checkAddTransaction(count = 1): Promise<void> {
  return checkLimit("/api/plan-limits/check-add-transaction", { count });
}
