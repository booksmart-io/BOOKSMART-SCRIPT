import { createHash, randomBytes, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const require = createRequire(resolve("artifacts/api-server/package.json"));
const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name}_missing`); return value; };
const supabaseUrl = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const nonce = randomUUID();
const email = `export-browser-${nonce}@booksmart-e2e.example.test`;
const password = `Export-${randomBytes(24).toString("base64url")}!9a`;
const originalBytes = Buffer.concat([Buffer.from("BookSmart browser export fixture\n", "utf8"), randomBytes(32)]);
const expectedSha256 = createHash("sha256").update(originalBytes).digest("hex");
let authId = "";
let userId = 0;
let orgId = 0;
let storagePath = "";
let session: Record<string, unknown>;

test.beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { role: "user", e2e_synthetic: true, purpose: "browser_export_acceptance" } });
  if (created.error || !created.data.user) throw new Error("auth_fixture_create_failed");
  authId = created.data.user.id;
  const profile = await admin.from("users").insert({ auth_id: authId, email, role: "user", first_name: "Disposable",
    last_name: "Export Browser Test", phone_number: "", token_balance: 0 }).select("id").single();
  if (profile.error) throw new Error("profile_fixture_create_failed");
  userId = Number(profile.data.id);
  const organization = await admin.from("organizations").insert({ owner_id: userId, name: `E2E_EXPORT_BROWSER_${nonce}`,
    org_type: "llc", industry: "Test", email, ein_tin: "00-0000000", state: 1, street: "1 Synthetic Way",
    city: "Testville", zip: "00000", phone: "5550000000", website: "https://export.example.test" }).select("id").single();
  if (organization.error) throw new Error("organization_fixture_create_failed");
  orgId = Number(organization.data.id);
  storagePath = `${authId}/browser-export/${nonce}.bin`;
  const upload = await admin.storage.from("documents").upload(storagePath, originalBytes, { contentType: "application/octet-stream" });
  if (upload.error) throw new Error("storage_fixture_create_failed");
  const login = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await login.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw new Error("fixture_sign_in_failed");
  session = signedIn.data.session as unknown as Record<string, unknown>;
});

test.afterAll(async () => {
  const ignore = async (operation: PromiseLike<unknown>) => { try { await operation; } catch { /* exact disposable-fixture cleanup */ } };
  if (storagePath) await ignore(admin.storage.from("documents").remove([storagePath]));
  if (orgId) await ignore(admin.from("organizations").delete().eq("id", orgId));
  if (userId) await ignore(admin.from("users").delete().eq("id", userId));
  if (authId) await ignore(admin.auth.admin.deleteUser(authId));
});

test("owner downloads a complete browser export containing original stored file bytes", async ({ context, page }) => {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  await context.addInitScript(({ key, value, organizationId }) => {
    localStorage.setItem(key, value);
    localStorage.setItem("booksmart_active_organization_id", String(organizationId));
  }, { key: `sb-${projectRef}-auth-token`, value: JSON.stringify(session), organizationId: orgId });

  await page.goto("/user/settings");
  await expect(page.getByText(email, { exact: false }).first()).toBeVisible();
  const exportRow = page.getByRole("button", { name: "Download account data" });
  await expect(exportRow).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), exportRow.click()]);
  expect(download.suggestedFilename()).toMatch(/^booksmart-account-export-\d{4}-\d{2}-\d{2}\.json\.gz$/);
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  const exported = JSON.parse(gunzipSync(await import("node:fs").then(({ readFileSync }) => readFileSync(downloadedPath!))).toString("utf8")) as {
    manifest: { version: number; fileCount: number };
    records: { users: Array<{ auth_id: string }>; organizations: Array<{ id: number }> };
    files: Array<{ bucket: string; path: string; encoding: string; sha256: string; content: string }>;
  };
  expect(exported.manifest.version).toBe(1);
  expect(exported.records.users).toHaveLength(1);
  expect(exported.records.users[0].auth_id).toBe(authId);
  expect(exported.records.organizations.some(row => Number(row.id) === orgId)).toBe(true);
  expect(exported.manifest.fileCount).toBeGreaterThanOrEqual(1);
  const file = exported.files.find(entry => entry.bucket === "documents" && entry.path === storagePath);
  expect(file).toBeTruthy();
  expect(file!.encoding).toBe("base64");
  expect(file!.sha256).toBe(expectedSha256);
  expect(Buffer.from(file!.content, "base64")).toEqual(originalBytes);
  await expect(page.getByText("Your account export has downloaded.")).toBeVisible();
});
