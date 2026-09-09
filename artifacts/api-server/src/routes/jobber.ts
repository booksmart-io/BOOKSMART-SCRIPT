import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import {
  createJobberOAuthState,
  createJobberPkce,
  decryptJobberSecret,
  encryptJobberSecret,
  hashJobberOAuthState,
  verifyJobberOAuthState,
} from "../lib/jobber-oauth";
import { syncJobberReadOnly } from "../lib/jobber-sync";
import { evaluateJobberMonitoringPreview, jobberMonitoringEnabled, jobberMonitoringPreviewEnabled, type JobberMonitoringRecord } from "../lib/jobber-monitoring";
import { scheduleMonitoringEvaluation } from "../lib/monitoring-runner";
import { JobberConnectionError } from "../lib/jobber-client";
import { requireOwnedJobberOrganization, scopeJobberAudit, scopeJobberConnection, scopeJobberRecords } from "../lib/jobber-access";
import { writeJobberAuditEvent, type JobberAuditErrorCategory } from "../lib/jobber-audit";
import { evaluateJobberCpaEscalationPreview, jobberCpaSharingEligibility } from "../lib/jobber-cpa-escalation";
import { isApprovedCpa } from "../lib/cpa-access";
import { CPA_MONITORING_ENGAGEMENT_STATUSES } from "../lib/cpa-monitoring-access";

const router = Router();
type AdminClient = SupabaseClient<any, any, any>;

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

type AccountResponse = {
  data?: { account?: { id?: string; name?: string | null } };
  errors?: Array<{ message?: string }>;
};

const READ_ONLY_SCOPE_LABELS = [
  "Clients: read only",
  "Quotes: read only",
  "Jobs: read only",
  "Scheduled Items: read only",
  "Invoices: read only",
  "Jobber Payments: read only",
] as const;

function jobberConnectionHealth(connection: any) {
  if (!connection) return { state: "not_connected", action: "connect", message: null };
  if (connection.status === "error") {
    return {
      state: "reauthorization_required",
      action: "reconnect",
      message: "Your Jobber authorization has expired. Reconnect Jobber to resume synchronization.",
    };
  }
  if (connection.last_sync_error) {
    return {
      state: "degraded",
      action: "retry",
      message: connection.last_sync_error,
    };
  }
  return { state: "healthy", action: "none", message: null };
}

function jobberAuditErrorCategory(error: unknown): JobberAuditErrorCategory {
  if (error instanceof JobberConnectionError) return error.code;
  return error instanceof Error && /Jobber request|provider|GraphQL/i.test(error.message)
    ? "provider_error"
    : "local_error";
}

function adminClient(): AdminClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin client is not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

function config() {
  const clientId = process.env.JOBBER_CLIENT_ID;
  const clientSecret = process.env.JOBBER_CLIENT_SECRET;
  const redirectUri = process.env.JOBBER_REDIRECT_URI;
  const graphqlVersion = process.env.JOBBER_GRAPHQL_VERSION;
  if (!clientId || !clientSecret || !redirectUri || !graphqlVersion) {
    throw new Error("Jobber OAuth environment variables are not configured");
  }
  return { clientId, clientSecret, redirectUri, graphqlVersion };
}

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:5173").replace(/\/+$/, "");
}

function callbackRedirect(result: "connected" | "error", reason?: string): string {
  const url = new URL("/user/settings", appUrl());
  url.searchParams.set("jobber", result);
  if (reason) url.searchParams.set("reason", reason);
  return url.toString();
}

async function exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  const jobber = config();
  const response = await fetch("https://api.getjobber.com/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: jobber.clientId,
      client_secret: jobber.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: jobber.redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  const body = await response.json().catch(() => ({})) as Partial<TokenResponse> & {
    error?: string;
    error_description?: string;
  };
  if (
    !response.ok ||
    !body.access_token ||
    !body.refresh_token ||
    !Number.isFinite(body.expires_in) ||
    Number(body.expires_in) <= 0 ||
    body.token_type?.toLowerCase() !== "bearer"
  ) {
    throw new Error(body.error_description || body.error || "Jobber token exchange failed");
  }
  return body as TokenResponse;
}

