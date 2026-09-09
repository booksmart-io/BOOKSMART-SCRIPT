import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildCustomerExport } from "../lib/customer-export";
import { assertExportAccountActive } from "../routes/customer-export";

// Read-only hosted acceptance. Only established synthetic accounts are eligible.
// Never save an archive or print sessions, URLs, provider errors, or record contents.
async function main() {
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("configuration_missing");
  let failedResource = "";
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: async (input, init) => {
      try {
        const response = await fetch(input, { ...init, signal: AbortSignal.timeout(20_000) });
        if (!response.ok) {
          const pathname = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname;
          failedResource = pathname.startsWith("/rest/v1/") ? pathname.split("/")[3] : "auth_or_storage";
        }
        return response;
      } catch { throw new Error("hosted_network_unavailable"); }
    },
  } });
  for (const slug of ["01-healthy-hvac", "02-busy-but-broke-plumbing"]) {
    const state = JSON.parse(readFileSync(`e2e/.auth/${slug}.json`, "utf8"));
    const entries = state.origins.flatMap((origin: any) => origin.localStorage ?? []);
    const auth = JSON.parse(entries.find((entry: any) => /^sb-.+-auth-token$/.test(entry.name))?.value ?? "null");
    if (auth?.user?.email !== `${slug}@booksmart-e2e.example.test`) throw new Error("synthetic_identity_required");
    await assertExportAccountActive(client, auth.user.id);
    const { data, error } = await client.auth.admin.getUserById(auth.user.id);
    if (error || data.user?.email !== `${slug}@booksmart-e2e.example.test`) throw new Error("synthetic_identity_required");
    try {
      const result = await buildCustomerExport(client, auth.user.id);
      console.log(JSON.stringify({ fixture: slug, status: "passed", tables: Object.keys(result.records).length,
        organizations: result.records.organizations.length, files: result.files.length,
        records: Object.values(result.records).reduce((sum, rows) => sum + rows.length, 0) }));
    } catch {
      console.log(JSON.stringify({ fixture: slug, status: "failed", resource: failedResource || "collection" }));
      process.exitCode = 1;
    }
  }
}
main().catch(() => { console.log("Hosted export check unavailable; sensitive transport details suppressed."); process.exitCode = 1; });
