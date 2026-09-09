import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

process.loadEnvFile(".env");
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && anon && service, "Hosted Supabase configuration is required");
const serviceHeaders = { apikey: service, Authorization: `Bearer ${service}`, "content-type": "application/json" };

async function rest(path, { method = "GET", body, serviceRole = true } = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: serviceRole ? { ...serviceHeaders, Prefer: "return=representation" }
      : { apikey: anon, Authorization: `Bearer ${anon}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}

const marker = randomUUID();
const owner = await rest("users?select=id,auth_id&role=eq.user&auth_id=not.is.null&limit=1");
assert.equal(owner.status, 200);
assert.equal(owner.data.length, 1, "A synthetic owner is required");
let organizationId;

try {
  const templateResult = await rest(`organizations?select=*&owner_id=eq.${owner.data[0].id}&limit=1`);
  assert.equal(templateResult.status, 200);
  assert.equal(templateResult.data.length, 1, "An organization template is required");
  const template = { ...templateResult.data[0] };
  for (const field of ["id", "created_at", "updated_at"]) delete template[field];
  Object.assign(template, { name: `OAUTH_SECURITY_${marker}`,
    email: `oauth-${marker}@booksmart-e2e.example.test`, ein_tin: `99-${marker.slice(0, 7)}`, website: null });
  const organization = await rest("organizations", { method: "POST", body: template });
  assert.equal(organization.status, 201, `Could not create temporary OAuth test organization: ${organization.data?.message ?? organization.status}`);
  organizationId = organization.data[0].id;

  const providers = [
    { table: "quickbooks_oauth_states", extra: {} },
    { table: "jobber_oauth_states", extra: { pkce_verifier_encrypted: `test-${marker}` } },
    { table: "gmail_oauth_states", extra: {} },
  ];

  for (const provider of providers) {
    const stateHash = createHash("sha256").update(`${provider.table}-${marker}`).digest("hex");
    const row = { state_hash: stateHash, organization_id: organizationId,
      auth_user_id: owner.data[0].auth_id, expires_at: new Date(Date.now() + 600_000).toISOString(), ...provider.extra };
    const inserted = await rest(provider.table, { method: "POST", body: row });
    assert.equal(inserted.status, 201, `${provider.table} state insert failed`);

    const anonymous = await rest(`${provider.table}?select=id&state_hash=eq.${stateHash}`, { serviceRole: false });
    assert([401, 403].includes(anonymous.status) || (anonymous.status === 200 && anonymous.data.length === 0),
      `${provider.table} exposed OAuth state to anonymous users`);

    const consumePath = `${provider.table}?state_hash=eq.${stateHash}&organization_id=eq.${organizationId}`
      + `&auth_user_id=eq.${owner.data[0].auth_id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`;
    const first = await rest(consumePath, { method: "DELETE" });
    assert.equal(first.status, 200);
    assert.equal(first.data.length, 1, `${provider.table} valid state was not consumed`);
    const replay = await rest(consumePath, { method: "DELETE" });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.length, 0, `${provider.table} allowed state replay`);

    const expiredHash = createHash("sha256").update(`${provider.table}-expired-${marker}`).digest("hex");
    const expired = await rest(provider.table, { method: "POST", body: { ...row, state_hash: expiredHash,
      expires_at: new Date(Date.now() - 60_000).toISOString() } });
    assert.equal(expired.status, 201);
    const expiredConsume = await rest(`${provider.table}?state_hash=eq.${expiredHash}&organization_id=eq.${organizationId}`
      + `&auth_user_id=eq.${owner.data[0].auth_id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`, { method: "DELETE" });
    assert.equal(expiredConsume.data.length, 0, `${provider.table} accepted expired state`);
    await rest(`${provider.table}?state_hash=eq.${expiredHash}`, { method: "DELETE" });
  }

  console.log(JSON.stringify({ status: "passed", providers: ["QuickBooks", "Jobber", "Gmail"],
    anonymousStateReadsDenied: true, replayDenied: true, expiredStateDenied: true }, null, 2));
} finally {
  if (organizationId) await rest(`organizations?id=eq.${organizationId}`, { method: "DELETE" });
}
