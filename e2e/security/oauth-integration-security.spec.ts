import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

type StoredState = { origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }> };

function session(stateName: string) {
  const state = JSON.parse(readFileSync(resolve("e2e/.auth", stateName), "utf8")) as StoredState;
  const entries = state.origins?.flatMap(origin => origin.localStorage ?? []) ?? [];
  const authEntry = entries.find(entry => entry.name.startsWith("sb-") && entry.name.endsWith("-auth-token"));
  const token = authEntry ? (JSON.parse(authEntry.value) as { access_token?: string }).access_token ?? "" : "";
  const organizationId = Number(entries.find(entry => entry.name === "booksmart_active_organization_id")?.value);
  if (!token || !Number.isSafeInteger(organizationId)) throw new Error(`Invalid OAuth security state: ${stateName}`);
  return { token, organizationId };
}

const companyA = session("01-healthy-hvac.json");
const companyB = session("02-busy-but-broke-plumbing.json");
const apiUrl = (path: string) => `${(process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "")}${path}`;

test("altered or missing OAuth callbacks fail safely without exposing credentials", async ({ request }) => {
  const callbacks = [
    "/api/integrations/quickbooks/callback?code=fake-code&realmId=1&state=tampered",
    "/api/integrations/jobber/callback?code=fake-code&state=tampered",
    "/api/integrations/gmail/callback?code=fake-code&state=tampered",
    "/api/integrations/quickbooks/callback",
    "/api/integrations/jobber/callback",
    "/api/integrations/gmail/callback",
  ];
  for (const callback of callbacks) {
    const response = await request.get(apiUrl(callback), { maxRedirects: 0 });
    expect(response.status(), `${callback} should redirect to a safe error`).toBe(303);
    const location = response.headers().location ?? "";
    expect(location).toMatch(/\/user\/settings/);
    expect(location).toMatch(/error|setup_required/);
    expect(location).not.toMatch(/fake-code|access_token|refresh_token|client_secret/i);
  }
});

test("Plaid cannot start or complete a connection for another organization", async ({ request }) => {
  const headers = { Authorization: `Bearer ${companyA.token}`, "Content-Type": "application/json" };
  const link = await request.post(apiUrl("/api/plaid/link-token"), {
    headers,
    data: { org_id: companyB.organizationId },
  });
  expect([403, 404]).toContain(link.status());

  const exchange = await request.post(apiUrl("/api/plaid/exchange-public-token"), {
    headers,
    data: { org_id: companyB.organizationId, public_token: "must-not-reach-plaid" },
  });
  expect([403, 404]).toContain(exchange.status());
  expect(await exchange.text()).not.toContain("must-not-reach-plaid");
});
