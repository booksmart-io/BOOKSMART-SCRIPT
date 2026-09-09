import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptPlaidToken } from "./plaid-token-security";
import { decryptToken as decryptQuickBooksToken } from "./quickbooks-oauth";
import { decryptJobberSecret } from "./jobber-oauth";
import { decryptGmailToken } from "./gmail-oauth";
import { normalizeOwnedStoragePath } from "./storage-security";
import { getStripeClient } from "./stripe-client";

type Admin = SupabaseClient<any, any, any>;
type Profile = { id: number; auth_id: string; email: string; role: string; stripe_customer_id?: string | null };
export class AccountDeletionError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}

async function providerFetch(url: string, init: RequestInit) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
}

export async function revokeProviderAccess(admin: Admin, orgIds: number[]) {
  const warnings: string[] = [];
  if (!orgIds.length) return warnings;
  const [plaid, quickbooks, jobber, gmail] = await Promise.all([
    admin.from("plaid_items").select("id,access_token").in("org_id", orgIds),
    admin.from("quickbooks_connections").select("id,refresh_token_encrypted").in("organization_id", orgIds),
    admin.from("jobber_connections").select("id,access_token_encrypted").in("organization_id", orgIds),
    admin.from("gmail_connections").select("id,access_token_encrypted,refresh_token_encrypted").in("organization_id", orgIds),
  ]);
  for (const result of [plaid, quickbooks, jobber, gmail]) if (result.error) throw new AccountDeletionError("integration_cleanup_unavailable");
  const plaidConfig = { id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET };
  for (const item of plaid.data ?? []) {
    if (!item.access_token) continue;
    try {
      if (!plaidConfig.id || !plaidConfig.secret) throw new Error();
      const response = await providerFetch(`${((process.env.PLAID_ENV ?? "sandbox").toLowerCase() === "production" ? "https://production.plaid.com" : (process.env.PLAID_ENV ?? "sandbox").toLowerCase() === "development" ? "https://development.plaid.com" : "https://sandbox.plaid.com")}/item/remove`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: plaidConfig.id, secret: plaidConfig.secret, access_token: decryptPlaidToken(item.access_token) }),
      });
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error_code?: string }; if (!["ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"].includes(body.error_code ?? "")) throw new Error(); }
    } catch { warnings.push("plaid"); }
  }
  for (const connection of quickbooks.data ?? []) {
    const token = connection.refresh_token_encrypted;
    if (!token) continue;
    try {
      const id = process.env.QUICKBOOKS_CLIENT_ID, secret = process.env.QUICKBOOKS_CLIENT_SECRET;
      if (!id || !secret) throw new Error();
      const response = await providerFetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", { method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ token: decryptQuickBooksToken(token) }) });
      if (!response.ok && ![400, 401].includes(response.status)) throw new Error();
    } catch { warnings.push("quickbooks"); }
  }
  for (const connection of jobber.data ?? []) {
    if (!connection.access_token_encrypted) continue;
    try {
      const response = await providerFetch("https://api.getjobber.com/api/graphql", { method: "POST", headers: {
        Authorization: `Bearer ${decryptJobberSecret(connection.access_token_encrypted)}`,
        "X-JOBBER-GRAPHQL-VERSION": process.env.JOBBER_GRAPHQL_VERSION ?? "2025-01-20", "Content-Type": "application/json" },
        body: JSON.stringify({ query: "mutation BookSmartAccountDelete { appDisconnect { userErrors { message } } }" }) });
      const body = await response.json().catch(() => ({})) as any;
      if (!response.ok || body.errors?.length || body.data?.appDisconnect?.userErrors?.length) throw new Error();
    } catch { warnings.push("jobber"); }
  }
  for (const connection of gmail.data ?? []) {
    const encrypted = connection.access_token_encrypted ?? connection.refresh_token_encrypted;
    if (!encrypted) continue;
    try {
      const response = await providerFetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decryptGmailToken(encrypted) }) });
      if (!response.ok && response.status !== 400) throw new Error();
    } catch { warnings.push("gmail"); }
  }
  return [...new Set(warnings)];
}

export async function removeAccountFiles(admin: Admin, authId: string) {
  for (const bucket of ["documents", "chat-attachments", "userImages"]) {
    const folders = [authId];
    const paths: string[] = [];
    for (let i = 0; i < folders.length; i++) {
      if (folders.length > 1000 || paths.length > 10_000) throw new AccountDeletionError("file_cleanup_too_large", 409);
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await admin.storage.from(bucket).list(folders[i], { limit: 100, offset });
        if (error || !data) throw new AccountDeletionError("file_cleanup_unavailable");
        for (const entry of data) {
          const path = `${folders[i]}/${entry.name}`;
          if (!normalizeOwnedStoragePath(path, authId) || entry.name.includes("/")) throw new AccountDeletionError("file_scope_violation");
          if (entry.id) paths.push(path); else folders.push(path);
        }
        if (data.length < 100) break;
      }
    }
    for (let i = 0; i < paths.length; i += 100) {
      const { data, error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error || !data || data.length !== paths.slice(i, i + 100).length) throw new AccountDeletionError("file_cleanup_incomplete");
    }
  }
}

export type AccountDeletionDependencies = {
  revoke?: typeof revokeProviderAccess;
  removeFiles?: typeof removeAccountFiles;
  deleteStripeCustomer?: (customerId: string) => Promise<void>;
  verifyRecentAuth?: (admin: Admin, authId: string) => Promise<void>;
};