async function readAccount(accessToken: string): Promise<{ id: string; name: string | null }> {
  const response = await fetch("https://api.getjobber.com/api/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-JOBBER-GRAPHQL-VERSION": config().graphqlVersion,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: "query BookSmartJobberAccount { account { id name } }" }),
  });
  const body = await response.json().catch(() => ({})) as AccountResponse;
  const account = body.data?.account;
  if (!response.ok || !account?.id || body.errors?.length) {
    throw new Error(body.errors?.[0]?.message || "Jobber account verification failed");
  }
  return { id: account.id, name: account.name ?? null };
}

async function disconnectRemote(accessToken: string): Promise<void> {
  const response = await fetch("https://api.getjobber.com/api/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-JOBBER-GRAPHQL-VERSION": config().graphqlVersion,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: "mutation BookSmartJobberDisconnect { appDisconnect { userErrors { message } } }",
    }),
  });
  const body = await response.json().catch(() => ({})) as {
    data?: { appDisconnect?: { userErrors?: Array<{ message?: string }> } };
    errors?: Array<{ message?: string }>;
  };
  const userErrors = body.data?.appDisconnect?.userErrors ?? [];
  if (!response.ok || body.errors?.length || userErrors.length) {
    throw new Error(
      body.errors?.[0]?.message || userErrors[0]?.message || "Jobber disconnect failed",
    );
  }
}

router.get("/integrations/jobber/connect", requireAuth, async (req, res) => {
  try {
    const authUserId = req.supabaseUserId!;
    const admin = adminClient();
    const organization = await requireOwnedJobberOrganization(admin, authUserId, req.query.organization_id);
    const { data: existingConnection, error: existingConnectionError } = await scopeJobberConnection((admin as any)
      .from("jobber_connections")
      .select("id"), organization.id)
      .eq("status", "active")
      .maybeSingle();
    if (existingConnectionError) throw existingConnectionError;
    if (existingConnection) throw new Error("jobber_connection_exists");
    const jobber = config();
    const state = createJobberOAuthState(authUserId, Number(organization.id));
    const pkce = createJobberPkce();
    const { error: stateError } = await admin.from("jobber_oauth_states").upsert({
      state_hash: hashJobberOAuthState(state),
      organization_id: organization.id,
      auth_user_id: authUserId,
      pkce_verifier_encrypted: encryptJobberSecret(pkce.verifier),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }, { onConflict: "organization_id" });
    if (stateError) throw stateError;
    await writeJobberAuditEvent(admin, {
      organizationId: organization.id,
      actorUserId: organization.owner_id,
      eventType: "connect_started",
      outcome: "started",
      metadata: { api_version: jobber.graphqlVersion },
    });

    const authorizationUrl = new URL("https://api.getjobber.com/api/oauth/authorize");
    authorizationUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: jobber.clientId,
      redirect_uri: jobber.redirectUri,
      state,
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
    }).toString();
    res.json({ authorization_url: authorizationUrl.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start Jobber connection";
    const status = message === "jobber_connection_exists"
      ? 409
      : message.includes("not found")
        ? 404
        : message.startsWith("Invalid")
          ? 400
          : 500;
    req.log?.error({ err: error }, "Jobber connect failed");
    res.status(status).json({
      error: message === "jobber_connection_exists" ? message : "jobber_connect_failed",
      message: message === "jobber_connection_exists"
        ? "Disconnect the current Jobber account before connecting another one"
        : message,
    });
  }
});

