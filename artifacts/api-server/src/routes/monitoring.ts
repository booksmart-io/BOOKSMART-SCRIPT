import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { canTransitionTask, isFinancialDataChangeEvent, taskEventForStatus, type MonitoringTaskStatus } from "../lib/monitoring";
import { scheduleMonitoringEvaluation } from "../lib/monitoring-runner";

const router = Router();
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://pvppwmkswnluidlwnnck.supabase.co";
const TASK_STATUSES = ["open", "in_progress", "waiting", "completed", "dismissed"] as const;

function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Monitoring persistence is unavailable.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

async function ownership(admin: SupabaseClient, authId: string, organizationId: number) {
  const { data: user } = await admin.from("users").select("id").eq("auth_id", authId).maybeSingle();
  if (!user) return null;
  const { data: org } = await admin.from("organizations").select("id").eq("id", organizationId).eq("owner_id", user.id).maybeSingle();
  return org ? { userId: Number(user.id), organizationId: Number(org.id) } : null;
}

function organizationId(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

router.get("/monitoring", requireAuth, async (req, res) => {
  const orgId = organizationId(req.query.organization_id);
  if (!orgId) { res.status(400).json({ error: "organization_required" }); return; }
  try {
    const admin = adminClient();
    const owner = await ownership(admin, req.supabaseUserId!, orgId);
    if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
    const now = new Date().toISOString();
    await admin.from("business_signals").update({ status: "expired", updated_at: now })
      .eq("organization_id", orgId).eq("status", "active").lt("expires_at", now);
    const [signalsResult, tasksResult] = await Promise.all([
      admin.from("business_signals").select("*").eq("organization_id", orgId)
        .order("detected_at", { ascending: false }).limit(100),
      admin.from("financial_tasks").select("*").eq("organization_id", orgId)
        .order("created_at", { ascending: false }).limit(100),
    ]);
    if (signalsResult.error || tasksResult.error) {
      res.status(500).json({ error: "monitoring_load_failed" }); return;
    }
    res.json({
      signals: signalsResult.data ?? [], tasks: tasksResult.data ?? [],
      generated_at: now, source: "accounting_engine_projection",
    });
  } catch (error) {
    res.status(503).json({ error: "monitoring_unavailable", message: error instanceof Error ? error.message : "Monitoring unavailable." });
  }
});

router.post("/monitoring/financial-data-changed", requireAuth, async (req, res) => {
  const orgId = organizationId(req.body?.organization_id);
  const eventType = req.body?.event_type;
  if (!orgId || !isFinancialDataChangeEvent(eventType)) {
    res.status(400).json({ error: "invalid_financial_data_event" }); return;
  }
  try {
    const admin = adminClient();
    const owner = await ownership(admin, req.supabaseUserId!, orgId);
    if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
    scheduleMonitoringEvaluation(admin, orgId, eventType);
    res.status(202).json({ accepted: true, organization_id: orgId, event_type: eventType });
  } catch (error) {
    res.status(503).json({ error: "monitoring_schedule_failed", message: error instanceof Error ? error.message : "Monitoring could not be scheduled." });
  }
});

router.patch("/monitoring/signals/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const orgId = organizationId(req.body?.organization_id);
  const action = String(req.body?.action ?? "");
  if (!Number.isSafeInteger(id) || id <= 0 || !orgId || !["dismiss", "resolve", "reopen"].includes(action)) {
    res.status(400).json({ error: "invalid_request" }); return;
  }
  try {
    const admin = adminClient();
    const owner = await ownership(admin, req.supabaseUserId!, orgId);
    if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
    const { data: existing } = await admin.from("business_signals").select("id,status")
      .eq("id", id).eq("organization_id", orgId).maybeSingle();
    if (!existing) { res.status(404).json({ error: "signal_not_found" }); return; }
    const now = new Date().toISOString();
    const status = action === "dismiss" ? "dismissed" : action === "resolve" ? "resolved" : "active";
    const changes = {
      status, updated_at: now,
      dismissed_at: status === "dismissed" ? now : null,
      resolved_at: status === "resolved" ? now : null,
      condition_cleared_at: null,
    };
    const { data, error } = await admin.from("business_signals").update(changes)
      .eq("id", id).eq("organization_id", orgId).select("*").single();
    if (error) { res.status(409).json({ error: "signal_update_failed", message: error.message }); return; }
    res.json({ signal: data });
  } catch (error) {
    res.status(503).json({ error: "monitoring_unavailable", message: error instanceof Error ? error.message : "Monitoring unavailable." });
  }
});

router.patch("/monitoring/tasks/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const orgId = organizationId(req.body?.organization_id);
  const status = String(req.body?.status ?? "") as MonitoringTaskStatus;
  if (!Number.isSafeInteger(id) || id <= 0 || !orgId || !TASK_STATUSES.includes(status)) {
    res.status(400).json({ error: "invalid_request" }); return;
  }
  try {
    const admin = adminClient();
    const owner = await ownership(admin, req.supabaseUserId!, orgId);
    if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
    const { data: existing } = await admin.from("financial_tasks").select("id,status")
      .eq("id", id).eq("organization_id", orgId).maybeSingle();
    if (!existing) { res.status(404).json({ error: "task_not_found" }); return; }
    const fromStatus = existing.status as MonitoringTaskStatus;
    if (!canTransitionTask(fromStatus, status)) {
      res.status(409).json({ error: "invalid_task_transition", from_status: fromStatus, to_status: status }); return;
    }
    const now = new Date().toISOString();
    const { data, error } = await admin.from("financial_tasks").update({
      status, updated_at: now, completed_at: status === "completed" ? now : null,
      dismissed_at: status === "dismissed" ? now : null,
    }).eq("id", id).eq("organization_id", orgId).select("*").single();
    if (error) { res.status(409).json({ error: "task_update_failed", message: error.message }); return; }
    await admin.from("financial_task_events").insert({
      organization_id: orgId, task_id: id, actor_user_id: owner.userId,
      event_type: taskEventForStatus(status), from_status: fromStatus, to_status: status,
      note: typeof req.body?.note === "string" ? req.body.note.slice(0, 1000) : null,
    });
    res.json({ task: data });
  } catch (error) {
    res.status(503).json({ error: "monitoring_unavailable", message: error instanceof Error ? error.message : "Monitoring unavailable." });
  }
});

router.get("/monitoring/tasks/:id/events", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const orgId = organizationId(req.query.organization_id);
  if (!Number.isSafeInteger(id) || id <= 0 || !orgId) {
    res.status(400).json({ error: "invalid_request" }); return;
  }
  try {
    const admin = adminClient();
    const owner = await ownership(admin, req.supabaseUserId!, orgId);
    if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
    const { data: task } = await admin.from("financial_tasks").select("id")
      .eq("id", id).eq("organization_id", orgId).maybeSingle();
    if (!task) { res.status(404).json({ error: "task_not_found" }); return; }
    const { data, error } = await admin.from("financial_task_events").select("*")
      .eq("task_id", id).eq("organization_id", orgId).order("created_at", { ascending: false }).limit(100);
    if (error) { res.status(500).json({ error: "task_history_load_failed" }); return; }
    res.json({ events: data ?? [] });
  } catch (error) {
    res.status(503).json({ error: "monitoring_unavailable", message: error instanceof Error ? error.message : "Monitoring unavailable." });
  }
});

export default router;
