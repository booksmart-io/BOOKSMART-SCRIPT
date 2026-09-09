import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.loadEnvFile(".env");
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && anon && service, "Hosted Supabase configuration is required");

const authId = randomUUID();
const email = `disabled-session-${authId}@booksmart-e2e.example.test`;
const password = `Role-${randomUUID()}!Aa9`;
const adminHeaders = { apikey: service, Authorization: `Bearer ${service}`, "content-type": "application/json" };
let profileId;

async function authAdmin(path, method, body) {
  return fetch(`${url}/auth/v1/admin/${path}`, {
    method, headers: adminHeaders, body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function profileRead(token) {
  return fetch(`${url}/rest/v1/users?select=id&auth_id=eq.${authId}`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
}

try {
  const createAuth = await authAdmin("users", "POST", {
    id: authId, email, password, email_confirm: true, user_metadata: { role: "user", e2e_synthetic: true },
  });
  assert([200, 201].includes(createAuth.status), "Could not create synthetic identity");

  const createProfile = await fetch(`${url}/rest/v1/users`, {
    method: "POST", headers: { ...adminHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ auth_id: authId, email, role: "user", first_name: "Disabled", last_name: "Session Test", phone_number: "", token_balance: 0 }),
  });
  assert.equal(createProfile.status, 201, "Could not create synthetic profile");
  profileId = (await createProfile.json())[0].id;

  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200, "Synthetic sign-in failed");
  const token = (await login.json()).access_token;
  assert.equal((await profileRead(token)).status, 200, "Active session could not read its profile");

  const disable = await authAdmin(`users/${authId}`, "PUT", { ban_duration: "876000h" });
  assert.equal(disable.status, 200, "Could not disable synthetic identity");
  const disabledRead = await profileRead(token);
  const disabledRows = disabledRead.ok ? await disabledRead.json() : null;
  assert.equal(disabledRead.status, 200, "Disabled-session request returned an unexpected status");
  assert.equal(disabledRows.length, 0, "Disabled session retained profile access");

  const remove = await authAdmin(`users/${authId}`, "DELETE");
  assert.equal(remove.status, 200, "Could not remove synthetic identity");
  const removedRead = await profileRead(token);
  const removedRows = removedRead.ok ? await removedRead.json() : null;
  assert.equal(removedRead.status, 200, "Removed-session request returned an unexpected status");
  assert.equal(removedRows.length, 0, "Removed session retained profile access");

  console.log(JSON.stringify({
    disabledSessionStatus: disabledRead.status,
    disabledSessionRows: disabledRows.length,
    removedSessionStatus: removedRead.status,
    removedSessionRows: removedRows.length,
  }, null, 2));
} finally {
  if (profileId) await fetch(`${url}/rest/v1/users?id=eq.${profileId}`, { method: "DELETE", headers: adminHeaders });
  await authAdmin(`users/${authId}`, "DELETE");
}
