import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { gunzipSync } from "node:zlib";
import { buildCustomerExport, exportRows, sanitizeExport } from "./customer-export";
import { assertExportAccountActive, customerExportRouter } from "../routes/customer-export";

const A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
type Row = Record<string, any>;
function fixture(tables: Record<string, Row[]> = {}, options: { foreign?: boolean; missing?: string; banned?: boolean; fileForeign?: boolean; failDownload?: boolean } = {}) {
  const calls: Array<{ table: string; column: string; ids: any[]; projection: string }> = [];
  const all: Record<string, Row[]> = {
    users: [{ id: 1, auth_id: A, role: "user" }, { id: 2, auth_id: B, role: "user" }],
    organizations: [{ id: 10, owner_id: 1 }, { id: 20, owner_id: 2 }],
    ...tables,
  };
  const client: any = {
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, banned_until: options.banned ? "2999-01-01" : null } }, error: null }) } },
    from(table: string) {
      let column = "", ids: any[] = [], projection = "*", start = 0, end = Infinity;
      const run = () => {
        calls.push({ table, column, ids, projection });
        if (options.missing === table) return { data: null, count: null, error: { message: "secret-provider-header" } };
        let rows = (all[table] ?? []).filter(row => options.foreign || ids.includes(row[column]));
        const count = rows.length;
        rows = rows.slice(start, end + 1).map(row => projection === "*" ? row : Object.fromEntries(projection.split(",").map(key => [key, row[key]])));
        return { data: rows, count, error: null };
      };
      const query: any = {
        select(value: string) { projection = value; return query; },
        in(key: string, values: any[]) { column = key; ids = values; return query; },
        eq(key: string, value: any) { column = key; ids = [value]; return query; },
        order() { return query; }, range(a: number, b: number) { start = a; end = b; return query; },
        maybeSingle: async () => { const r = run(); return { ...r, data: r.data?.[0] ?? null }; },
        then(resolve: any, reject: any) { return Promise.resolve(run()).then(resolve, reject); },
      };
      return query;
    },
    storage: { from(bucket: string) { return {
      list: async (path: string) => ({ data: bucket === "documents" && path === A ? [{ id: "file-1", name: options.fileForeign ? "../foreign.pdf" : "receipt.pdf", metadata: { size: 7 } }] : [], error: null }),
      download: async (path: string) => {
        assert.equal(path, `${A}/receipt.pdf`);
        return options.failDownload ? { data: null, error: {} } : { data: new Blob(["receipt"]), error: null };
      },
    }; } },
  };
  return { client, calls };
}

test("export covers owned records and files; mixed ID types and parent links stay scoped", async () => {
  const { client, calls } = fixture({
    transactions: [{ id: 1, org_id: 10 }, { id: 2, org_id: 20 }],
    token_transactions: [{ id: 1, user_id: A }, { id: 2, user_id: B }],
    statement_imports: [{ id: 3, org_id: 10 }, { id: 4, org_id: 20 }],
    pending_transactions: [{ id: 5, import_id: 3 }, { id: 6, import_id: 4 }],
    chats: [{ id: 7, sender_id: 1, receiver_id: 2 }, { id: 8, sender_id: 2, receiver_id: 3 }],
    messages: [{ id: 9, chat_id: 7 }, { id: 10, chat_id: 8 }],
    plaid_items: [{ id: 11, org_id: 10, access_token: "never-export" }, { id: 12, org_id: 20 }],
  });
  const result = await buildCustomerExport(client, A);
  assert.deepEqual(result.records.transactions.map(r => r.id), [1]);
  assert.deepEqual(result.records.token_transactions.map(r => r.id), [1]);
  assert.deepEqual(result.records.pending_transactions.map(r => r.id), [5]);
  assert.deepEqual(result.records.messages.map(r => r.id), [9]);
  assert.equal(result.files[0].path, `${A}/receipt.pdf`);
  assert.equal(Buffer.from(result.files[0].content, "base64").toString(), "receipt");
  assert.equal(result.files[0].sha256.length, 64);
  assert.equal(JSON.stringify(result).includes("never-export"), false);
  assert.ok(calls.filter(c => c.table === "plaid_items").every(c => !c.projection.includes("access_token")));
});