router.get("/integrations/jobber/callback", async (req, res) => {
  try {
    if (req.query.error) throw new Error("authorization_denied");
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const stateValue = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !stateValue) throw new Error("invalid_callback");

    const state = verifyJobberOAuthState(stateValue);
    const admin = adminClient();
    await requireOwnedJobberOrganization(admin, state.userId, state.organizationId);
    const { data: consumedState, error: stateError } = await admin
      .from("jobber_oauth_states")
      .delete()
      .eq("state_hash", hashJobberOAuthState(stateValue))
      .eq("organization_id", state.organizationId)
      .eq("auth_user_id", state.userId)
      .gt("expires_at", new Date().toISOString())
      .select("id,pkce_verifier_encrypted")
      .maybeSingle();
    if (stateError) throw stateError;
    if (!consumedState?.pkce_verifier_encrypted) throw new Error("invalid_callback");

    const tokens = await exchangeCode(
      code,
      decryptJobberSecret(consumedState.pkce_verifier_encrypted),
    );
    const account = await readAccount(tokens.access_token);
    const now = Date.now();
    const { data: previousConnection, error: previousConnectionError } = await scopeJobberConnection((admin as any)
      .from("jobber_connections").select("id,status"), state.organizationId).maybeSingle();
    if (previousConnectionError) throw previousConnectionError;
    const { data: savedConnection, error: connectionError } = await admin.from("jobber_connections").upsert({
      organization_id: state.organizationId,
      jobber_account_id: account.id,
      jobber_account_name: account.name,
      access_token_encrypted: encryptJobberSecret(tokens.access_token),
      refresh_token_encrypted: encryptJobberSecret(tokens.refresh_token),
      access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
      token_type: "Bearer",
      access_mode: "read_only",
      granted_scopes: [...READ_ONLY_SCOPE_LABELS],
      api_version: config().graphqlVersion,
      status: "active",
      verified_at: new Date(now).toISOString(),
      last_sync_error: null,
      disconnected_at: null,
      updated_at: new Date(now).toISOString(),
    }, { onConflict: "organization_id" }).select("id").single();
    if (connectionError) throw connectionError;
    const organization = await requireOwnedJobberOrganization(admin, state.userId, state.organizationId);
    await writeJobberAuditEvent(admin, {
      organizationId: state.organizationId,
      connectionId: savedConnection.id,
      actorUserId: organization.owner_id,
      eventType: previousConnection ? "reconnected" : "connected",
      outcome: "succeeded",
      metadata: { api_version: config().graphqlVersion },
    });
    res.redirect(303, callbackRedirect("connected"));
  } catch (error) {
    req.log?.error({ err: error }, "Jobber callback failed");
    const reason = error instanceof Error &&
      ["authorization_denied", "invalid_callback"].includes(error.message)
      ? error.message
      : "connection_failed";
    res.redirect(303, callbackRedirect("error", reason));
  }
});

router.get("/integrations/jobber/status", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await requireOwnedJobberOrganization(admin, req.supabaseUserId!, req.query.organization_id);
    const { data, error } = await scopeJobberConnection((admin as any)
      .from("jobber_connections")
      .select("jobber_account_id,jobber_account_name,access_mode,granted_scopes,api_version,api_version_warning,status,verified_at,last_successful_sync_at,last_full_sync_at,last_sync_error,connected_at,updated_at"), organization.id)
      .maybeSingle();
    if (error) throw error;
    res.json({ connected: data?.status === "active", connection: data ?? null, health: jobberConnectionHealth(data) });
  } catch (error) {
    req.log?.error({ err: error }, "Jobber status failed");
    res.status(500).json({ error: "jobber_status_failed", message: "Could not read Jobber status" });
  }
});

router.get("/integrations/jobber/sync-status", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await requireOwnedJobberOrganization(admin, req.supabaseUserId!, req.query.organization_id);
    const { data: connection, error: connectionError } = await scopeJobberConnection((admin as any).from("jobber_connections").select("id,status"), organization.id).maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection || connection.status !== "active") { res.status(404).json({ error: "jobber_connection_not_found" }); return; }
    const [{ data: states, error: stateError }, { data: records, error: recordError }] = await Promise.all([
      admin.from("jobber_sync_state").select("object_type,status,sync_mode,watermark,started_at,completed_at,last_error,records_seen,records_changed,pages_processed").eq("connection_id", connection.id).order("object_type"),
      admin.from("jobber_records").select("object_type,is_archived").eq("connection_id", connection.id),
    ]);
    if (stateError) throw stateError; if (recordError) throw recordError;
    const counts = (records ?? []).reduce((all: Record<string, { active: number; archived: number }>, row: any) => {
      all[row.object_type] ??= { active: 0, archived: 0 };
      all[row.object_type][row.is_archived ? "archived" : "active"] += 1;
      return all;
    }, {});
    res.json({ states: states ?? [], counts });
  } catch (error) {
    req.log?.error({ err: error }, "Jobber sync status failed");
    res.status(500).json({ error: "jobber_sync_status_failed", message: "Could not read Jobber sync status" });
  }
});

router.get("/integrations/jobber/audit", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await requireOwnedJobberOrganization(admin, req.supabaseUserId!, req.query.organization_id);
    const limit = Math.min(100, Math.max(10, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const { data, error } = await scopeJobberAudit((admin as any).from("jobber_audit_events")
      .select("id,connection_id,event_type,outcome,error_category,metadata,created_at"), organization.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ events: data ?? [], limit });
  } catch (error) {
    req.log?.error({ err: error }, "Jobber audit history load failed");
    res.status(error instanceof Error && error.message.includes("not found") ? 404 : 500).json({
      error: "jobber_audit_load_failed",
      message: "Could not load Jobber audit history",
    });
  }
});

