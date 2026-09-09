import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { deleteCpaAccount, deleteOwnerAccount, deleteSelfAccount, removeAccountFiles, verifyRecentAuthentication } from "./account-deletion";
import { accountDeletionRouter } from "../routes/account-deletion";

const AUTH = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
function fixture(options: { role?: string; stripe?: string | null; failCleanup?: string } = {}) {
  const events: string[] = [];
  const profile = { id: 7, auth_id: AUTH, email: "owner@example.test", role: options.role ?? "user", stripe_customer_id: options.stripe ?? null };
  const client: any = {
    auth: { admin: {
      updateUserById: async () => { events.push("ban"); return { error: null }; },
      deleteUser: async () => { events.push("delete-auth"); return { error: null }; },
    } },
    rpc: async (name: string) => { events.push(`delete-database:${name}`); return { data: options.failCleanup ? null : 7, error: options.failCleanup ? {} : null }; },
    from(table: string) {
      let operation = "select";
      const query: any = {
        select() { return query; }, delete() { operation = "delete"; return query; }, eq() { return query; },
        maybeSingle: async () => {
          if (table === "users" && operation === "select") return { data: profile, error: null };
          if (table === "users" && operation === "delete") { events.push("delete-profile"); return { data: { id: 7 }, error: null }; }
          return { data: null, error: null };
        },
        then(resolve: any, reject: any) {
          let result: any;
          if (table === "organizations" && operation === "select") result = { data: [{ id: 10 }, { id: 11 }], error: null };
          else if (operation === "delete") { events.push(`delete-${table}`); result = { data: null, error: options.failCleanup === table ? {} : null }; }
          else result = { data: [], error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { client, events };
}
const deps = (events: string[], warnings: string[] = []) => ({
  verifyRecentAuth: async () => { events.push("verify-recent-auth"); },
  revoke: async (_client: any, ids: number[]) => { events.push(`revoke-${ids.join("-")}`); return warnings; },
  removeFiles: async () => { events.push("remove-files"); },
  deleteStripeCustomer: async () => { events.push("delete-stripe"); },
});

test("owner deletion cleans external resources, locks sessions, then removes data and auth", async () => {
  const { client, events } = fixture({ stripe: "cus_test" });
  const result = await deleteOwnerAccount(client, AUTH, "OWNER@example.test", "DELETE", deps(events, ["gmail"]));
  assert.deepEqual(result, { ok: true, providerRevocationWarnings: ["gmail"] });
  assert.deepEqual(events, ["verify-recent-auth", "revoke-10-11", "delete-stripe", "remove-files", "ban", "delete-database:delete_owner_account_data", "delete-auth"]);
});

test("CPA deletion removes only CPA files, access relationships, profile and Auth identity", async () => {
  const { client, events } = fixture({ role: "cpa" });
  const result = await deleteCpaAccount(client, AUTH, "OWNER@example.test", "DELETE", deps(events));
  assert.deepEqual(result, { ok: true, providerRevocationWarnings: [] });
  assert.deepEqual(events, ["verify-recent-auth", "remove-files", "ban", "delete-database:delete_cpa_account_data", "delete-auth"]);
  assert.equal(events.some(event => event.startsWith("revoke-")), false);
  assert.equal(events.includes("delete-stripe"), false);
});

test("self-service deletion dispatches only supported user and CPA roles", async () => {
  const cpa = fixture({ role: "cpa" });
  await deleteSelfAccount(cpa.client, AUTH, "owner@example.test", "DELETE", deps(cpa.events));
  assert.ok(cpa.events.includes("delete-database:delete_cpa_account_data"));
  const admin = fixture({ role: "admin" });
  await assert.rejects(deleteSelfAccount(admin.client, AUTH, "owner@example.test", "DELETE", deps(admin.events)), /account_delete_forbidden/);
  assert.deepEqual(admin.events, []);
});

test("wrong confirmation and non-owner roles are rejected before cleanup", async () => {
  const first = fixture();
  await assert.rejects(deleteOwnerAccount(first.client, AUTH, "wrong@example.test", "DELETE", deps(first.events)), /confirmation_mismatch/);
  assert.deepEqual(first.events, []);
  const second = fixture({ role: "cpa" });
  await assert.rejects(deleteOwnerAccount(second.client, AUTH, "owner@example.test", "DELETE", deps(second.events)), /account_delete_forbidden/);
  assert.deepEqual(second.events, []);
});

test("destructive deletion requires a sign-in within the last fifteen minutes", async () => {
  const client: any = { auth: { admin: { getUserById: async () => ({ data: { user: { id: AUTH, last_sign_in_at: new Date().toISOString() } }, error: null }) } } };
  await verifyRecentAuthentication(client, AUTH);
  client.auth.admin.getUserById = async () => ({ data: { user: { id: AUTH, last_sign_in_at: new Date(Date.now() - 16 * 60_000).toISOString() } }, error: null });
  await assert.rejects(verifyRecentAuthentication(client, AUTH), /recent_authentication_required/);
});

test("billing failure stops before session lock and database deletion", async () => {
  const { client, events } = fixture({ stripe: "cus_test" });
  await assert.rejects(deleteOwnerAccount(client, AUTH, "owner@example.test", "DELETE", {
    ...deps(events), deleteStripeCustomer: async () => { events.push("delete-stripe"); throw new Error("private provider response"); },
  }), /billing_cleanup_failed/);
  assert.deepEqual(events, ["verify-recent-auth", "revoke-10-11", "delete-stripe"]);
});

test("transactional database failure leaves identity banned and does not delete Auth", async () => {
  const { client, events } = fixture({ failCleanup: "database" });
  await assert.rejects(deleteOwnerAccount(client, AUTH, "owner@example.test", "DELETE", deps(events)), /account_cleanup_incomplete/);
  assert.ok(events.includes("ban")); assert.ok(events.includes("delete-database:delete_owner_account_data")); assert.equal(events.includes("delete-auth"), false);
});

test("file removal rejects foreign paths and removes every bucket in exact batches", async () => {
  const removed: string[][] = [];
  const safe: any = { storage: { from: () => ({
    list: async (folder: string) => ({ data: folder === AUTH ? [{ id: "1", name: "one.pdf" }, { id: null, name: "nested" }] : [{ id: "2", name: "two.pdf" }], error: null }),
    remove: async (paths: string[]) => { removed.push(paths); return { data: paths.map(name => ({ name })), error: null }; },
  }) } };
  await removeAccountFiles(safe, AUTH);
  const perBucket = [`${AUTH}/one.pdf`, `${AUTH}/nested/two.pdf`];
  assert.deepEqual(removed.flat(), [...perBucket, ...perBucket, ...perBucket]);
  const unsafe: any = { storage: { from: () => ({ list: async () => ({ data: [{ id: "x", name: "../foreign" }], error: null }) }) } };
  await assert.rejects(removeAccountFiles(unsafe, AUTH), /file_scope_violation/);
});

test("HTTP endpoint rejects anonymous deletion and hides internal failures", async () => {
  const { client, events } = fixture();
  const app = express(); app.use(express.json()); app.use(accountDeletionRouter({ client: () => client,
    authenticate: (req, _res, next) => { if (req.headers.authorization) req.supabaseUserId = AUTH; next(); },
    dependencies: { ...deps(events), removeFiles: async () => { throw new Error("secret provider credential"); } } }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}/account`;
    assert.equal((await fetch(url, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
    const response = await fetch(url, { method: "DELETE", headers: { Authorization: "test", "Content-Type": "application/json" }, body: JSON.stringify({ email: "owner@example.test", confirmation: "DELETE" }) });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "account_delete_unavailable" });
  } finally { server.close(); }
});
