import { createClient } from "@supabase/supabase-js";
import { runMonitoring } from "../lib/monitoring-runner";

const organizationId = Number(process.argv[2]);
if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
  throw new Error("Usage: tsx src/scripts/run-monitoring-once.ts <organization-id>");
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase server variables are missing.");

const admin = createClient(url, key, { auth: { persistSession: false } });
const run = await runMonitoring(admin, "manual", organizationId);
console.log(JSON.stringify({
  id: run.id, status: run.status, organization_id: organizationId,
  organizations_evaluated: run.organizations_evaluated,
  signals_created: run.signals_created, signals_updated: run.signals_updated,
  signals_resolved: run.signals_resolved, tasks_created: run.tasks_created,
  error_count: run.error_count, errors: run.errors,
}, null, 2));
