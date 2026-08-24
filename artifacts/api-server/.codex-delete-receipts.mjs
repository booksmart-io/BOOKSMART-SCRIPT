import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
const organizationId = Number(process.argv[2]);
if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw new Error("Invalid organization ID");
const url = process.env.SUPABASE_URL ?? "https://pvppwmkswnluidlwnnck.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error("Missing service role key");
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: receipts, error: listError } = await db.from("contractor_receipt_extractions").select("source_id").eq("organization_id", organizationId);
if (listError) throw listError;
const sourceIds = (receipts ?? []).map((row) => row.source_id);
if (sourceIds.length) {
  const operations = [
    db.from("contractor_source_links").delete().eq("organization_id", organizationId).eq("left_provider", "receipt").in("left_record_id", sourceIds),
    db.from("contractor_financial_matches").delete().eq("organization_id", organizationId).eq("source_provider", "receipt").in("source_record_id", sourceIds),
  ];
  for (const operation of operations) {
    const { error } = await operation;
    if (error) throw error;
  }
  const { error: extractionError } = await db.from("contractor_receipt_extractions").delete().eq("organization_id", organizationId).in("source_id", sourceIds);
  if (extractionError) throw extractionError;
}
const { count, error: verifyError } = await db.from("contractor_receipt_extractions").select("source_id", { count: "exact", head: true }).eq("organization_id", organizationId);
if (verifyError) throw verifyError;
console.log(JSON.stringify({ organizationId, removed: sourceIds.length, remaining: count ?? 0 }));
