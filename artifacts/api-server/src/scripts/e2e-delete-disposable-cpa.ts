import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name}_missing`); return value; };
const url = required("SUPABASE_URL"), serviceKey = required("SUPABASE_SERVICE_ROLE_KEY"), anonKey = required("SUPABASE_ANON_KEY");
const api = (process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8082").replace(/\/+$/, "");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const nonce = randomUUID(), password = `Delete-${randomBytes(24).toString("base64url")}!9a`;
const clientEmail = `cpa-delete-client-${nonce}@booksmart-e2e.example.test`;
const cpaEmail = `cpa-delete-${nonce}@booksmart-e2e.example.test`;
let clientAuth = "", cpaAuth = "", clientId = 0, cpaId = 0, orgId = 0, transactionId = 0, orderId = 0;
const cpaFile = () => `${cpaAuth}/cpa-account-deletion-${nonce}.txt`;

async function cleanup() {
  const ignore = async (operation: PromiseLike<unknown>) => { try { await operation; } catch { /* exact disposable cleanup */ } };
  if (cpaAuth) await ignore(admin.storage.from("documents").remove([cpaFile()]));
  if (orderId) await ignore(admin.from("orders").delete().eq("id", orderId));
  if (orgId) await ignore(admin.from("organizations").delete().eq("id", orgId));
  if (cpaId) await ignore(admin.from("users").delete().eq("id", cpaId));
  if (clientId) await ignore(admin.from("users").delete().eq("id", clientId));
  if (cpaAuth) await ignore(admin.auth.admin.deleteUser(cpaAuth));
  if (clientAuth) await ignore(admin.auth.admin.deleteUser(clientAuth));
}

try {
  const clientAuthResult = await admin.auth.admin.createUser({ email: clientEmail, password, email_confirm: true, user_metadata: { role: "user", e2e_synthetic: true } });
  if (clientAuthResult.error || !clientAuthResult.data.user) throw new Error("client_auth_fixture_failed");
  clientAuth = clientAuthResult.data.user.id;
  const cpaAuthResult = await admin.auth.admin.createUser({ email: cpaEmail, password, email_confirm: true, user_metadata: { role: "cpa", e2e_synthetic: true } });
  if (cpaAuthResult.error || !cpaAuthResult.data.user) throw new Error("cpa_auth_fixture_failed");
  cpaAuth = cpaAuthResult.data.user.id;

  const client = await admin.from("users").insert({ auth_id: clientAuth, email: clientEmail, role: "user", first_name: "Disposable", last_name: "Client", phone_number: "", token_balance: 0 }).select("id").single();
  if (client.error) throw new Error("client_profile_fixture_failed"); clientId = Number(client.data.id);
  const cpa = await admin.from("users").insert({ auth_id: cpaAuth, email: cpaEmail, role: "cpa", first_name: "Disposable", last_name: "CPA", phone_number: "", token_balance: 0, verification_status: "approved" }).select("id").single();
  if (cpa.error) throw new Error("cpa_profile_fixture_failed"); cpaId = Number(cpa.data.id);
  const org = await admin.from("organizations").insert({ owner_id: clientId, name: `E2E_CPA_DELETE_${nonce}`, org_type: "llc", industry: "Test", email: clientEmail, ein_tin: "00-0000000", state: 1, street: "1 Synthetic Way", city: "Testville", zip: "00000", phone: "5550000000", website: "https://deletion.example.test" }).select("id").single();
  if (org.error) throw new Error("organization_fixture_failed"); orgId = Number(org.data.id);
  const transaction = await admin.from("transactions").insert({ user_id: clientId, org_id: orgId, title: "Client record must survive CPA deletion", amount: -12.34, type: "Business", date_time: new Date().toISOString(), description: "Synthetic", deductible: true, pending: false }).select("id").single();
  if (transaction.error) throw new Error("transaction_fixture_failed"); transactionId = Number(transaction.data.id);
  const order = await admin.from("orders").insert({ user_id: clientId, cpa_id: cpaId, title: "Disposable CPA engagement", status: "active", payment_status: "paid", amount: 0, client_authorized: true }).select("id").single();
  if (order.error) throw new Error(`order_fixture_failed_${order.error.code ?? "unknown"}`); orderId = Number(order.data.id);
  const upload = await admin.storage.from("documents").upload(cpaFile(), Buffer.from("synthetic CPA deletion fixture"), { contentType: "text/plain" });
  if (upload.error) throw new Error("storage_fixture_failed");

  const login = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await login.auth.signInWithPassword({ email: cpaEmail, password });
  if (signedIn.error || !signedIn.data.session) throw new Error("cpa_sign_in_failed");
  const token = signedIn.data.session.access_token;
  const response = await fetch(`${api}/api/account`, { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: cpaEmail, confirmation: "DELETE" }), signal: AbortSignal.timeout(60_000) });
  const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
  if (response.status !== 200 || body.ok !== true) throw new Error(`delete_endpoint_failed_${response.status}_${body.error ?? "unknown"}`);

  const [cpaAfter, authAfter, filesAfter, orderAfter, clientAfter, orgAfter, transactionAfter, oldSession] = await Promise.all([
    admin.from("users").select("id", { count: "exact", head: true }).eq("id", cpaId), admin.auth.admin.getUserById(cpaAuth),
    admin.storage.from("documents").list(cpaAuth, { limit: 100 }), admin.from("orders").select("id", { count: "exact", head: true }).eq("id", orderId),
    admin.from("users").select("id", { count: "exact", head: true }).eq("id", clientId), admin.from("organizations").select("id", { count: "exact", head: true }).eq("id", orgId),
    admin.from("transactions").select("id", { count: "exact", head: true }).eq("id", transactionId),
    fetch(`${url}/rest/v1/users?select=id&auth_id=eq.${cpaAuth}`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } }),
  ]);
  if (cpaAfter.count !== 0 || !authAfter.error || authAfter.data.user || orderAfter.count !== 0) throw new Error("cpa_cleanup_incomplete");
  if (filesAfter.error || filesAfter.data?.some(file => file.name === cpaFile().split("/").at(-1))) throw new Error("cpa_file_cleanup_incomplete");
  if (clientAfter.count !== 1 || orgAfter.count !== 1 || transactionAfter.count !== 1) throw new Error("client_data_was_changed");
  if (![401, 403].includes(oldSession.status) && (await oldSession.json().catch(() => []) as unknown[]).length) throw new Error("old_cpa_session_retained_access");
  console.log(JSON.stringify({ status: "passed", cpaDeleted: true, engagementDeleted: true, cpaFileDeleted: true, authDeleted: true, oldSessionDenied: true, clientProfilePreserved: true, clientOrganizationPreserved: true, clientTransactionPreserved: true }));
} catch (error) {
  console.log(JSON.stringify({ status: "failed", stage: error instanceof Error ? error.message : "unknown" })); process.exitCode = 1;
} finally { await cleanup(); }
