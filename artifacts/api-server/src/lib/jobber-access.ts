import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient<any, any, any>;
type FilterQuery = { eq(column: string, value: unknown): any };

export async function requireOwnedJobberOrganization(
  admin: AdminClient,
  authUserId: string,
  requestedOrganizationId: unknown,
) {
  const organizationId = Number(requestedOrganizationId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
    throw new Error("Invalid organization_id");
  }

  const { data: user, error: userError } = await admin
    .from("users")
    .select("id")
    .eq("auth_id", authUserId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) throw new Error("User profile not found");

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id,name,owner_id")
    .eq("id", organizationId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (organizationError) throw organizationError;
  if (!organization) throw new Error("Organization not found");
  return organization;
}

export function scopeJobberConnection(query: FilterQuery, organizationId: number): any {
  return query.eq("organization_id", organizationId);
}

export function scopeJobberRecords(query: FilterQuery, organizationId: number, objectType: string): any {
  return query.eq("organization_id", organizationId).eq("object_type", objectType);
}

export function scopeJobberAudit(query: FilterQuery, organizationId: number): any {
  return query.eq("organization_id", organizationId);
}