router.get("/integrations/jobber/records", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await requireOwnedJobberOrganization(admin, req.supabaseUserId!, req.query.organization_id);
    const allowedTypes = new Set(["clients", "jobs", "scheduled_items", "quotes", "invoices", "payments"]);
    const objectType = typeof req.query.object_type === "string" ? req.query.object_type : "clients";
    if (!allowedTypes.has(objectType)) { res.status(400).json({ error: "invalid_jobber_object_type" }); return; }
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(req.query.page_size ?? "50"), 10) || 50));
    const from = (page - 1) * pageSize;
    const recordId = typeof req.query.record_id === "string" ? req.query.record_id.trim().slice(0, 300) : "";
    let recordsQuery = scopeJobberRecords((admin as any).from("jobber_records")
      .select("external_id,object_type,related_client_id,parent_id,record_number,status,title,starts_at,ends_at,source_created_at,source_updated_at,direct_url,amount,is_archived,archived_at,last_seen_at", { count: "exact" })
      , organization.id, objectType);
    if (recordId) recordsQuery = recordsQuery.eq("external_id", recordId);
    const { data, count, error } = await recordsQuery
      .order("source_updated_at", { ascending: false, nullsFirst: false }).range(from, from + pageSize - 1);
    if (error) throw error;
    res.json({ records: data ?? [], page, page_size: pageSize, total: count ?? 0, object_type: objectType });
  } catch (error) {
    req.log?.error({ err: error }, "Jobber records load failed");
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("Organization not found") || message.includes("User profile not found") ? 404
      : message.includes("Invalid organization_id") ? 400 : 500;
    res.status(status).json({ error: status === 404 ? "jobber_records_not_found" : status === 400 ? "invalid_request" : "jobber_records_load_failed",
      message: status === 404 ? "Organization or Jobber records were not found" : status === 400 ? "Invalid organization" : "Could not load Jobber records" });
  }
});

router.get("/integrations/jobber/monitoring-preview", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await requireOwnedJobberOrganization(admin, req.supabaseUserId!, req.query.organization_id);
    if (!jobberMonitoringPreviewEnabled(Number(organization.id))) {
      res.status(403).json({ error: "jobber_monitoring_not_enabled", message: "Jobber monitoring is not enabled for this organization." });
      return;
    }
    const { data: connection, error: connectionError } = await scopeJobberConnection((admin as any)
      .from("jobber_connections").select("id,status,last_successful_sync_at"), organization.id).eq("status", "active").maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) { res.status(404).json({ error: "jobber_connection_not_found" }); return; }
    const { data, error } = await admin.from("jobber_records")
      .select("external_id,object_type,record_number,status,title,amount,starts_at,ends_at,source_created_at,source_updated_at,direct_url,is_archived,payload")
      .eq("organization_id", organization.id)
      .eq("connection_id", connection.id)
      .in("object_type", ["jobs", "scheduled_items", "quotes", "invoices"]);
    if (error) throw error;
    const candidates = evaluateJobberMonitoringPreview((data ?? []) as JobberMonitoringRecord[]);
    res.json({
      dry_run: true,
      persisted: false,
      organization_id: Number(organization.id),
      last_successful_sync_at: connection.last_successful_sync_at,
      calculation_version: "jobber-operational-v1",
      candidate_count: candidates.length,
      candidates,
    });
  } catch (error) {
    req.log?.error({ err: error }, "Jobber monitoring preview failed");
    const message = error instanceof Error ? error.message : "Could not preview Jobber monitoring";
    const status = /organization|profile/i.test(message) ? 403 : 500;
    res.status(status).json({ error: "jobber_monitoring_preview_failed", message });
  }
});

