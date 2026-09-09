import { randomBytes, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import app from "../app";

const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name}_missing`); return value; };
const url = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const nonce = randomUUID();
const LARGE_TRANSACTION_COUNT = Number(process.env.E2E_LOAD_TRANSACTION_COUNT ?? 2500);
const thresholds = { healthP95Ms: 250, authenticatedP95Ms: 5000, largeExportMs: 60_000, concurrentExportMs: 90_000, rejectionMs: 5000, rssGrowthMiB: 256 };
type Fixture = { authId: string; userId: number; orgId: number; token: string; email: string };
const fixtures: Fixture[] = [];

const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] ?? 0;
const timedFetch = async (input: string, init?: RequestInit) => { const started = performance.now(); const response = await fetch(input, init); return { response, ms: performance.now() - started }; };

async function makeFixture(index: number, transactionCount: number): Promise<Fixture> {
  const email = `load-${index}-${nonce}@booksmart-e2e.example.test`;
  const password = `Load-${randomBytes(24).toString("base64url")}!9a`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { role: "user", e2e_synthetic: true, purpose: "performance_load_acceptance" } });
  if (created.error || !created.data.user) throw new Error(`auth_fixture_${index}_failed`);
  const authId = created.data.user.id;
  const profile = await admin.from("users").insert({ auth_id: authId, email, role: "user", first_name: "Disposable",
    last_name: `Load ${index}`, phone_number: "", token_balance: 0 }).select("id").single();
  if (profile.error) throw new Error(`profile_fixture_${index}_failed`);
  const userId = Number(profile.data.id);
  const organization = await admin.from("organizations").insert({ owner_id: userId, name: `E2E_LOAD_${index}_${nonce}`,
    org_type: "llc", industry: "Test", email, ein_tin: "00-0000000", state: 1, street: "1 Synthetic Way",
    city: "Testville", zip: "00000", phone: "5550000000", website: "https://load.example.test" }).select("id").single();
  if (organization.error) throw new Error(`organization_fixture_${index}_failed`);
  const orgId = Number(organization.data.id);
  const login = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await login.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw new Error(`login_fixture_${index}_failed`);
  const fixture = { authId, userId, orgId, token: signedIn.data.session.access_token, email };
  fixtures.push(fixture);
  for (let offset = 0; offset < transactionCount; offset += 500) {
    const rows = Array.from({ length: Math.min(500, transactionCount - offset) }, (_, row) => ({ user_id: userId, org_id: orgId,
      title: `Synthetic load transaction ${offset + row + 1}`, amount: -((offset + row) % 1000) / 10 - 1,
      type: "Business", date_time: new Date(Date.UTC(2025 + ((offset + row) % 2), (offset + row) % 12, ((offset + row) % 27) + 1)).toISOString(),
      description: "Disposable performance fixture", deductible: true, pending: false }));
    const inserted = await admin.from("transactions").insert(rows);
    if (inserted.error) throw new Error(`transaction_seed_${index}_${offset}_failed`);
  }
  return fixture;
}

async function cleanup() {
  for (const fixture of fixtures.reverse()) {
    // Transaction deletes emit activity notifications, so remove those rows and
    // their notifications before removing the organization they reference.
    while (true) {
      const page = await admin.from("transactions").select("id").eq("org_id", fixture.orgId).eq("user_id", fixture.userId).limit(500);
      if (page.error) throw page.error;
      const ids = (page.data ?? []).map(row => row.id);
      if (!ids.length) break;
      const removed = await admin.from("transactions").delete().in("id", ids).eq("org_id", fixture.orgId).eq("user_id", fixture.userId);
      if (removed.error) throw removed.error;
    }
    const notifications = await admin.from("account_activity_notifications").delete().eq("organization_id", fixture.orgId);
    if (notifications.error) throw notifications.error;
    const organization = await admin.from("organizations").delete().eq("id", fixture.orgId).eq("owner_id", fixture.userId);
    if (organization.error) throw organization.error;
    const profile = await admin.from("users").delete().eq("id", fixture.userId).eq("auth_id", fixture.authId);
    if (profile.error) throw profile.error;
    const identity = await admin.auth.admin.deleteUser(fixture.authId);
    if (identity.error) throw identity.error;
  }
}

const server = await new Promise<import("node:http").Server>((resolve, reject) => {
  const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  instance.once("error", reject);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("local_server_failed");
const api = `http://127.0.0.1:${address.port}/api`;
const auth = (fixture: Fixture) => ({ Authorization: `Bearer ${fixture.token}` });
const baselineRss = process.memoryUsage().rss;
let peakRss = baselineRss;
const memorySampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 100);

