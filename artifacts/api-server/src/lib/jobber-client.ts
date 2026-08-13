import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptJobberSecret, encryptJobberSecret } from "./jobber-oauth";

type AdminClient = SupabaseClient<any, any, any>;
type Connection = {
  id: number; organization_id: number; access_token_encrypted: string;
  refresh_token_encrypted: string; access_token_expires_at: string;
  refresh_generation: number; api_version: string;
};
type GraphqlBody<T> = { data?: T; errors?: Array<{ message?: string; extensions?: { code?: string } }>; extensions?: any };

export type JobberConnectionErrorCode =
  | "reauthorization_required"
  | "temporarily_unavailable"
  | "configuration_error";

export class JobberConnectionError extends Error {
  constructor(
    public readonly code: JobberConnectionErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "JobberConnectionError";
  }
}

export function classifyJobberRefreshFailure(
  status: number,
  body: { error?: string; error_description?: string } = {},
): JobberConnectionError {
  const providerCode = body.error?.toLowerCase();
  const providerMessage = body.error_description?.toLowerCase() ?? "";
  if (status === 400 && (providerCode === "invalid_grant" || /expired|revoked|invalid.*refresh/.test(providerMessage))) {
    return new JobberConnectionError(
      "reauthorization_required",
      "Your Jobber authorization has expired. Reconnect Jobber to resume synchronization.",
    );
  }
  return new JobberConnectionError(
    "temporarily_unavailable",
    "Jobber is temporarily unavailable. Your connection and imported records are safe; try again shortly.",
    status === 429 || status >= 500,
  );
}

export function isJobberThrottle(errors: GraphqlBody<unknown>["errors"]): boolean {
  return errors?.some((error) => error.extensions?.code === "THROTTLED" || /throttl/i.test(error.message ?? "")) ?? false;
}

const refreshes = new Map<number, Promise<Connection>>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function refresh(admin: AdminClient, connection: Connection): Promise<Connection> {
  const active = refreshes.get(connection.id);
  if (active) return active;
  const pending = (async () => {
    const clientId = process.env.JOBBER_CLIENT_ID;
    const clientSecret = process.env.JOBBER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new JobberConnectionError("configuration_error", "Jobber synchronization is not configured on this server.");
    }
    let response: Response | null = null;
    let body: any = {};
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch("https://api.getjobber.com/api/oauth/token", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: decryptJobberSecret(connection.refresh_token_encrypted) }),
        });
        body = await response.json().catch(() => ({}));
        if (response.ok) break;
        const failure = classifyJobberRefreshFailure(response.status, body);
        if (!failure.retryable || attempt === 2) throw failure;
      } catch (error) {
        if (error instanceof JobberConnectionError && !error.retryable) throw error;
        if (attempt === 2) {
          throw error instanceof JobberConnectionError
            ? error
            : new JobberConnectionError("temporarily_unavailable", "Jobber is temporarily unavailable. Your connection and imported records are safe; try again shortly.", true);
        }
      }
      await sleep(Math.min(2000, 300 * (2 ** attempt)));
    }
    if (!response?.ok || !body.access_token || !body.refresh_token || !Number.isFinite(Number(body.expires_in)) || Number(body.expires_in) <= 0) {
      throw response
        ? classifyJobberRefreshFailure(response.status, body)
        : new JobberConnectionError("temporarily_unavailable", "Jobber is temporarily unavailable. Your connection and imported records are safe; try again shortly.", true);
    }
    const next = {
      access_token_encrypted: encryptJobberSecret(body.access_token),
      refresh_token_encrypted: encryptJobberSecret(body.refresh_token),
      access_token_expires_at: new Date(Date.now() + Number(body.expires_in) * 1000).toISOString(),
      refresh_generation: connection.refresh_generation + 1,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from("jobber_connections").update(next)
      .eq("id", connection.id).eq("refresh_generation", connection.refresh_generation).select("*").maybeSingle();
    if (error) throw error;
    if (data) return data as Connection;
    const { data: winner, error: winnerError } = await admin.from("jobber_connections").select("*").eq("id", connection.id).single();
    if (winnerError) throw winnerError;
    return winner as Connection;
  })().finally(() => refreshes.delete(connection.id));
  refreshes.set(connection.id, pending);
  return pending;
}

export async function jobberQuery<T>(admin: AdminClient, original: Connection, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let connection = original;
  if (new Date(connection.access_token_expires_at).getTime() < Date.now() + 60_000) connection = await refresh(admin, connection);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch("https://api.getjobber.com/api/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${decryptJobberSecret(connection.access_token_encrypted)}`, "X-JOBBER-GRAPHQL-VERSION": connection.api_version, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (response.status === 401 && attempt === 0) { connection = await refresh(admin, connection); continue; }
    if (response.status === 429 && attempt < 3) { await sleep(Math.min(4000, 500 * (2 ** attempt))); continue; }
    const body = await response.json().catch(() => ({})) as GraphqlBody<T>;
    const throttled = isJobberThrottle(body.errors);
    if (throttled && attempt < 3) { await sleep(Math.min(4000, 500 * (2 ** attempt))); continue; }
    const warning = response.headers.get("x-jobber-graphql-warning") || body.extensions?.warnings?.map((w: any) => w.message ?? String(w)).join("; ") || null;
    if (warning) await admin.from("jobber_connections").update({ api_version_warning: warning, updated_at: new Date().toISOString() }).eq("id", connection.id);
    if (!response.ok || body.errors?.length || !body.data) throw new Error(body.errors?.[0]?.message || `Jobber request failed (${response.status})`);
    return body.data;
  }
  throw new Error("Jobber request retry limit reached");
}

export function jobberContentHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export type { Connection as JobberConnection };