router.get("/integrations/jobber/cpa-sharing", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await requireOwnedJobberOrganization(admin, req.supabaseUserId!, req.query.organization_id);
    const { data, error } = await admin.from("jobber_cpa_sharing_settings").select("enabled,consented_at,updated_at")
      .eq("organization_id", organization.id).maybeSingle();
    if (error) throw error;
    res.json({ organization_id: Number(organization.id), enabled: data?.enabled === true, consented_at: data?.consented_at ?? null, updated_at: data?.updated_at ?? null });
  } catch (error) {
    req.log?.error({ err: error }, "Jobber CPA sharing settings load failed");
    const status = /organization|profile/i.test(error instanceof Error ? error.message : "") ? 403 : 500;
    res.status(status).json({ error: "jobber_cpa_sharing_load_failed", message: "Could not load Jobber CPA sharing settings." });
  }
});

router.put("/integrations/jobber/cpa-sharing", requireAuth, async (req, res) => {
  try {
    if (typeof req.body?.enabled !== "boolean") { res.status(400).json({ error: "enabled_boolean_required" }); return; }
    const admin = adminClient();
    const organization = await requireOwnedJobberOrganization(admin, req.supabaseUserId!, req.body?.organization_id);
    const now = new Date().toISOString();
    const { data, error } = await admin.from("jobber_cpa_sharing_settings").upsert({
      organization_id: organization.id,
      enabled: req.body.enabled,
      consented_by_user_id: req.body.enabled ? organization.owner_id : null,
      consented_at: req.body.enabled ? now : null,
      updated_at: now,
    }, { onConflict: "organization_id" }).select("enabled,consented_at,updated_at").single();
    if (error) throw error;
    res.json({ organization_id: Number(organization.id), ...data, cpa_visibility_changed: false, persisted_escalations_created: 0 });
  } catch (error) {
    req.log?.error({ err: error }, "Jobber CPA sharing settings update failed");
    const status = /organization|profile/i.test(error instanceof Error ? error.message : "") ? 403 : 500;
    res.status(status).json({ error: "jobber_cpa_sharing_update_failed", message: "Could not update Jobber CPA sharing settings." });
  }
});

router.get("/integrations/jobber/cpa-escalation-preview", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await requireOwnedJobberOrganization(admin, req.supabaseUserId!, req.query.organization_id);
    const [{ data: connection, error: connectionError }, { data: setting, error: settingError }, { data: engagements, error: engagementError }] = await Promise.all([
      admin.from("jobber_connections").select("id,last_successful_sync_at").eq("organization_id", organization.id).eq("status", "active").maybeSingle(),
      admin.from("jobber_cpa_sharing_settings").select("enabled").eq("organization_id", organization.id).maybeSingle(),
      admin.from("orders").select("id,cpa_id,status").eq("client_authorized", true).eq("user_id", organization.owner_id).in("status", [...CPA_MONITORING_ENGAGEMENT_STATUSES]),
    ]);
    if (connectionError || settingError || engagementError) throw connectionError ?? settingError ?? engagementError;
    if (!connection) { res.status(404).json({ error: "jobber_connection_not_found" }); return; }
    const cpaIds = [...new Set((engagements ?? []).map(row => Number(row.cpa_id)).filter(value => Number.isSafeInteger(value) && value > 0))];
    const { data: cpas, error: cpaError } = cpaIds.length
      ? await admin.from("users").select("id,role,verification_status").in("id", cpaIds)
      : { data: [], error: null };
    if (cpaError) throw cpaError;
    const approvedCpaIds = new Set((cpas ?? []).filter(isApprovedCpa).map(row => Number(row.id)));
    const activeApprovedCpaEngagement = (engagements ?? []).some(row => approvedCpaIds.has(Number(row.cpa_id)));
    const { data: records, error: recordError } = await admin.from("jobber_records")
      .select("external_id,object_type,record_number,status,title,amount,starts_at,ends_at,source_created_at,source_updated_at,direct_url,is_archived,payload")
      .eq("organization_id", organization.id).eq("connection_id", connection.id).eq("object_type", "jobs");
    if (recordError) throw recordError;
    const candidates = evaluateJobberCpaEscalationPreview((records ?? []) as JobberMonitoringRecord[]);
    const eligibility = jobberCpaSharingEligibility({ consentEnabled: setting?.enabled === true, activeApprovedCpaEngagement });
    const candidateKeys = candidates.map(candidate => candidate.candidateKey);
    const { data: sharedTasks, error: sharedTaskError } = candidateKeys.length
      ? await admin.from("financial_tasks").select("source_id").eq("organization_id", organization.id)
        .eq("source", "signal").in("source_id", candidateKeys).in("status", ["open", "in_progress", "waiting"])
      : { data: [], error: null };
    if (sharedTaskError) throw sharedTaskError;
    const sharedKeys = new Set((sharedTasks ?? []).map(task => String(task.source_id)));
    res.json({
      dry_run: true, persisted: false, cpa_visibility_changed: false,
      organization_id: Number(organization.id), last_successful_sync_at: connection.last_successful_sync_at,
      consent_enabled: setting?.enabled === true, active_approved_cpa_engagement: activeApprovedCpaEngagement,
      eligible_for_future_escalation: eligibility.eligible, eligibility_reasons: eligibility.reasons,
      candidate_count: candidates.length, candidates: candidates.map(candidate => ({ ...candidate, shared: sharedKeys.has(candidate.candidateKey) })),
    });
  } catch (error) {
    req.log?.error({ err: error }, "Jobber CPA escalation preview failed");
    const status = /organization|profile/i.test(error instanceof Error ? error.message : "") ? 403 : 500;
    res.status(status).json({ error: "jobber_cpa_escalation_preview_failed", message: "Could not preview Jobber CPA escalation." });
  }
});

