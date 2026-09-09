import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Never attach tokens, database rows, or signed URLs to test evidence.
function session(slug: string) {
  const state = JSON.parse(readFileSync(`e2e/.auth/${slug}.json`, "utf8"));
  const entries = state.origins.flatMap((origin: any) => origin.localStorage ?? []);
  const auth = JSON.parse(entries.find((entry: any) => /^sb-.+-auth-token$/.test(entry.name)).value);
  if (auth.user.email !== `${slug}@booksmart-e2e.example.test`) throw new Error("Expected synthetic identity");
  const org = Number(entries.find((entry: any) => entry.name === "booksmart_active_organization_id").value);
  if (!Number.isSafeInteger(org) || org <= 0) throw new Error("Invalid synthetic organization");
  return { token: auth.access_token as string, userId: auth.user.id as string, org };
}
const a = session("01-healthy-hvac");
const b = session("02-busy-but-broke-plumbing");
const api = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";

async function privateHead(url: string, options: { headers: Record<string, string> }) {
  // Playwright request errors include authorization headers; use fetch here
  // and replace transport errors so privileged keys cannot enter the report.
  try {
    const response = await fetch(url, { ...options, method: "HEAD", signal: AbortSignal.timeout(15000) });
    return { status: () => response.status, headers: () => Object.fromEntries(response.headers) };
  } catch {
    throw new Error("Database request unavailable; transport details suppressed to protect credentials");
  }
}

test("invalid bearer token cannot read protected data", async ({ request }) => {
  const response = await request.get(`${api}/api/monitoring?organization_id=${a.org}`, {
    headers: { Authorization: "Bearer invalid-security-test-token" },
  });
  expect(response.status()).toBe(401);
});

for (const [label, viewer, owner] of [["A to B", a, b], ["B to A", b, a]] as const) {
  test(`document signing rejects another user's folder (${label}; synthetic path)`, async ({ request }) => {
    const response = await request.post(`${api}/api/document-signed-url`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
      data: { path: `${owner.userId}/stored-data-security-nonexistent.txt` },
    });
    expect(response.status()).toBe(403);
    expect((await response.text()).includes("signedUrl")).toBe(false);
  });
}

const tables = [
  ["transactions", "org_id"], ["jobber_records", "organization_id"],
  ["quickbooks_staged_entities", "organization_id"], ["plaid_items", "org_id"],
  ["account_balance_snapshots", "organization_id"], ["business_signals", "organization_id"],
  ["monitoring_tasks", "organization_id"], ["contractor_financial_matches", "organization_id"],
  ["contractor_job_cost_assignments", "organization_id"],
  ["contractor_receipt_extractions", "organization_id"], ["contractor_source_links", "organization_id"],
] as const;

for (const [table, column] of tables) {
  test(`direct database cross-tenant reads: ${table}`, async () => {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    test.skip(!url || !anonKey || !serviceKey, "Database configuration unavailable");
    // HEAD counts establish fixture existence without retrieving financial data.
    let checked = 0;
    for (const [viewer, owner] of [[a, b], [b, a]]) {
      const target = `${url}/rest/v1/${table}?select=${column}&${column}=eq.${owner.org}`;
      const baseline = await privateHead(target, { headers: {
        apikey: serviceKey!, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact",
      }});
      expect(baseline.status(), "Fixture count must succeed").toBe(200);
      const total = Number(baseline.headers()["content-range"]?.split("/")[1]);
      expect(Number.isFinite(total), "Fixture count must be available").toBe(true);
      if (total === 0) continue;
      checked++;
      const response = await privateHead(target, { headers: {
        apikey: anonKey!, Authorization: `Bearer ${viewer.token}`, Prefer: "count=exact",
      }});
      expect([200, 401, 403]).toContain(response.status());
      if (response.status() === 200) {
        expect(Number(response.headers()["content-range"]?.split("/")[1]),
          "Other tenant must see zero records").toBe(0);
      }
    }
    test.skip(checked === 0, "Neither synthetic organization has records in this table");
  });
}
