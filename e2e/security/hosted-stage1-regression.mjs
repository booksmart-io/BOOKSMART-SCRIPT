import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

if (typeof process.loadEnvFile === "function") process.loadEnvFile(".env");

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, "Hosted Supabase configuration is required");

function savedSession(slug) {
  const state = JSON.parse(readFileSync(`e2e/.auth/${slug}.json`, "utf8"));
  const entries = state.origins.flatMap(origin => origin.localStorage ?? []);
  const saved = JSON.parse(entries.find(entry => /^sb-.+-auth-token$/.test(entry.name))?.value ?? "null");
  const org = Number(entries.find(entry => entry.name === "booksmart_active_organization_id")?.value);
  assert.equal(saved?.user?.email, `${slug}@booksmart-e2e.example.test`, "Expected synthetic identity");
  assert(saved.refresh_token && Number.isSafeInteger(org) && org > 0, "Invalid synthetic session state");
  return { slug, refreshToken: saved.refresh_token, authId: saved.user.id, org };
}

async function refresh(saved) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: saved.refreshToken }),
  });
  assert.equal(response.status, 200, `Could not refresh ${saved.slug}`);
  const body = await response.json();
  assert.equal(body.user?.id, saved.authId, "Refreshed identity changed");
  return { ...saved, token: body.access_token };
}

async function rest(path, { token, method = "GET", body, count = false } = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: token === serviceKey ? serviceKey : anonKey,
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      Prefer: `${count ? "count=exact," : ""}return=representation`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, range: response.headers.get("content-range") };
}

function rows(result, label) {
  assert.equal(result.status, 200, `${label} request failed`);
  assert(Array.isArray(result.data), `${label} did not return a row array`);
  return result.data;
}

const [a, b] = await Promise.all([
  refresh(savedSession("01-healthy-hvac")),
  refresh(savedSession("02-busy-but-broke-plumbing")),
]);

const findings = [];
for (const [viewer, owner, label] of [[a, b, "A to B"], [b, a, "B to A"]]) {
  const own = rows(await rest(`transactions?select=id&org_id=eq.${viewer.org}&limit=1`, { token: viewer.token }), `${label} own read`);
  assert(own.length > 0, `${label} fixture has no own transaction`);

  const foreignFixture = rows(await rest(`transactions?select=id&org_id=eq.${owner.org}&limit=1`, { token: serviceKey }), `${label} fixture lookup`);
  assert(foreignFixture.length > 0, `${label} fixture has no foreign transaction`);
  const foreignId = foreignFixture[0].id;

  const foreignRead = rows(await rest(`transactions?select=id&id=eq.${foreignId}`, { token: viewer.token }), `${label} foreign read`);
  assert.equal(foreignRead.length, 0, `${label} exposed a foreign transaction`);

  const foreignUpdate = await rest(`transactions?id=eq.${foreignId}`, {
    token: viewer.token, method: "PATCH", body: { title: `blocked-${Date.now()}` }, count: true,
  });
  assert([200, 204].includes(foreignUpdate.status), `${label} foreign update returned an unexpected status`);
  assert.equal(Array.isArray(foreignUpdate.data) ? foreignUpdate.data.length : 0, 0, `${label} updated a foreign transaction`);

  const foreignDelete = await rest(`transactions?id=eq.${foreignId}`, { token: viewer.token, method: "DELETE", count: true });
  assert([200, 204].includes(foreignDelete.status), `${label} foreign delete returned an unexpected status`);
  assert.equal(Array.isArray(foreignDelete.data) ? foreignDelete.data.length : 0, 0, `${label} deleted a foreign transaction`);

  const preserved = rows(await rest(`transactions?select=id&id=eq.${foreignId}`, { token: serviceKey }), `${label} preservation check`);
  assert.equal(preserved.length, 1, `${label} foreign target was not preserved`);
  findings.push({ direction: label, ownRead: true, foreignReadHidden: true, foreignUpdateBlocked: true, foreignDeleteBlocked: true });
}

const anonymous = await rest(`transactions?select=id&limit=1`, { token: anonKey });
assert([401, 403].includes(anonymous.status), "Anonymous transaction read was not denied");

for (const viewer of [a, b]) {
  const protectedProfileWrite = await rest(`users?auth_id=eq.${viewer.authId}`, {
    token: viewer.token, method: "PATCH", body: { role: "admin" }, count: true,
  });
  assert([400, 401, 403].includes(protectedProfileWrite.status), `${viewer.slug} could change its protected role`);
}

console.log(JSON.stringify({
  status: "passed",
  identities: 2,
  directions: findings,
  anonymousReadDenied: true,
  protectedRoleWritesDenied: true,
}, null, 2));

// Exercise authorization and atomic spending with short-lived synthetic rows.
const runId = randomUUID();
const cpaAuthId = randomUUID();
const tokenAuthId = cpaAuthId;
const cpaEmail = `stage1-cpa-${runId}@booksmart-e2e.example.test`;
const password = `Stage1-${randomUUID()}!Aa9`;
let cpaUserId;
let tokenUserId;
let orderId;

