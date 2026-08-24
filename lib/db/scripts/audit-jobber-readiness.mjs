import pg from "pg";

const REQUIRED_TABLES = [
  "jobber_connections",
  "jobber_oauth_states",
  "jobber_sync_state",
  "jobber_records",
  "jobber_audit_events",
];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const target = new URL(connectionString);
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8_000,
});

async function auditThroughPostgres() {
  await client.connect();
  try {
  await client.query("BEGIN READ ONLY");
  const tables = await client.query(
    `select table_name
       from information_schema.tables
      where table_schema = $1
        and table_name = any($2::text[])
      order by table_name`,
    ["public", REQUIRED_TABLES],
  );
  const grants = await client.query(
    `select grantee, table_name, privilege_type
       from information_schema.role_table_grants
      where table_schema = $1
        and table_name like $2
        and grantee = any($3::text[])
      order by table_name, grantee, privilege_type`,
    ["public", "jobber_%", ["anon", "authenticated"]],
  );
  await client.query("ROLLBACK");

  const presentTables = tables.rows.map((row) => row.table_name);
  const missingTables = REQUIRED_TABLES.filter((table) => !presentTables.includes(table));
    return {
    target: {
      host: target.hostname,
      database: target.pathname.replace(/^\//, "") || null,
    },
    checkMethod: "postgres_read_only_transaction",
    presentTables,
    missingTables,
    unsafeDirectClientGrants: grants.rows,
    directClientGrantsVerified: true,
    ready: missingTables.length === 0 && grants.rows.length === 0,
  };
  } finally {
    await client.end();
  }
}

async function auditThroughSupabaseRest() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase REST fallback is not configured");
  const checks = await Promise.all(REQUIRED_TABLES.map(async (table) => {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${table}?select=id&limit=0`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    return { table, present: response.ok, status: response.status };
  }));
  const presentTables = checks.filter((check) => check.present).map((check) => check.table).sort();
  const missingTables = checks.filter((check) => !check.present).map((check) => check.table).sort();
  return {
    target: { host: new URL(supabaseUrl).hostname, database: null },
    checkMethod: "supabase_rest_head",
    presentTables,
    missingTables,
    unsafeDirectClientGrants: null,
    directClientGrantsVerified: false,
    ready: false,
    note: "Table presence was verified through HTTPS; direct database grants still require SQL verification.",
  };
}

let result;
try {
  result = await auditThroughPostgres();
} catch (error) {
  const networkFailure = new Set(["EACCES", "ETIMEDOUT", "ECONNREFUSED", "ENETUNREACH"]).has(error?.code)
    || /timeout expired|network|connect/i.test(String(error?.message ?? ""));
  if (!networkFailure) throw error;
  result = await auditThroughSupabaseRest();
}
console.log(JSON.stringify(result, null, 2));
if (!result.ready) process.exitCode = 2;
