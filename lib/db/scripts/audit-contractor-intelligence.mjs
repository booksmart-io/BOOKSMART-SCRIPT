import pg from "pg";

const REQUIRED_TABLES = [
  "contractor_financial_settings",
  "contractor_financial_matches",
  "contractor_job_cost_assignments",
  "contractor_receipt_extractions",
  "contractor_source_links",
];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not configured");
const target = new URL(connectionString);
const isPostgresConnection = target.protocol === "postgres:" || target.protocol === "postgresql:";
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8_000 });

async function auditThroughPostgres() {
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const tables = await client.query(`select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[]) order by table_name`, [REQUIRED_TABLES]);
  const presentTables = tables.rows.map(row => row.table_name);
  const missingTables = REQUIRED_TABLES.filter(table => !presentTables.includes(table));
  if (missingTables.length) {
    await client.query("ROLLBACK");
    return { target: { host: target.hostname }, presentTables, missingTables, ready: false };
  } else {
    const [rls, grants, matchJobLeak, assignmentMatchLeak, assignmentTransactionLeak, untraceableAssignments, duplicateAssignments] = await Promise.all([
      client.query(`select relname as table_name, relrowsecurity as rls_enabled from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace where nspname = 'public' and relname = any($1::text[]) order by relname`, [REQUIRED_TABLES]),
      client.query(`select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = any($1::text[]) and grantee = any($2::text[]) order by table_name, grantee`, [REQUIRED_TABLES, ["anon", "authenticated"]]),
      client.query(`select count(*)::int as count from contractor_financial_matches m join jobber_records j on j.object_type = 'jobs' and j.external_id = m.jobber_job_id where m.jobber_job_id is not null and j.organization_id <> m.organization_id`),
      client.query(`select count(*)::int as count from contractor_job_cost_assignments a join contractor_financial_matches m on m.id = a.match_id where a.organization_id <> m.organization_id`),
      client.query(`select count(*)::int as count from contractor_job_cost_assignments a join transactions t on a.source_record_type = 'transaction' and a.source_record_id = t.id::text where t.org_id <> a.organization_id`),
      client.query(`select count(*)::int as count from contractor_job_cost_assignments where confidence = 'confirmed' and match_id is null`),
      client.query(`select count(*)::int as count from (select organization_id, source_provider, source_record_type, source_record_id from contractor_job_cost_assignments group by 1,2,3,4 having count(*) > 1) duplicates`),
    ]);
    await client.query("ROLLBACK");
    const rlsDisabled = rls.rows.filter(row => !row.rls_enabled).map(row => row.table_name);
    const contamination = {
      matchesPointingToOtherOrganizationsJobs: matchJobLeak.rows[0].count,
      assignmentsPointingToOtherOrganizationsMatches: assignmentMatchLeak.rows[0].count,
      assignmentsPointingToOtherOrganizationsTransactions: assignmentTransactionLeak.rows[0].count,
      confirmedAssignmentsWithoutMatches: untraceableAssignments.rows[0].count,
      duplicateAssignments: duplicateAssignments.rows[0].count,
    };
    const ready = rlsDisabled.length === 0 && grants.rows.length === 0 && Object.values(contamination).every(count => count === 0);
    return { target: { host: target.hostname, database: target.pathname.replace(/^\//, "") || null }, checkMethod: "postgres_read_only_transaction",
      presentTables, missingTables, rlsDisabled, unsafeDirectClientGrants: grants.rows, contamination, directSecurityVerified: true, ready };
  }
} finally {
  await client.end();
}
}

async function auditThroughSupabaseRest() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase REST fallback is not configured");
  const checks = await Promise.all(REQUIRED_TABLES.map(async table => {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${table}?select=*&limit=0`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    return { table, present: response.ok, status: response.status };
  }));
  const presentTables = checks.filter(check => check.present).map(check => check.table).sort();
  const missingTables = checks.filter(check => !check.present).map(check => check.table).sort();
  return { target: { host: new URL(supabaseUrl).hostname, database: null }, checkMethod: "supabase_rest_head",
    presentTables, missingTables, rlsDisabled: null, unsafeDirectClientGrants: null, contamination: null,
    directSecurityVerified: false, ready: false,
    note: "Table presence was checked through HTTPS; RLS, direct grants, duplicates, and cross-organization contamination still require direct SQL." };
}

let result;
try {
  if (!isPostgresConnection) {
    const error = new Error("DATABASE_URL must be a PostgreSQL connection string, not an HTTPS Supabase project URL");
    error.code = "INVALID_DATABASE_URL";
    throw error;
  }
  result = await auditThroughPostgres();
} catch (error) {
  const directConnectionUnavailable = error?.code === "INVALID_DATABASE_URL"
    || new Set(["EACCES", "ETIMEDOUT", "ECONNREFUSED", "ENETUNREACH"]).has(error?.code)
    || /timeout expired|network|connect/i.test(String(error?.message ?? ""));
  if (!directConnectionUnavailable) throw error;
  result = await auditThroughSupabaseRest();
  result.directSqlBlocker = error?.message ?? String(error);
}
console.log(JSON.stringify(result, null, 2));
if (!result.ready) process.exitCode = 2;
