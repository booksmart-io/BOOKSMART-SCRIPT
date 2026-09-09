import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { scenarioById } from "../../../../e2e/all-scenarios";

const scenarioId = process.env.E2E_SCENARIO_ID?.trim() ?? "04_UNBILLED_LANDSCAPING";
if (!scenarioById(scenarioId)) throw new Error(`Unknown E2E_SCENARIO_ID: ${scenarioId}`);
const slug = scenarioId.toLowerCase().replaceAll("_", "-");
const OWNER_EMAIL = `${slug}@booksmart-e2e.example.test`;
const ORG_NAME = `E2E_SYNTHETIC_${scenarioId}`;
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (process.env.E2E_TARGET !== "test") throw new Error("Refusing auth setup unless E2E_TARGET=test");

const url = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const admin = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const { data: owner, error: ownerError } = await admin.from("users").select("id,auth_id,email").eq("email", OWNER_EMAIL).single();
if (ownerError) throw ownerError;
const { data: organization, error: organizationError } = await admin.from("organizations").select("id,name,owner_id").eq("name", ORG_NAME).single();
if (organizationError) throw organizationError;
if (Number(organization.owner_id) !== Number(owner.id) || owner.email !== OWNER_EMAIL || !owner.auth_id) {
  throw new Error("Refusing auth setup: exact synthetic owner relationship failed");
}

const password = `E2E-${randomBytes(32).toString("base64url")}!9a`;
const { error: updateError } = await admin.auth.admin.updateUserById(String(owner.auth_id), { password, email_confirm: true });
if (updateError) throw updateError;
const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: signIn, error: signInError } = await auth.auth.signInWithPassword({ email: OWNER_EMAIL, password });
if (signInError || !signIn.session) throw signInError ?? new Error("Synthetic sign-in did not return a session");

const projectRef = new URL(url).hostname.split(".")[0];
const storageKey = `sb-${projectRef}-auth-token`;
const origin = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:5173";
const output = resolve(process.cwd(), `../../e2e/.auth/${slug}.json`);
await mkdir(resolve(output, ".."), { recursive: true });
await writeFile(output, JSON.stringify({ cookies: [], origins: [{ origin, localStorage: [
  { name: storageKey, value: JSON.stringify(signIn.session) },
  { name: "booksmart_active_organization_id", value: String(organization.id) },
  { name: "booksmart_e2e_user_id", value: String(owner.id) },
] }] }, null, 2), { encoding: "utf8", mode: 0o600 });
console.log(`Authenticated storage state created for synthetic organization ${organization.id}.`);