test("pagination exports more than a provider page without duplicates", async () => {
  const { client } = fixture({ transactions: Array.from({ length: 1201 }, (_, id) => ({ id, org_id: 10 })) });
  const rows = await exportRows(client, "transactions", "org_id", [10]);
  assert.equal(rows.length, 1201); assert.equal(new Set(rows.map(r => r.id)).size, 1201);
});

test("foreign rows and unsafe storage paths abort the entire export", async () => {
  await assert.rejects(buildCustomerExport(fixture({}, { foreign: true }).client, A), /export_scope_violation/);
  await assert.rejects(buildCustomerExport(fixture({}, { fileForeign: true }).client, A), /export_scope_violation/);
});

test("missing required tables and unreadable files cannot masquerade as complete exports", async () => {
  await assert.rejects(buildCustomerExport(fixture({}, { missing: "financial_tasks" }).client, A), /export_data_unavailable/);
  await assert.rejects(buildCustomerExport(fixture({}, { failDownload: true }).client, A), /export_files_unavailable/);
});

test("secrets and signed URL credentials are removed recursively", () => {
  const sanitized = sanitizeExport({ access_token: "secret", nested: [{ refresh_token_encrypted: "secret", authorization: "secret", password_hash: "secret", amount: 30 }],
    url: "https://example.com/file?token=secret&name=receipt", last_sync_error: "secret" });
  assert.equal(JSON.stringify(sanitized).includes("secret"), false);
  assert.equal(sanitized.nested[0].amount, 30);
});

test("disabled and removed accounts are rejected even with an already verified token", async () => {
  await assert.rejects(assertExportAccountActive(fixture({}, { banned: true }).client, A), /export_forbidden/);
  const { client } = fixture(); client.auth.admin.getUserById = async () => ({ data: { user: null }, error: {} });
  await assert.rejects(assertExportAccountActive(client, A), /export_forbidden/);
});

test("CPA and admin roles cannot use the owner export to obtain client records", async () => {
  for (const role of ["cpa", "admin", "employee"]) {
    await assert.rejects(buildCustomerExport(fixture({ users: [{ id: 1, auth_id: A, role }] }).client, A), /export_forbidden/);
  }
});

test("pagination notices changing counts instead of silently returning a truncated collection", async () => {
  let page = 0;
  const query: any = { select() { return query; }, in() { return query; }, order() { return query; },
    range() { return Promise.resolve({ data: [{ id: page++, org_id: 10 }], error: null, count: page === 1 ? 3 : 4 }); } };
  await assert.rejects(exportRows({ from: () => query } as any, "transactions", "org_id", [10]), /export_data_changed/);
});

test("HTTP failure responses hide transport secrets and concurrent exports are bounded", async () => {
  const { client } = fixture();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const running = new Promise<void>(resolve => { entered = resolve; });
  const app = express();
  app.use(customerExportRouter({ client: () => client, authenticate: (req, _res, next) => { req.supabaseUserId = A; next(); },
    build: async () => { entered(); await blocked; throw new Error("Authorization: secret-provider-header"); } }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}/account/export`;
    const first = fetch(url, { method: "POST" }); await running;
    assert.equal((await fetch(url, { method: "POST" })).status, 429);
    release(); const failure = await first;
    assert.equal(failure.status, 503); assert.deepEqual(await failure.json(), { error: "export_unavailable" });
    assert.equal((await fetch(url, { method: "POST" })).status, 503); // lock released after failure
  } finally { release(); server.close(); }
});

test("HTTP export rejects selectors and anonymous callers, sets private headers, and returns a readable archive", async () => {
  const app = express(); app.use(express.json());
  app.use(customerExportRouter({ client: () => fixture().client, authenticate: (req, _res, next) => { if (req.headers.authorization) req.supabaseUserId = A; next(); } }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as any).port;
  try {
    const url = `http://127.0.0.1:${port}/account/export`;
    assert.equal((await fetch(url, { method: "POST" })).status, 401);
    assert.equal((await fetch(`${url}?organization_id=20`, { method: "POST", headers: { Authorization: "test" } })).status, 400);
    const response = await fetch(url, { method: "POST", headers: { Authorization: "test" } });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    const archive = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString());
    assert.deepEqual(archive.records.organizations.map((r: Row) => r.id), [10]);
  } finally { server.close(); }
});
