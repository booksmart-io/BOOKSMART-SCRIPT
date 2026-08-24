import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { canTransitionSignal, canTransitionTask, isFinancialDataChangeEvent, taskEventForStatus, validTaskAssignmentRole, validTaskDueDate, validTaskPriority, type MonitoringSignalStatus, type MonitoringTaskStatus } from "../lib/monitoring";
import { CPA_MONITORING_ENGAGEMENT_STATUSES } from "../lib/cpa-monitoring-access";
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
    if (!canTransitionSignal(existing.status as MonitoringSignalStatus, action as "dismiss" | "resolve" | "reopen")) {
      res.status(409).json({ error: "invalid_signal_transition", from_status: existing.status, action }); return;
    }
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

router.post("/monitoring/tasks", requireAuth, async (req, res) => {
  const orgId = organizationId(req.body?.organization_id);
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const requestId = typeof req.body?.request_id === "string" ? req.body.request_id.trim() : "";
  const priority = req.body?.priority ?? "medium";
  const dueDate = req.body?.due_date ?? null;
  if (!orgId || !title || title.length > 160 || description.length > 2000 || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)
    || !validTaskPriority(priority) || !validTaskDueDate(dueDate)) {
    res.status(400).json({ error: "invalid_task" }); return;
  }
  try {
    const admin = adminClient();
    const owner = await ownership(admin, req.supabaseUserId!, orgId);
    if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
    const sourceId = `user:${requestId}`;
    const { data: existing } = await admin.from("financial_tasks").select("*").eq("organization_id", orgId)
      .eq("source", "user").eq("source_id", sourceId).maybeSingle();
    if (existing) { res.status(200).json({ task: existing, idempotent: true }); return; }
    const now = new Date().toISOString();
    const { data, error } = await admin.from("financial_tasks").insert({
      organization_id: orgId, source: "user", source_id: sourceId, category: "general", priority,
      title, description: description || title, due_date: dueDate, status: "open", requires_cpa: false,
      assigned_user_id: owner.userId, assignment_role: "owner", metadata: { created_by: "owner" },
    }).select("*").single();
    if (error) throw error;
    const { error: eventError } = await admin.from("financial_task_events").insert({
      organization_id: orgId, task_id: data.id, actor_user_id: owner.userId, event_type: "created",
      from_status: null, to_status: "open", metadata: { source: "owner" }, created_at: now,
    });
    if (eventError) throw eventError;
    res.status(201).json({ task: data, idempotent: false });
  } catch (error) {
    res.status(503).json({ error: "task_creation_unavailable", message: error instanceof Error ? error.message : "Could not create task." });
  }
});

router.patch("/monitoring/tasks/:id/manage", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const orgId = organizationId(req.body?.organization_id);
  const priority = req.body?.priority;
  const dueDate = req.body?.due_date;
  const assignmentRole = req.body?.assignment_role;
  if (!Number.isSafeInteger(id) || id <= 0 || !orgId || !validTaskPriority(priority)
    || !validTaskDueDate(dueDate) || !validTaskAssignmentRole(assignmentRole)) {
    res.status(400).json({ error: "invalid_task_management" }); return;
  }
  try {
    const admin = adminClient();
    const owner = await ownership(admin, req.supabaseUserId!, orgId);
    if (!owner) { res.status(403).json({ error: "forbidden" }); return; }
    const { data: existing } = await admin.from("financial_tasks").select("id,status,priority,due_date,assignment_role,assigned_user_id,metadata")
      .eq("id", id).eq("organization_id", orgId).maybeSingle();
    if (!existing) { res.status(404).json({ error: "task_not_found" }); return; }
    let assignedUserId: number | null = assignmentRole === "owner" ? owner.userId : null;
    let engagementId: number | null = null;
    if (assignmentRole === "cpa") {
      const { data: engagement, error: engagementError } = await admin.from("orders").select("id,cpa_id")
        .eq("user_id", owner.userId).in("status", [...CPA_MONITORING_ENGAGEMENT_STATUSES])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (engagementError) throw engagementError;
      if (!engagement?.cpa_id) { res.status(409).json({ error: "active_cpa_required" }); return; }
      assignedUserId = Number(engagement.cpa_id); engagementId = Number(engagement.id);
    }
    const now = new Date().toISOString();
    const metadata = { ...(existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {}), managed_by: "owner", engagement_id: engagementId };
    const { data, error } = await admin.from("financial_tasks").update({
      priority, due_date: dueDate, assignment_role: assignmentRole, assigned_user_id: assignedUserId,
      requires_cpa: assignmentRole === "cpa" ? true : undefined, metadata, updated_at: now,
    }).eq("id", id).eq("organization_id", orgId).select("*").single();
    if (error) throw error;
    const { error: eventError } = await admin.from("financial_task_events").insert({
      organization_id: orgId, task_id: id, actor_user_id: owner.userId, event_type: "updated",
      from_status: existing.status, to_status: existing.status,
      note: typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : null,
      metadata: { changes: { priority: [existing.priority, priority], due_date: [existing.due_date, dueDate], assignment_role: [existing.assignment_role, assignmentRole] } },
    });
    if (eventError) throw eventError;
    res.json({ task: data });
  } catch (error) {
    res.status(503).json({ error: "task_management_unavailable", message: error instanceof Error ? error.message : "Could not manage task." });
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