try {
  const [large, second, third] = await Promise.all([makeFixture(1, LARGE_TRANSACTION_COUNT), makeFixture(2, 0), makeFixture(3, 0)]);

  const healthTimes: number[] = [];
  for (let batch = 0; batch < 10; batch++) {
    const results = await Promise.all(Array.from({ length: 10 }, () => timedFetch(`${api}/healthz`)));
    for (const result of results) { if (!result.response.ok) throw new Error("health_request_failed"); healthTimes.push(result.ms); }
  }

  const authenticatedTimes: number[] = [];
  for (let batch = 0; batch < 5; batch++) {
    const results = await Promise.all(Array.from({ length: 2 }, () => timedFetch(`${api}/connections/status?organization_id=${large.orgId}`, { headers: auth(large) })));
    for (const result of results) { if (!result.response.ok) throw new Error("authenticated_request_failed"); authenticatedTimes.push(result.ms); }
  }

  const largeExport = await timedFetch(`${api}/account/export`, { method: "POST", headers: auth(large) });
  if (!largeExport.response.ok) throw new Error(`large_export_failed_${largeExport.response.status}`);
  const largeArchive = Buffer.from(await largeExport.response.arrayBuffer());
  const largeJson = JSON.parse(gunzipSync(largeArchive).toString("utf8")) as { manifest: { recordCounts: Record<string, number> } };
  if (Number(largeJson.manifest.recordCounts.transactions) !== LARGE_TRANSACTION_COUNT) throw new Error("large_export_incomplete");

  const concurrentStarted = performance.now();
  const first = timedFetch(`${api}/account/export`, { method: "POST", headers: auth(second) });
  const secondExport = timedFetch(`${api}/account/export`, { method: "POST", headers: auth(third) });
  await new Promise(resolve => setTimeout(resolve, 1500));
  const rejected = await timedFetch(`${api}/account/export`, { method: "POST", headers: auth(large) });
  const concurrent = await Promise.all([first, secondExport]);
  const concurrentMs = performance.now() - concurrentStarted;
  if (concurrent.some(result => !result.response.ok)) throw new Error(`concurrent_export_failed_${concurrent.map(x => x.response.status).join("_")}`);
  await Promise.all(concurrent.map(result => result.response.arrayBuffer()));
  if (rejected.response.status !== 429) throw new Error(`third_export_not_rejected_${rejected.response.status}`);

  const isolationResults = await Promise.all(Array.from({ length: 20 }, () => timedFetch(`${api}/monitoring?organization_id=${second.orgId}`, { headers: auth(large) })));
  if (isolationResults.some(result => ![403, 404].includes(result.response.status))) throw new Error("tenant_isolation_failed_under_load");

  clearInterval(memorySampler);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  const result = {
    status: "passed", fixtureTransactions: LARGE_TRANSACTION_COUNT, healthRequests: healthTimes.length,
    healthP95Ms: Math.round(percentile(healthTimes, 0.95)), authenticatedRequests: authenticatedTimes.length,
    authenticatedP95Ms: Math.round(percentile(authenticatedTimes, 0.95)), largeExportMs: Math.round(largeExport.ms),
    largeArchiveBytes: largeArchive.length, concurrentExportsCompleted: 2, concurrentExportMs: Math.round(concurrentMs),
    thirdExportStatus: rejected.response.status, thirdExportRejectionMs: Math.round(rejected.ms), tenantIsolationRequestsDenied: isolationResults.length,
    rssGrowthMiB: Math.round((peakRss - baselineRss) / 1024 / 1024), thresholds,
  };
  if (result.healthP95Ms > thresholds.healthP95Ms) throw new Error(`health_p95_threshold_${result.healthP95Ms}`);
  if (result.authenticatedP95Ms > thresholds.authenticatedP95Ms) throw new Error(`authenticated_p95_threshold_${result.authenticatedP95Ms}`);
  if (result.largeExportMs > thresholds.largeExportMs) throw new Error(`large_export_threshold_${result.largeExportMs}`);
  if (result.concurrentExportMs > thresholds.concurrentExportMs) throw new Error(`concurrent_export_threshold_${result.concurrentExportMs}`);
  if (result.thirdExportRejectionMs > thresholds.rejectionMs) throw new Error(`rejection_threshold_${result.thirdExportRejectionMs}`);
  if (result.rssGrowthMiB > thresholds.rssGrowthMiB) throw new Error(`rss_threshold_${result.rssGrowthMiB}`);
  console.log(JSON.stringify(result));
} catch (error) {
  console.log(JSON.stringify({ status: "failed", stage: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
} finally {
  clearInterval(memorySampler);
  await cleanup();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
