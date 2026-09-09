import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name}_missing`); return value; };
const url = required("SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = required("SUPABASE_ANON_KEY");
const api = (process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8082").replace(/\/+$/, "");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const nonce = randomUUID();
const email = `deletion-${nonce}@booksmart-e2e.example.test`;
const password = `Delete-${randomBytes(24).toString("base64url")}!9a`;
let authId = "";
let userId = 0;
let orgId = 0;
let transactionId = 0;
const storagePath = () => `${authId}/account-deletion-${nonce}.txt`;

async function cleanup() {
  const ignore = async (operation: PromiseLike<unknown>) => { try { await operation; } catch { /* best-effort exact fixture cleanup */ } };
  if (authId) {
    await ignore(admin.storage.from("documents").remove([storagePath()]));
    await ignore(admin.from("token_transactions").delete().eq("user_id", authId));
  }
  if (orgId) await ignore(admin.from("organizations").delete().eq("id", orgId));
  if (userId) await ignore(admin.from("users").delete().eq("id", userId));
  if (authId) await ignore(admin.auth.admin.deleteUser(authId));
}

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { role: "user", e2e_synthetic: true, purpose: "account_deletion_acceptance" } });
  if (created.error || !created.data.user) throw new Error("auth_fixture_create_failed");
  authId = created.data.user.id;
  const profile = await admin.from("users").insert({ auth_id: authId, email, role: "user", first_name: "Disposable",
    last_name: "Deletion Test", phone_number: "", token_balance: 0 }).select("id").single();
  if (profile.error) throw new Error("profile_fixture_create_failed");
  userId = Number(profile.data.id);
  const organization = await admin.from("organizations").insert({ owner_id: userId, name: `E2E_DELETE_${nonce}`,
    org_type: "llc", industry: "Test", email, ein_tin: "00-0000000", state: 1, street: "1 Synthetic Way",
    city: "Testville", zip: "00000", phone: "5550000000", website: "https://deletion.example.test" }).select("id").single();
  if (organization.error) throw new Error("organization_fixture_create_failed");
  orgId = Number(organization.data.id);
  const transaction = await admin.from("transactions").insert({ user_id: userId, org_id: orgId, title: "Disposable deletion test",
    amount: -12.34, type: "Business", date_time: new Date().toISOString(), description: "Synthetic", deductible: true, pending: false }).select("id").single();
  if (transaction.error) throw new Error("transaction_fixture_create_failed");
  transactionId = Number(transaction.data.id);
  const upload = await admin.storage.from("documents").upload(storagePath(), Buffer.from("synthetic deletion fixture"), { contentType: "text/plain" });
  if (upload.error) throw new Error("storage_fixture_create_failed");
  const ledger = await admin.from("token_transactions").insert({ user_id: authId, amount: 0, balance_after: 0, type: "spend", status: "posted", use_case: `e2e_delete_${nonce}` });
  if (ledger.error) throw new Error("ledger_fixture_create_failed");

  const login = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await login.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw new Error("fixture_sign_in_failed");
  const token = signedIn.data.session.access_token;
  const response = await fetch(`${api}/api/account`, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, confirmation: "DELETE" }), signal: AbortSignal.timeout(60_000) });
  const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
  if (response.status !== 200 || body.ok !== true) throw new Error(`delete_endpoint_failed_${response.status}_${body.error ?? "unknown"}`);

  const [profileAfter, orgAfter, txAfter, ledgerAfter, filesAfter, authAfter, oldSession] = await Promise.all([
    admin.from("users").select("id", { count: "exact", head: true }).eq("auth_id", authId),
    admin.from("organizations").select("id", { count: "exact", head: true }).eq("id", orgId),
    admin.from("transactions").select("id", { count: "exact", head: true }).eq("id", transactionId),
    admin.from("token_transactions").select("id", { count: "exact", head: true }).eq("user_id", authId),
    admin.storage.from("documents").list(authId, { limit: 100 }),
    admin.auth.admin.getUserById(authId),
    fetch(`${url}/rest/v1/users?select=id&auth_id=eq.${authId}`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } }),
  ]);
  if (profileAfter.count !== 0 || orgAfter.count !== 0 || txAfter.count !== 0 || ledgerAfter.count !== 0) throw new Error("database_cleanup_not_complete");
  if (filesAfter.error || filesAfter.data?.some(file => file.name === storagePath().split("/").at(-1))) throw new Error("storage_cleanup_not_complete");
  if (!authAfter.error || authAfter.data.user) throw new Error("auth_cleanup_not_complete");
  if (![401, 403].includes(oldSession.status)) {
    const visible = await oldSession.json().catch(() => []);
    if (Array.isArray(visible) && visible.length) throw new Error("old_session_retained_access");
  }
  console.log(JSON.stringify({ status: "passed", profileDeleted: true, organizationDeleted: true, transactionDeleted: true,
    ledgerDeleted: true, fileDeleted: true, authDeleted: true, oldSessionDenied: true }));
} catch (error) {
  console.log(JSON.stringify({ status: "failed", stage: error instanceof Error ? error.message : "unknown" }));
  await cleanup();
  process.exitCode = 1;
}