router.post("/integrations/jobber/cpa-escalations", requireAuth, async (req, res) => {
  try {
    const candidateKey = typeof req.body?.candidate_key === "string" ? req.body.candidate_key.trim() : "";
    if (!candidateKey || candidateKey.length > 300) { res.status(400).json({ error: "candidate_key_required" }); return; }
    const admin = adminClient();
    const organization = await requireOwnedJobberOrganization(admin, req.supabaseUserId!, req.body?.organization_id);
    const [{ data: connection, error: connectionError }, { data: setting, error: settingError }, { data: engagements, error: engagementError }] = await Promise.all([
      admin.from("jobber_connections").select("id").eq("organization_id", organization.id).eq("status", "active").maybeSingle(),
      admin.from("jobber_cpa_sharing_settings").select("enabled").eq("organization_id", organization.id).maybeSingle(),
      admin.from("orders").select("id,cpa_id,status").eq("client_authorized", true).eq("user_id", organization.owner_id)
        .in("status", [...CPA_MONITORING_ENGAGEMENT_STATUSES]).order("id", { ascending: false }),
    ]);
    if (connectionError || settingError || engagementError) throw connectionError ?? settingError ?? engagementError;
    if (!connection) { res.status(409).json({ error: "jobber_connection_required", message: "Connect Jobber before sharing an item." }); return; }
    const cpaIds = [...new Set((engagements ?? []).map(row => Number(row.cpa_id)).filter(value => Number.isSafeInteger(value) && value > 0))];
    const { data: cpas, error: cpaError } = cpaIds.length ? await admin.from("users").select("id,role,verification_status").in("id", cpaIds) : { data: [], error: null };
    if (cpaError) throw cpaError;
    const approvedCpaIds = new Set((cpas ?? []).filter(isApprovedCpa).map(row => Number(row.id)));
    const engagement = (engagements ?? []).find(row => approvedCpaIds.has(Number(row.cpa_id)));
    const eligibility = jobberCpaSharingEligibility({ consentEnabled: setting?.enabled === true, activeApprovedCpaEngagement: Boolean(engagement) });
    if (!eligibility.eligible || !engagement) { res.status(409).json({ error: "cpa_escalation_not_eligible", reasons: eligibility.reasons }); return; }

    const { data: records, error: recordError } = await admin.from("jobber_records")
      .select("external_id,object_type,record_number,status,title,amount,starts_at,ends_at,source_created_at,source_updated_at,direct_url,is_archived,payload")
      .eq("organization_id", organization.id).eq("connection_id", connection.id).eq("object_type", "jobs");
    if (recordError) throw recordError;
    const candidate = evaluateJobberCpaEscalationPreview((records ?? []) as JobberMonitoringRecord[]).find(item => item.candidateKey === candidateKey);
    if (!candidate) { res.status(409).json({ error: "candidate_no_longer_qualifies", message: "This Jobber item no longer meets the CPA review requirements." }); return; }
    const { data: existing, error: existingError } = await admin.from("financial_tasks").select("id,status")
      .eq("organization_id", organization.id).eq("source", "signal").eq("source_id", candidate.candidateKey)
      .in("status", ["open", "in_progress", "waiting"]).limit(1).maybeSingle();
    if (existingError) throw existingError;
    if (existing) { res.json({ task_id: Number(existing.id), already_shared: true, shared_with_cpa_id: Number(engagement.cpa_id) }); return; }

    const due = new Date(); due.setUTCDate(due.getUTCDate() + 3);
    const { data: task, error: taskError } = await admin.from("financial_tasks").insert({
      organization_id: organization.id, source: "signal", source_id: candidate.candidateKey, category: "jobber",
      priority: "high", title: candidate.title, description: candidate.description, due_date: due.toISOString().slice(0, 10),
      status: "open", cta_label: "Open in Jobber", cta_route: candidate.directUrl, requires_cpa: false,
      assigned_user_id: Number(engagement.cpa_id), assignment_role: "cpa",
      metadata: { provider: "jobber", candidate_key: candidate.candidateKey, source_ids: candidate.sourceIds, direct_url: candidate.directUrl, amount: candidate.amount, age_days: candidate.ageDays, accounting_effect: "none", shared_manually: true, engagement_id: engagement.id },
    }).select("id").single();
    if (taskError?.code === "23505") {
      const { data: concurrent } = await admin.from("financial_tasks").select("id").eq("organization_id", organization.id)
        .eq("source", "signal").eq("source_id", candidate.candidateKey).in("status", ["open", "in_progress", "waiting"]).limit(1).maybeSingle();
      if (concurrent) { res.json({ task_id: Number(concurrent.id), already_shared: true, shared_with_cpa_id: Number(engagement.cpa_id) }); return; }
    }
    if (taskError) throw taskError;
    const { error: eventError } = await admin.from("financial_task_events").insert({
      organization_id: organization.id, task_id: task.id, actor_user_id: organization.owner_id,
      event_type: "created", from_status: null, to_status: "open",
      metadata: { source: "jobber_cpa_manual_share", candidate_key: candidate.candidateKey, engagement_id: engagement.id, accounting_effect: "none" },
    });
    if (eventError) throw eventError;
    res.status(201).json({ task_id: Number(task.id), already_shared: false, shared_with_cpa_id: Number(engagement.cpa_id) });
  } catch (error) {
    req.log?.error({ err: error }, "Jobber CPA escalation share failed");
    const status = /organization|profile/i.test(error instanceof Error ? error.message : "") ? 403 : 500;
    res.status(status).json({ error: "jobber_cpa_escalation_share_failed", message: "Could not share this Jobber item with the CPA." });
  }
});