async function authAdmin(path, { method = "GET", body } = {}) {
  const response = await fetch(`${url}/auth/v1/admin/${path}`, {
    method,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

try {
  const createdAuth = await authAdmin("users", { method: "POST", body: {
    id: cpaAuthId, email: cpaEmail, password, email_confirm: true,
    user_metadata: { role: "cpa", e2e_synthetic: true },
  } });
  assert([200, 201].includes(createdAuth.status), "Could not create synthetic CPA identity");

  const cpaProfile = await rest("users", { token: serviceKey, method: "POST", body: {
    auth_id: cpaAuthId, email: cpaEmail, role: "cpa", verification_status: "approved",
    first_name: "Stage1", last_name: "Synthetic CPA", phone_number: "", token_balance: 0,
  } });
  assert.equal(cpaProfile.status, 201, "Could not create synthetic CPA profile");
  cpaUserId = cpaProfile.data[0].id;

  const signIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: cpaEmail, password }),
  });
  assert.equal(signIn.status, 200, "Synthetic CPA sign-in failed");
  const cpaToken = (await signIn.json()).access_token;

  const aProfile = rows(await rest(`users?select=id&auth_id=eq.${a.authId}`, { token: serviceKey }), "Company A profile lookup")[0];
  const createdOrder = await rest("orders", { token: a.token, method: "POST", body: {
    user_id: aProfile.id, cpa_id: cpaUserId, title: "Stage 1 isolation check",
    services: ["security-test"], description: "Synthetic and temporary",
    status: "pending", payment_status: "unpaid", amount: 0,
  } });
  assert.equal(createdOrder.status, 201, "Client could not create an authorized CPA request");
  assert.equal(createdOrder.data[0].client_authorized, true, "New client request was not authorized");
  orderId = createdOrder.data[0].id;

  assert.equal(rows(await rest(`orders?select=id&id=eq.${orderId}`, { token: cpaToken }), "Authorized CPA read").length, 1);
  const forged = await rest("orders", { token: cpaToken, method: "POST", body: {
    user_id: aProfile.id, cpa_id: cpaUserId, title: "forged", services: [], description: "forged",
    status: "pending", payment_status: "unpaid", amount: 0,
  } });
  assert([400, 401, 403].includes(forged.status), "CPA could forge its own client authorization");

  const unrelatedAuthorization = await rest("rpc/set_cpa_order_authorization", {
    token: b.token, method: "POST", body: { p_order_id: orderId, p_authorized: true },
  });
  assert([400, 401, 403].includes(unrelatedAuthorization.status), "Unrelated client could authorize another client's order");
  const revoked = await rest("rpc/set_cpa_order_authorization", {
    token: a.token, method: "POST", body: { p_order_id: orderId, p_authorized: false },
  });
  assert([200, 204].includes(revoked.status), "Client could not revoke CPA authorization");
  const revokedOrder = rows(await rest(`orders?select=id,client_authorized&id=eq.${orderId}`, { token: cpaToken }), "Revoked CPA order check");
  assert.equal(revokedOrder.length, 1, "CPA engagement record unexpectedly disappeared");
  assert.equal(revokedOrder[0].client_authorized, false, "CPA authorization flag remained enabled");
  const directFinancialRead = rows(await rest(`transactions?select=id&org_id=eq.${a.org}&limit=1`, { token: cpaToken }), "CPA direct financial read");
  assert.equal(directFinancialRead.length, 0, "CPA gained direct transaction access");

  const tokenProfile = await rest(`users?id=eq.${cpaUserId}`, {
    token: serviceKey, method: "PATCH", body: { token_balance: 30 },
  });
  assert([200, 204].includes(tokenProfile.status), "Could not prepare synthetic token balance");
  tokenUserId = cpaUserId;
  const requestId = randomUUID();
  const spendBody = { p_user_id: tokenAuthId, p_request_id: requestId, p_feature_key: "stage1-hosted-check", p_scope_key: null, p_tokens: 10, p_duration_days: null };
  const firstSpend = await rest("rpc/spend_tokens_atomic", { token: serviceKey, method: "POST", body: spendBody });
  const retrySpend = await rest("rpc/spend_tokens_atomic", { token: serviceKey, method: "POST", body: spendBody });
  assert.equal(firstSpend.status, 200, "Atomic spend failed");
  assert.equal(retrySpend.status, 200, "Atomic spend retry failed");
  assert.deepEqual(retrySpend.data, firstSpend.data, "Atomic spend retry returned a different result");
  const tokenBalance = rows(await rest(`users?select=token_balance&id=eq.${tokenUserId}`, { token: serviceKey }), "Token balance check")[0].token_balance;
  assert.equal(tokenBalance, 20, "Duplicate request deducted tokens more than once");
  const ledger = rows(await rest(`token_transactions?select=id&user_id=eq.${tokenAuthId}`, { token: serviceKey }), "Token ledger check");
  assert.equal(ledger.length, 1, "Duplicate request created more than one ledger entry");

  console.log(JSON.stringify({ status: "passed", cpaAuthorization: true, cpaSelfGrantDenied: true,
    unrelatedAuthorizationDenied: true, revocationEffective: true, atomicSpendRetrySafe: true }, null, 2));
} finally {
  if (orderId) await rest(`orders?id=eq.${orderId}`, { token: serviceKey, method: "DELETE" });
  await rest(`feature_unlocks?user_id=eq.${tokenAuthId}`, { token: serviceKey, method: "DELETE" });
  await rest(`token_transactions?user_id=eq.${tokenAuthId}`, { token: serviceKey, method: "DELETE" });
  if (tokenUserId) await rest(`users?id=eq.${tokenUserId}`, { token: serviceKey, method: "DELETE" });
  if (cpaUserId) await rest(`users?id=eq.${cpaUserId}`, { token: serviceKey, method: "DELETE" });
  await authAdmin(`users/${cpaAuthId}`, { method: "DELETE" });
}