export async function verifyRecentAuthentication(admin: Admin, authId: string) {
  const { data, error } = await admin.auth.admin.getUserById(authId);
  const signedIn = data?.user?.last_sign_in_at ? Date.parse(data.user.last_sign_in_at) : NaN;
  if (error || data?.user?.id !== authId || !Number.isFinite(signedIn) || Date.now() - signedIn > 15 * 60_000)
    throw new AccountDeletionError("recent_authentication_required", 401);
}

export async function deleteOwnerAccount(admin: Admin, authId: string, confirmationEmail: unknown, confirmation: unknown, deps: AccountDeletionDependencies = {}) {
  if (confirmation !== "DELETE" || typeof confirmationEmail !== "string") throw new AccountDeletionError("confirmation_required", 400);
  const { data: profile, error } = await admin.from("users").select("id,auth_id,email,role,stripe_customer_id").eq("auth_id", authId).maybeSingle();
  if (error) throw new AccountDeletionError("account_lookup_failed");
  const target = profile as Profile | null;
  if (!target || target.auth_id !== authId || target.role !== "user") throw new AccountDeletionError("account_delete_forbidden", 403);
  if (target.email.trim().toLowerCase() !== confirmationEmail.trim().toLowerCase()) throw new AccountDeletionError("confirmation_mismatch", 400);
  await (deps.verifyRecentAuth ?? verifyRecentAuthentication)(admin, authId);
  const { data: organizations, error: orgError } = await admin.from("organizations").select("id").eq("owner_id", target.id);
  if (orgError || !organizations) throw new AccountDeletionError("account_lookup_failed");
  const orgIds = organizations.map(row => Number(row.id));

  const warnings = await (deps.revoke ?? revokeProviderAccess)(admin, orgIds);
  if (target.stripe_customer_id) {
    await (deps.deleteStripeCustomer ?? (async customerId => {
      const result = await getStripeClient().customers.del(customerId);
      if (!result.deleted) throw new Error("stripe_customer_delete_failed");
    }))(target.stripe_customer_id).catch(() => { throw new AccountDeletionError("billing_cleanup_failed", 409); });
  }
  await (deps.removeFiles ?? removeAccountFiles)(admin, authId);

  // Prevent old sessions from recreating the profile if a later cleanup step fails.
  const { error: banError } = await admin.auth.admin.updateUserById(authId, { ban_duration: "876000h" });
  if (banError) throw new AccountDeletionError("session_lock_failed");
  const { data: deletedUserId, error: deleteError } = await admin.rpc("delete_owner_account_data", { requested_auth_id: authId });
  if (deleteError || Number(deletedUserId) !== target.id) throw new AccountDeletionError("account_cleanup_incomplete", 409);
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(authId);
  if (authDeleteError) throw new AccountDeletionError("identity_cleanup_incomplete", 409);
  return { ok: true as const, providerRevocationWarnings: warnings };
}

export async function deleteCpaAccount(admin: Admin, authId: string, confirmationEmail: unknown, confirmation: unknown, deps: AccountDeletionDependencies = {}) {
  if (confirmation !== "DELETE" || typeof confirmationEmail !== "string") throw new AccountDeletionError("confirmation_required", 400);
  const { data: profile, error } = await admin.from("users").select("id,auth_id,email,role").eq("auth_id", authId).maybeSingle();
  if (error) throw new AccountDeletionError("account_lookup_failed");
  const target = profile as Profile | null;
  if (!target || target.auth_id !== authId || target.role !== "cpa") throw new AccountDeletionError("account_delete_forbidden", 403);
  if (target.email.trim().toLowerCase() !== confirmationEmail.trim().toLowerCase()) throw new AccountDeletionError("confirmation_mismatch", 400);
  await (deps.verifyRecentAuth ?? verifyRecentAuthentication)(admin, authId);
  await (deps.removeFiles ?? removeAccountFiles)(admin, authId);

  // Lock every existing session before removing the access relationships and profile.
  const { error: banError } = await admin.auth.admin.updateUserById(authId, { ban_duration: "876000h" });
  if (banError) throw new AccountDeletionError("session_lock_failed");
  const { data: deletedUserId, error: deleteError } = await admin.rpc("delete_cpa_account_data", { requested_auth_id: authId });
  if (deleteError || Number(deletedUserId) !== target.id) throw new AccountDeletionError("account_cleanup_incomplete", 409);
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(authId);
  if (authDeleteError) throw new AccountDeletionError("identity_cleanup_incomplete", 409);
  return { ok: true as const, providerRevocationWarnings: [] as string[] };
}

export async function deleteSelfAccount(admin: Admin, authId: string, confirmationEmail: unknown, confirmation: unknown, deps: AccountDeletionDependencies = {}) {
  const { data: profile, error } = await admin.from("users").select("role").eq("auth_id", authId).maybeSingle();
  if (error) throw new AccountDeletionError("account_lookup_failed");
  if (profile?.role === "user") return deleteOwnerAccount(admin, authId, confirmationEmail, confirmation, deps);
  if (profile?.role === "cpa") return deleteCpaAccount(admin, authId, confirmationEmail, confirmation, deps);
  throw new AccountDeletionError("account_delete_forbidden", 403);
}