router.post("/integrations/jobber/sync", requireAuth, async (req, res) => {
  let auditContext: { admin: AdminClient; organizationId: number; actorUserId: number; connectionId: number; mode: "full" | "incremental" } | null = null;
  try {
    const admin = adminClient();
    const organization = await requireOwnedJobberOrganization(admin, req.supabaseUserId!, req.body?.organization_id);
    const { data: connection, error } = await scopeJobberConnection((admin as any).from("jobber_connections").select("*"), organization.id).eq("status", "active").maybeSingle();
    if (error) throw error; if (!connection) { res.status(404).json({ error: "jobber_connection_not_found" }); return; }
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { error: staleError } = await admin.from("jobber_sync_state").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      last_error: "Sync interrupted before completion; the next run will resume safely.",
      updated_at: new Date().toISOString(),
    }).eq("connection_id", connection.id).eq("status", "running").lt("updated_at", staleBefore);
    if (staleError) throw staleError;
    const { data: running } = await admin.from("jobber_sync_state").select("id").eq("connection_id", connection.id).eq("status", "running").limit(1).maybeSingle();
    if (running) { res.status(409).json({ error: "jobber_sync_in_progress", message: "A Jobber sync is already running" }); return; }
    const requestedMode = req.body?.mode;
    if (requestedMode != null && requestedMode !== "full" && requestedMode !== "incremental") { res.status(400).json({ error: "invalid_sync_mode" }); return; }
    const mode = requestedMode ?? (connection.last_full_sync_at ? "incremental" : "full");
    auditContext = { admin, organizationId: organization.id, actorUserId: organization.owner_id, connectionId: connection.id, mode };
    await writeJobberAuditEvent(admin, {
      organizationId: organization.id,
      connectionId: connection.id,
      actorUserId: organization.owner_id,
      eventType: "sync_started",
      outcome: "started",
      metadata: { sync_mode: mode },
    });
    const result = await syncJobberReadOnly(admin, connection, requestedMode);
    const now = new Date().toISOString();
    await admin.from("jobber_connections").update({ last_successful_sync_at: now, last_full_sync_at: result.mode === "full" ? now : connection.last_full_sync_at, last_sync_error: null, updated_at: now }).eq("id", connection.id);
    await writeJobberAuditEvent(admin, {
      organizationId: organization.id,
      connectionId: connection.id,
      actorUserId: organization.owner_id,
      eventType: "sync_completed",
      outcome: "succeeded",
      metadata: {
        sync_mode: result.mode,
        records_scanned: Object.values(result.counts).reduce((sum, count) => sum + count, 0),
        records_changed: Object.values(result.changed).reduce((sum, count) => sum + count, 0),
        object_counts: result.counts,
      },
    });
    if (jobberMonitoringEnabled(Number(organization.id))) scheduleMonitoringEvaluation(admin, organization.id, "jobber_sync_completed");
    res.json({ ok: true, ...result, completed_at: now });
  } catch (error) {
    req.log?.error({ err: error }, "Jobber sync failed");
    try {
      const organizationId = Number(req.body?.organization_id);
      if (Number.isSafeInteger(organizationId) && organizationId > 0) {
        const connectionError = error instanceof JobberConnectionError ? error : null;
        const safeMessage = connectionError?.message ?? "Jobber synchronization failed. Your imported records are safe; try again.";
        await adminClient().from("jobber_connections").update({
          last_sync_error: safeMessage.slice(0, 500),
          status: connectionError?.code === "reauthorization_required" ? "error" : "active",
          updated_at: new Date().toISOString(),
        }).eq("organization_id", organizationId);
      }
    } catch (recordError) {
      req.log?.warn({ err: recordError }, "Could not record Jobber sync failure");
    }
    if (auditContext) {
      try {
        const category = jobberAuditErrorCategory(error);
        await writeJobberAuditEvent(auditContext.admin, {
          organizationId: auditContext.organizationId,
          connectionId: auditContext.connectionId,
          actorUserId: auditContext.actorUserId,
          eventType: category === "reauthorization_required" ? "authorization_expired" : "sync_failed",
          outcome: category === "reauthorization_required" ? "attention_required" : "failed",
          errorCategory: category,
          metadata: { sync_mode: auditContext.mode },
        });
      } catch (auditError) {
        req.log?.error({ err: auditError }, "Could not record Jobber sync audit failure");
      }
    }
    const connectionError = error instanceof JobberConnectionError ? error : null;
    res.status(connectionError?.code === "reauthorization_required" ? 401 : connectionError?.code === "temporarily_unavailable" ? 503 : 500).json({
      error: connectionError?.code ?? "jobber_sync_failed",
      message: connectionError?.message ?? "Jobber synchronization failed. Your imported records are safe; try again.",
      reconnect_required: connectionError?.code === "reauthorization_required",
    });
  }
});

