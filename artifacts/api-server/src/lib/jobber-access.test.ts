import assert from "node:assert/strict";
import test from "node:test";
import { requireOwnedJobberOrganization, scopeJobberAudit, scopeJobberConnection, scopeJobberRecords } from "./jobber-access";

function accessAdmin(authUserId: string, ownedOrganizationId: number) {
  const filters: Array<[string, string, unknown]> = [];
  return {
    filters,
    from(table: string) {
      const tableFilters: Array<[string, unknown]> = [];
      const chain: any = {
        select: () => chain,
        eq(column: string, value: unknown) {
          tableFilters.push([column, value]);
          filters.push([table, column, value]);
          return chain;
        },
        async maybeSingle() {
          if (table === "users") {
            return tableFilters.some(([column, value]) => column === "auth_id" && value === authUserId)
              ? { data: { id: 700 }, error: null }
              : { data: null, error: null };
          }
          const id = tableFilters.find(([column]) => column === "id")?.[1];
          const ownerId = tableFilters.find(([column]) => column === "owner_id")?.[1];
          return id === ownedOrganizationId && ownerId === 700
            ? { data: { id, name: "Owned organization", owner_id: 700 }, error: null }
            : { data: null, error: null };
        },
      };
      return chain;
    },
  };
}

test("Jobber organization authorization accepts only the authenticated owner's organization", async () => {
  const admin = accessAdmin("auth-owner-a", 11);
  const organization = await requireOwnedJobberOrganization(admin as any, "auth-owner-a", 11);
  assert.equal(organization.id, 11);
  assert.ok(admin.filters.some(([table, column, value]) => table === "organizations" && column === "owner_id" && value === 700));
});

test("cross-organization Jobber access is rejected before connection or record lookup", async () => {
  const admin = accessAdmin("auth-owner-a", 11);
  await assert.rejects(
    requireOwnedJobberOrganization(admin as any, "auth-owner-a", 22),
    /Organization not found/,
  );
});

test("Jobber connection and record queries always retain organization scope", () => {
  const connectionFilters: Array<[string, unknown]> = [];
  const connectionQuery: any = { eq(column: string, value: unknown) { connectionFilters.push([column, value]); return this; } };
  scopeJobberConnection(connectionQuery, 11).eq("status", "active");
  assert.deepEqual(connectionFilters, [["organization_id", 11], ["status", "active"]]);

  const recordFilters: Array<[string, unknown]> = [];
  const recordQuery: any = { eq(column: string, value: unknown) { recordFilters.push([column, value]); return this; } };
  scopeJobberRecords(recordQuery, 22, "jobs");
  assert.deepEqual(recordFilters, [["organization_id", 22], ["object_type", "jobs"]]);

  const auditFilters: Array<[string, unknown]> = [];
  const auditQuery: any = { eq(column: string, value: unknown) { auditFilters.push([column, value]); return this; } };
  scopeJobberAudit(auditQuery, 33);
  assert.deepEqual(auditFilters, [["organization_id", 33]]);
});
