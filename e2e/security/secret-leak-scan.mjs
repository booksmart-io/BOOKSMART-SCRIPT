import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

process.loadEnvFile(".env");
const secretNames = [
  "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "OPENAI_API_KEY",
  "OPENROUTER_API_KEY", "STRIPE_SECRET_KEY", "PLAID_SECRET", "QUICKBOOKS_CLIENT_SECRET",
  "JOBBER_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET", "GMAIL_STATE_SECRET",
  "GMAIL_TOKEN_ENCRYPTION_KEY", "JOBBER_STATE_SECRET", "JOBBER_TOKEN_ENCRYPTION_KEY",
];
const secrets = secretNames.map(name => ({ name, value: process.env[name] })).filter(item => (item.value?.length ?? 0) >= 8);
const roots = ["test-results", "playwright-report", "security-report"];
const files = [];
function walk(path) {
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) walk(child);
    else if (entry.isFile() && statSync(child).size <= 100 * 1024 * 1024) files.push(child);
  }
}
for (const root of roots) walk(root);

const leaks = [];
for (const file of files) {
  const content = readFileSync(file);
  for (const secret of secrets) {
    if (content.indexOf(Buffer.from(secret.value)) !== -1) leaks.push({ file: relative(".", file), secret: secret.name });
  }
}
assert.deepEqual(leaks, [], `Secret values found in test artifacts: ${JSON.stringify(leaks)}`);
console.log(JSON.stringify({ status: "passed", filesScanned: files.length, secretValuesChecked: secrets.length,
  rootsChecked: roots.filter(existsSync) }, null, 2));
