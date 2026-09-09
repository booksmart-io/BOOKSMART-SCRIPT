import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "./quickbooks-oauth";
import { fetchWithProviderRetry } from "./provider-retry";

type AdminClient = SupabaseClient<any, any, any>;

type QuickBooksConnection = {
  organization_id: number;
  realm_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  access_token_expires_at: string | null;
  status: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
};

export const QUICKBOOKS_SYNC_ENTITY_TYPES = [
  "Account",
  "Purchase",
  "Bill",
  "Invoice",
  "Payment",
  "Deposit",
] as const;

export function quickBooksSyncEnabled(): boolean {
  return (process.env.QUICKBOOKS_SYNC_ENABLED ?? "false").toLowerCase() === "true";
}

function quickBooksConfig() {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("QuickBooks OAuth credentials are not configured");
  const production = (process.env.QUICKBOOKS_ENVIRONMENT ?? "sandbox").toLowerCase() === "production";
  return {
    clientId,
    clientSecret,
    apiBase: production ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com",
  };
}

export function shouldRefreshQuickBooksToken(expiresAt: string | null, now = Date.now()): boolean {
  if (!expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  return !Number.isFinite(expiry) || expiry <= now + 5 * 60 * 1000;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const qb = quickBooksConfig();
  const response = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${qb.clientId}:${qb.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const body = await response.json().catch(() => ({})) as Partial<TokenResponse> & { error_description?: string };
  if (!response.ok || !body.access_token || !body.refresh_token || !body.expires_in) {
    throw new Error(body.error_description || "QuickBooks token refresh failed");
  }
  return body as TokenResponse;
}

export async function getQuickBooksAccess(admin: AdminClient, organizationId: number) {
  const { data, error } = await admin.from("quickbooks_connections")
    .select("organization_id,realm_id,access_token_encrypted,refresh_token_encrypted,access_token_expires_at,status")
    .eq("organization_id", organizationId).maybeSingle();
  if (error) throw error;
  const connection = data as QuickBooksConnection | null;
  if (!connection || connection.status !== "active") throw new Error("QuickBooks is not connected");
  if (!connection.access_token_encrypted || !connection.refresh_token_encrypted) {
    throw new Error("QuickBooks connection tokens are unavailable");
  }

  if (!shouldRefreshQuickBooksToken(connection.access_token_expires_at)) {
    return { accessToken: decryptToken(connection.access_token_encrypted), realmId: connection.realm_id, refreshed: false };
  }

  const tokens = await refreshAccessToken(decryptToken(connection.refresh_token_encrypted));
  const now = Date.now();
  const { error: updateError } = await admin.from("quickbooks_connections").update({
    access_token_encrypted: encryptToken(tokens.access_token),
    refresh_token_encrypted: encryptToken(tokens.refresh_token),
    access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
    refresh_token_expires_at: tokens.x_refresh_token_expires_in
      ? new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString() : undefined,
    updated_at: new Date(now).toISOString(),
  }).eq("organization_id", organizationId).eq("status", "active");
  if (updateError) throw updateError;
  return { accessToken: tokens.access_token, realmId: connection.realm_id, refreshed: true };
}

export function extractQuickBooksQueryEntities(body: unknown, entityType: string): Record<string, unknown>[] {
  if (!body || typeof body !== "object") return [];
  const queryResponse = (body as { QueryResponse?: Record<string, unknown> }).QueryResponse;
  const entities = queryResponse?.[entityType];
  return Array.isArray(entities) ? entities.filter((value): value is Record<string, unknown> => !!value && typeof value === "object") : [];
}

export function quickBooksPageQuery(entityType: string, startPosition: number, pageSize = 1000): string {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(entityType) || !Number.isSafeInteger(startPosition) || startPosition < 1 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new Error("Invalid QuickBooks page request");
  return `select * from ${entityType} startposition ${startPosition} maxresults ${pageSize}`;
}

export function hasAnotherQuickBooksPage(rowCount: number, pageSize: number): boolean {
  return rowCount === pageSize;
}

async function queryQuickBooks(accessToken: string, realmId: string, entityType: string) {
  const qb = quickBooksConfig();
  const pageSize = 1000;
  const all: Record<string, unknown>[] = [];
  for (let startPosition = 1, pages = 0; ; startPosition += pageSize) {
    if (++pages > 10_000) throw new Error(`QuickBooks ${entityType} pagination limit exceeded`);
    const url = new URL(`${qb.apiBase}/v3/company/${encodeURIComponent(realmId)}/query`);
    url.searchParams.set("query", quickBooksPageQuery(entityType, startPosition, pageSize));
    url.searchParams.set("minorversion", "75");
    const response = await fetchWithProviderRetry(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    const body = await response.json().catch(() => ({})) as Record<string, unknown> & {
      Fault?: { Error?: Array<{ Message?: string; Detail?: string }> };
    };
    if (!response.ok) {
      const fault = body.Fault?.Error?.[0];
      throw new Error(fault?.Detail || fault?.Message || `QuickBooks ${entityType} query failed`);
    }
    const page = extractQuickBooksQueryEntities(body, entityType);
    all.push(...page);
    if (!hasAnotherQuickBooksPage(page.length, pageSize)) return all;
  }
}

function refName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name : null;
}

export function normalizeQuickBooksStagedEntity(
  organizationId: number,
  entityType: string,
  entity: Record<string, unknown>,
) {
  const externalId = typeof entity.Id === "string" || typeof entity.Id === "number" ? String(entity.Id) : "";
  if (!externalId) throw new Error(`QuickBooks ${entityType} entity is missing Id`);
  const total = entity.TotalAmt ?? entity.CurrentBalance ?? entity.Amount;
  const amount = typeof total === "number" ? total : typeof total === "string" && total.trim() ? Number(total) : null;
  const displayName = [entity.Name, entity.DocNumber, refName(entity.EntityRef), refName(entity.CustomerRef), refName(entity.VendorRef)]
    .find((value) => typeof value === "string" && value.trim());
  return {
    organization_id: organizationId,
    entity_type: entityType,
    external_id: externalId,
    display_name: typeof displayName === "string" ? displayName : null,
    transaction_date: typeof entity.TxnDate === "string" ? entity.TxnDate : null,
    total_amount: Number.isFinite(amount) ? amount : null,
    payload: entity,
    source_updated_at: typeof (entity.MetaData as { LastUpdatedTime?: unknown } | undefined)?.LastUpdatedTime === "string"
      ? (entity.MetaData as { LastUpdatedTime: string }).LastUpdatedTime : null,
    staged_at: new Date().toISOString(),
  };
}

export async function syncQuickBooksToStaging(admin: AdminClient, organizationId: number) {
  if (!quickBooksSyncEnabled()) throw new Error("QuickBooks synchronization is disabled");
  const syncStartedAt = new Date().toISOString();
  await admin.from("quickbooks_connections").update({
    last_sync_status: "running", last_sync_error: null, updated_at: syncStartedAt,
  }).eq("organization_id", organizationId);

  try {
    const { accessToken, realmId, refreshed } = await getQuickBooksAccess(admin, organizationId);
    const counts: Record<string, number> = {};
    for (const entityType of QUICKBOOKS_SYNC_ENTITY_TYPES) {
      const entities = await queryQuickBooks(accessToken, realmId, entityType);
      const rows = entities.map((entity) => normalizeQuickBooksStagedEntity(organizationId, entityType, entity));
      if (rows.length) {
        const { error } = await admin.from("quickbooks_staged_entities").upsert(rows, {
          onConflict: "organization_id,entity_type,external_id",
        });
        if (error) throw error;
      }
      counts[entityType] = rows.length;
    }
    const completedAt = new Date().toISOString();
    const { error: statusError } = await admin.from("quickbooks_connections").update({
      last_synced_at: completedAt,
      last_sync_status: "completed",
      last_sync_error: null,
      updated_at: completedAt,
    }).eq("organization_id", organizationId);
    if (statusError) throw statusError;
    return { counts, refreshed, synced_at: completedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "QuickBooks synchronization failed";
    await admin.from("quickbooks_connections").update({
      last_sync_status: "failed",
      last_sync_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("organization_id", organizationId);
    throw error;
  }
}