router.post("/integrations/jobber/disconnect", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organization = await requireOwnedJobberOrganization(admin, req.supabaseUserId!, req.body?.organization_id);
    const { data, error } = await scopeJobberConnection((admin as any)
      .from("jobber_connections")
      .select("id,access_token_encrypted"), organization.id)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: "jobber_connection_not_found" });
      return;
    }

    let revoked = false;
    let warning: string | null = null;
    try {
      if (!data.access_token_encrypted) throw new Error("Stored Jobber access token is unavailable");
      await disconnectRemote(decryptJobberSecret(data.access_token_encrypted));
      revoked = true;
    } catch (remoteError) {
      warning = "Jobber disconnect could not be confirmed. Local credentials were removed.";
      req.log?.warn(
        { err: remoteError, organizationId: organization.id },
        "Jobber remote disconnect failed; continuing local disconnect",
      );
    }

    const { data: purgeResult, error: purgeError } = await admin.rpc("purge_jobber_organization_data", {
      requested_organization_id: organization.id,
    });
    if (purgeError) throw purgeError;
    res.json({ ok: true, connected: false, revoked, warning, deleted: purgeResult });
  } catch (error) {
    req.log?.error({ err: error }, "Jobber disconnect failed");
    const message = error instanceof Error ? error.message : "";
    const status = /organization|profile/i.test(message) ? 403 : 500;
    res.status(status).json({ error: status === 403 ? "forbidden" : "jobber_disconnect_failed", message: "Could not disconnect Jobber" });
  }
});

export default router;
