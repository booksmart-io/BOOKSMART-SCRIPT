import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";

type TenantSession = { token: string; organizationId: number; storageState: string };
type StoredState = { origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }> };

function tenantSession(stateName: string): TenantSession {
  const storageState = resolve("e2e/.auth", stateName);
  const state = JSON.parse(readFileSync(storageState, "utf8")) as StoredState;
  const entries = state.origins?.flatMap(origin => origin.localStorage ?? []) ?? [];
  const organizationId = Number(entries.find(entry => entry.name === "booksmart_active_organization_id")?.value);
  const authEntry = entries.find(entry => entry.name.startsWith("sb-") && entry.name.endsWith("-auth-token"));
  const authValue = authEntry ? JSON.parse(authEntry.value) as { access_token?: unknown } : null;
  const token = typeof authValue?.access_token === "string" ? authValue.access_token : "";
  if (!token || !Number.isSafeInteger(organizationId) || organizationId <= 0) throw new Error(`Invalid security test state: ${stateName}`);
  return { token, organizationId, storageState };
}

const companyA = tenantSession("01-healthy-hvac.json");
const companyB = tenantSession("02-busy-but-broke-plumbing.json");
const auth = (session: TenantSession) => ({ Authorization: `Bearer ${session.token}` });
const apiUrl = (endpoint: string) => `${(process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "")}${endpoint}`;

async function expectDenied(endpoint: string, response: Awaited<ReturnType<APIRequestContext["get"]>>) {
  expect([403, 404], `${endpoint} must deny cross-tenant access safely`).toContain(response.status());
  const body = await response.text();
  expect(body).not.toContain("E2E_SYNTHETIC_02_BUSY_BUT_BROKE_PLUMBING");
}

test("Company A can read its own protected financial resources", async ({ request }) => {
  const endpoints = [
    `/api/monitoring?organization_id=${companyA.organizationId}`,
    `/api/connections/status?organization_id=${companyA.organizationId}`,
    `/api/organizations/${companyA.organizationId}/contractor-financial-intelligence?start=2026-08-01&end=2026-08-31`,
    `/api/organizations/${companyA.organizationId}/contractor-job-costs/review-queue`,
    `/api/organizations/${companyA.organizationId}/contractor-receipts/review-queue`,
    `/api/integrations/jobber/records?organization_id=${companyA.organizationId}&object_type=jobs`,
    `/api/integrations/gmail/status?organization_id=${companyA.organizationId}`,
  ];
  for (const endpoint of endpoints) {
    const response = await request.get(apiUrl(endpoint), { headers: auth(companyA) });
    expect(response.status(), `${endpoint} should be available to its owner`).toBeLessThan(400);
  }
});

test("Company A cannot read Company B resources by changing organization identifiers", async ({ request }) => {
  const endpoints = [
    `/api/monitoring?organization_id=${companyB.organizationId}`,
    `/api/connections/status?organization_id=${companyB.organizationId}`,
    `/api/organizations/${companyB.organizationId}/contractor-financial-intelligence?start=2026-08-01&end=2026-08-31`,
    `/api/organizations/${companyB.organizationId}/contractor-job-costs/review-queue`,
    `/api/organizations/${companyB.organizationId}/contractor-receipts/review-queue`,
    `/api/integrations/jobber/records?organization_id=${companyB.organizationId}&object_type=jobs`,
    `/api/integrations/gmail/status?organization_id=${companyB.organizationId}`,
  ];
  for (const endpoint of endpoints) await expectDenied(endpoint, await request.get(apiUrl(endpoint), { headers: auth(companyA) }));
});

test("Company B cannot read Company A resources by changing organization identifiers", async ({ request }) => {
  const endpoints = [
    `/api/monitoring?organization_id=${companyA.organizationId}`,
    `/api/connections/status?organization_id=${companyA.organizationId}`,
    `/api/organizations/${companyA.organizationId}/contractor-financial-intelligence?start=2026-08-01&end=2026-08-31`,
    `/api/organizations/${companyA.organizationId}/contractor-job-costs/review-queue`,
    `/api/organizations/${companyA.organizationId}/contractor-receipts/review-queue`,
    `/api/integrations/jobber/records?organization_id=${companyA.organizationId}&object_type=jobs`,
    `/api/integrations/gmail/status?organization_id=${companyA.organizationId}`,
  ];
  for (const endpoint of endpoints) await expectDenied(endpoint, await request.get(apiUrl(endpoint), { headers: auth(companyB) }));
});

test("missing credentials cannot read protected tenant resources", async ({ request }) => {
  const response = await request.get(apiUrl(`/api/monitoring?organization_id=${companyA.organizationId}`));
  expect(response.status()).toBe(401);
});

test("a business owner cannot use CPA-only or admin-only APIs", async ({ request }) => {
  const restrictedEndpoints = [
    `/api/cpa/clients/1/financial-summary`,
    `/api/admin/contractor-diagnostics/${companyA.organizationId}`,
    `/api/admin/accounts`,
  ];
  for (const endpoint of restrictedEndpoints) {
    const response = await request.get(apiUrl(endpoint), { headers: auth(companyA) });
    expect(response.status(), `${endpoint} must reject a business-owner session`).toBe(403);
  }
});

test("missing credentials cannot use CPA-only or admin-only APIs", async ({ request }) => {
  for (const endpoint of [`/api/cpa/clients/1/financial-summary`, `/api/admin/accounts`]) {
    const response = await request.get(apiUrl(endpoint));
    expect(response.status(), `${endpoint} must require authentication`).toBe(401);
  }
});

test.describe("browser organization tampering", () => {
  test.use({ storageState: companyA.storageState });

  test("changing the saved active organization cannot expose another company", async ({ page }) => {
    await page.addInitScript(() => {
      const userId = localStorage.getItem("booksmart_e2e_user_id");
      if (userId) sessionStorage.setItem(`booksmart:upgrade-prompt-dismissed:${userId}`, "1");
    });
    await page.goto("/user/insights");
    await expect(page.getByRole("heading", { name: "Insights", exact: true })).toBeVisible();
    const result = await page.evaluate(async ({ organizationId, token }) => {
      localStorage.setItem("booksmart_active_organization_id", String(organizationId));
      const response = await fetch(`/api/monitoring?organization_id=${organizationId}`, { headers: { Authorization: `Bearer ${token}` } });
      return { status: response.status, body: await response.text() };
    }, { organizationId: companyB.organizationId, token: companyA.token });
    expect([403, 404]).toContain(result.status);
    expect(result.body).not.toContain("E2E_SYNTHETIC_02_BUSY_BUT_BROKE_PLUMBING");
  });
});
