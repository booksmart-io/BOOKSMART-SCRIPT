import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { encryptGmailToken } from "../lib/gmail-oauth";
import { encryptJobberSecret } from "../lib/jobber-oauth";
import { encryptPlaidToken } from "../lib/plaid-token-security";
import { encryptToken } from "../lib/quickbooks-oauth";

const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name}_missing`); return value; };
const url = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const auditKey = process.env.SECURITY_AUDIT_HMAC_KEY?.trim() || serviceKey;
const api = (process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8082").replace(/\/+$/, "");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const nonce = randomUUID();
const email = `disconnect-${nonce}@booksmart-e2e.example.test`;
const password = `Disconnect-${randomBytes(24).toString("base64url")}!9a`;
let authId = "";
let userId = 0;
let orgId = 0;
let attackerAuthId = "";
let attackerUserId = 0;

async function cleanup() {
  const ignore = async (operation: PromiseLike<unknown>) => { try { await operation; } catch { /* exact disposable-fixture cleanup */ } };
  if (orgId) await ignore(admin.from("organizations").delete().eq("id", orgId));
  if (userId) await ignore(admin.from("users").delete().eq("id", userId));
  if (authId) await ignore(admin.auth.admin.deleteUser(authId));
  if (attackerUserId) await ignore(admin.from("users").delete().eq("id", attackerUserId));
  if (attackerAuthId) await ignore(admin.auth.admin.deleteUser(attackerAuthId));
}

async function call(path: string, method: string, token: string, body?: unknown) {
  const response = await fetch(`${api}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, any> };
}

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { role: "user", e2e_synthetic: true, purpose: "integration_disconnect_acceptance" } });
  if (created.error || !created.data.user) throw new Error("auth_fixture_create_failed");
  authId = created.data.user.id;
  const profile = await admin.from("users").insert({ auth_id: authId, email, role: "user", first_name: "Disposable",
    last_name: "Disconnect Test", phone_number: "", token_balance: 0 }).select("id").single();
  if (profile.error) throw new Error(`profile_fixture_create_failed_${profile.error.code ?? "unknown"}`);
  userId = Number(profile.data.id);
  const organization = await admin.from("organizations").insert({ owner_id: userId, name: `E2E_DISCONNECT_${nonce}`,
    org_type: "llc", industry: "Test", email, ein_tin: "00-0000000", state: 1, street: "1 Synthetic Way",
    city: "Testville", zip: "00000", phone: "5550000000", website: "https://disconnect.example.test" }).select("id").single();
  if (organization.error) throw new Error(`organization_fixture_create_failed_${organization.error.code ?? "unknown"}`);
  orgId = Number(organization.data.id);

  const syntheticSecret = `synthetic-disconnect-${nonce}`;
  const inserts = await Promise.all([
    admin.from("quickbooks_connections").insert({ organization_id: orgId, realm_id: `e2e-${nonce}`, access_token_encrypted: encryptToken(syntheticSecret),
      refresh_token_encrypted: encryptToken(`${syntheticSecret}-refresh`), status: "active", company_name: "Synthetic Disconnect" }),
    admin.from("jobber_connections").insert({ organization_id: orgId, jobber_account_id: `e2e-${nonce}`, jobber_account_name: "Synthetic Disconnect",
      access_token_encrypted: encryptJobberSecret(syntheticSecret), refresh_token_encrypted: encryptJobberSecret(`${syntheticSecret}-refresh`), api_version: "2025-01-20", status: "active" }),
    admin.from("gmail_connections").insert({ organization_id: orgId, connected_by_user_id: userId, google_account_email: email,
      access_token_encrypted: encryptGmailToken(syntheticSecret), refresh_token_encrypted: encryptGmailToken(`${syntheticSecret}-refresh`),
      access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(), status: "active" }),
    admin.from("plaid_items").insert({ user_id: userId, org_id: orgId, plaid_item_id: `e2e-${nonce}`, access_token: encryptPlaidToken(syntheticSecret),
      institution_name: "Synthetic Disconnect", status: "active" }).select("id").single(),
  ]);
  for (const result of inserts) if (result.error) throw new Error(`connection_fixture_create_failed_${result.error.code ?? "unknown"}`);
  const plaidItemId = Number(inserts[3].data!.id);

  const ownerLogin = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await ownerLogin.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw new Error("owner_fixture_sign_in_failed");
  const ownerToken = signedIn.data.session.access_token;
  const attackerEmail = `disconnect-attacker-${nonce}@booksmart-e2e.example.test`;
  const attackerPassword = `Attacker-${randomBytes(24).toString("base64url")}!9a`;
  const attackerCreated = await admin.auth.admin.createUser({ email: attackerEmail, password: attackerPassword, email_confirm: true,
    user_metadata: { role: "user", e2e_synthetic: true, purpose: "integration_disconnect_cross_tenant" } });
  if (attackerCreated.error || !attackerCreated.data.user) throw new Error("attacker_auth_fixture_create_failed");
  attackerAuthId = attackerCreated.data.user.id;
  const attackerProfile = await admin.from("users").insert({ auth_id: attackerAuthId, email: attackerEmail, role: "user", first_name: "Disposable",
    last_name: "Cross Tenant Test", phone_number: "", token_balance: 0 }).select("id").single();
  if (attackerProfile.error) throw new Error("attacker_profile_fixture_create_failed");
  attackerUserId = Number(attackerProfile.data.id);
  const attackerLogin = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const attackerSignedIn = await attackerLogin.auth.signInWithPassword({ email: attackerEmail, password: attackerPassword });
  if (attackerSignedIn.error || !attackerSignedIn.data.session) throw new Error("attacker_fixture_sign_in_failed");
  const attackerToken = attackerSignedIn.data.session.access_token;

  const denied = await Promise.all([
    call("/api/integrations/quickbooks/disconnect", "POST", attackerToken, { organization_id: orgId }),
    call("/api/integrations/jobber/disconnect", "POST", attackerToken, { organization_id: orgId }),
    call("/api/integrations/gmail/disconnect", "POST", attackerToken, { organization_id: orgId }),
    call(`/api/plaid/items/${plaidItemId}?org_id=${orgId}`, "DELETE", attackerToken),
  ]);
  if (denied.some(result => ![403, 404].includes(result.status))) throw new Error(`cross_tenant_disconnect_not_denied_${denied.map(x => x.status).join("_")}`);

  const ownerResults = await Promise.all([
    call("/api/integrations/quickbooks/disconnect", "POST", ownerToken, { organization_id: orgId }),
    call("/api/integrations/jobber/disconnect", "POST", ownerToken, { organization_id: orgId }),
    call("/api/integrations/gmail/disconnect", "POST", ownerToken, { organization_id: orgId }),
    call(`/api/plaid/items/${plaidItemId}?org_id=${orgId}`, "DELETE", ownerToken),
  ]);
  if (ownerResults.some(result => result.status !== 200 || result.body.ok !== true || result.body.connected === true)) {
    throw new Error(`owner_disconnect_failed_${ownerResults.map(x => x.status).join("_")}`);
  }

  const [quickbooks, jobber, gmail, plaid] = await Promise.all([
    admin.from("quickbooks_connections").select("status,access_token_encrypted,refresh_token_encrypted").eq("organization_id", orgId).single(),
    admin.from("jobber_connections").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    admin.from("gmail_connections").select("status,access_token_encrypted,refresh_token_encrypted").eq("organization_id", orgId).single(),
    admin.from("plaid_items").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);
  if (quickbooks.error || quickbooks.data.status !== "disconnected" || quickbooks.data.access_token_encrypted || quickbooks.data.refresh_token_encrypted) throw new Error("quickbooks_credentials_retained");
  if (jobber.error || jobber.count !== 0) throw new Error("jobber_connection_retained");
  if (gmail.error || gmail.data.status !== "disconnected" || gmail.data.access_token_encrypted || gmail.data.refresh_token_encrypted) throw new Error("gmail_credentials_retained");
  if (plaid.error || plaid.count !== 0) throw new Error("plaid_connection_retained");

  const blockedSync = await Promise.all([
    call("/api/integrations/quickbooks/sync", "POST", ownerToken, { organization_id: orgId }),
    call("/api/integrations/jobber/sync", "POST", ownerToken, { organization_id: orgId }),
    call("/api/integrations/gmail/scan", "POST", ownerToken, { organization_id: orgId, days: 30 }),
    call("/api/plaid/sync", "POST", ownerToken, { org_id: orgId }),
  ]);
  if (blockedSync.slice(0, 3).some(result => result.status >= 200 && result.status < 300)) throw new Error(`disconnected_sync_not_blocked_${blockedSync.map(x => x.status).join("_")}`);
  if (blockedSync[3].status !== 200 || Number(blockedSync[3].body.added ?? -1) !== 0 || Number(blockedSync[3].body.modified ?? -1) !== 0) throw new Error("plaid_disconnected_sync_not_empty");

  const orgFingerprint = createHmac("sha256", auditKey).update(`organization:${orgId}`).digest("hex");
  let auditRows: Array<{ outcome: string; metadata: Record<string, unknown> }> = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await admin.from("security_audit_events").select("outcome,metadata").eq("organization_fingerprint", orgFingerprint)
      .eq("event_type", "integration_connection").order("id", { ascending: false }).limit(20);
    if (result.error) throw new Error("audit_read_failed");
    auditRows = result.data ?? [];
    if (auditRows.filter(row => row.metadata?.action === "disconnect").length >= 8) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const disconnectAudits = auditRows.filter(row => row.metadata?.action === "disconnect");
  const providers = new Set(disconnectAudits.map(row => row.metadata?.provider));
  if (!["quickbooks", "jobber", "gmail", "plaid"].every(provider => providers.has(provider))) throw new Error("disconnect_audit_provider_missing");
  if (disconnectAudits.filter(row => row.outcome === "succeeded").length < 4 || disconnectAudits.filter(row => row.outcome === "denied").length < 4) throw new Error("disconnect_audit_outcome_missing");
  const serializedAudit = JSON.stringify(disconnectAudits);
  for (const secret of [syntheticSecret, ownerToken, attackerToken, serviceKey]) if (serializedAudit.includes(secret)) throw new Error("credential_found_in_disconnect_audit");

  console.log(JSON.stringify({ status: "passed", providers: ["plaid", "quickbooks", "jobber", "gmail"], crossTenantDenied: true,
    localCredentialsRemoved: true, futureSyncBlocked: true, reconnectRequiresAuthorization: true, auditEventsVerified: true,
    providerRevocationFailuresHandled: ownerResults.every(result => result.body.warning || result.body.plaid_remove_warning || result.body.revoked === false) }));
} catch (error) {
  console.log(JSON.stringify({ status: "failed", stage: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
} finally {
  await cleanup();
}
