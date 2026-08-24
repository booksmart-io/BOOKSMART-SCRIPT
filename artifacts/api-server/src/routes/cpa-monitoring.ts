import { createClient } from "@supabase/supabase-js";
import { Router } from "express";
import { CPA_MONITORING_ENGAGEMENT_STATUSES, isCpaRelevantTask, validateCpaTaskCollaboration } from "../lib/cpa-monitoring-access";
import { requireApprovedCpa } from "../middlewares/require-approved-cpa";
import { requireAuth } from "../middlewares/require-auth";

const router = Router();
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://pvppwmkswnluidlwnnck.supabase.co";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("CPA monitoring is unavailable.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

router.get("/cpa/monitoring/tasks", requireAuth, requireApprovedCpa, async (req, res) => {
  try {
    const admin = adminClient();
    const { data: engagements, error: engagementError } = await admin.from("orders")
      .select("user_id").eq("cpa_id", req.cpaUserId!).in("status", [...CPA_MONITORING_ENGAGEMENT_STATUSES]);
    if (engagementError) throw engagementError;
    const userIds = [...new Set((engagements ?? []).map(row => Number(row.user_id)).filter(Number.isSafeInteger))];
    if (!userIds.length) { res.json({ tasks: [], generated_at: new Date().toISOString() }); return; }

    const [{ data: organizations, error: organizationError }, { data: users, error: userError }] = await Promise.all([
      admin.from("organizations").select("id,owner_id,name").in("owner_id", userIds),
      admin.from("users").select("id,first_name,last_name,email").in("id", userIds),
    ]);
    if (organizationError || userError) throw organizationError ?? userError;
    const orgIds = (organizations ?? []).map(row => Number(row.id)).filter(Number.isSafeInteger);
    if (!orgIds.length) { res.json({ tasks: [], generated_at: new Date().toISOString() }); return; }

    const { data: tasks, error: taskError } = await admin.from("financial_tasks")
      .select("id,organization_id,title,description,category,priority,status,due_date,requires_cpa,assignment_role,assigned_user_id,created_at,updated_at")
      .in("organization_id", orgIds).in("status", ["open", "in_progress", "waiting"])
      .order("due_date", { ascending: true, nullsFirst: false }).limit(200);
    if (taskError) throw taskError;
    const orgById = new Map((organizations ?? []).map(org => [Number(org.id), org]));
    const userById = new Map((users ?? []).map(user => [Number(user.id), user]));
    const relevantTasks = (tasks ?? []).filter(task => isCpaRelevantTask(task)
      && (task.assignment_role !== "cpa" || task.assigned_user_id == null || Number(task.assigned_user_id) === req.cpaUserId));
    const taskIds = relevantTasks.map(task => Number(task.id));
    const { data: collaborationEvents, error: eventError } = taskIds.length
      ? await admin.from("financial_task_events").select("id,task_id,event_type,note,created_at")
        .in("task_id", taskIds).in("event_type", ["cpa_acknowledged", "cpa_note"])
        .order("created_at", { ascending: false }).limit(500)
      : { data: [], error: null };
    if (eventError) throw eventError;
    const eventsByTask = new Map<number, typeof collaborationEvents>();
    for (const event of collaborationEvents ?? []) {
      const taskEvents = eventsByTask.get(Number(event.task_id)) ?? [];
      taskEvents.push(event); eventsByTask.set(Number(event.task_id), taskEvents);
    }
    const visibleTasks = relevantTasks.map(task => {
      const org = orgById.get(Number(task.organization_id));
      const owner = org ? userById.get(Number(org.owner_id)) : null;
      const clientName = [owner?.first_name, owner?.last_name].filter(Boolean).join(" ") || owner?.email || "Client";
      return { ...task, organization_name: org?.name ?? "Business", client_name: clientName, collaboration_events: eventsByTask.get(Number(task.id)) ?? [] };
    });
    res.json({ tasks: visibleTasks, generated_at: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ error: "cpa_monitoring_unavailable", message: error instanceof Error ? error.message : "CPA monitoring unavailable." });
  }
});

router.post("/cpa/monitoring/tasks/:id/events", requireAuth, requireApprovedCpa, async (req, res) => {
  const taskId = Number(req.params.id);
  const collaboration = validateCpaTaskCollaboration(req.body?.action, req.body?.note);
  if (!Number.isSafeInteger(taskId) || taskId <= 0 || !collaboration.valid) {
    res.status(400).json({ error: collaboration.valid ? "invalid_task" : collaboration.error }); return;
  }
  try {
    const admin = adminClient();
    const { data: task, error: taskError } = await admin.from("financial_tasks")
      .select("id,organization_id,status,requires_cpa,assignment_role,assigned_user_id")
      .eq("id", taskId).in("status", ["open", "in_progress", "waiting"]).maybeSingle();
    if (taskError) throw taskError;
    if (!task || !isCpaRelevantTask(task)
      || (task.assignment_role === "cpa" && task.assigned_user_id != null && Number(task.assigned_user_id) !== req.cpaUserId)) {
      res.status(404).json({ error: "task_not_found" }); return;
    }
    const { data: organization, error: orgError } = await admin.from("organizations")
      .select("owner_id").eq("id", task.organization_id).maybeSingle();
    if (orgError) throw orgError;
    if (!organization) { res.status(404).json({ error: "task_not_found" }); return; }
    const { data: engagement, error: engagementError } = await admin.from("orders").select("id")
      .eq("cpa_id", req.cpaUserId!).eq("user_id", organization.owner_id)
      .in("status", [...CPA_MONITORING_ENGAGEMENT_STATUSES]).limit(1).maybeSingle();
    if (engagementError) throw engagementError;
    if (!engagement) { res.status(403).json({ error: "forbidden" }); return; }
    const eventType = collaboration.action === "acknowledge" ? "cpa_acknowledged" : "cpa_note";
    const { data: event, error: eventError } = await admin.from("financial_task_events").insert({
      organization_id: task.organization_id, task_id: task.id, actor_user_id: req.cpaUserId!,
      event_type: eventType, from_status: task.status, to_status: task.status, note: collaboration.note,
      metadata: { actor_role: "cpa", engagement_id: engagement.id, status_changed: false },
    }).select("id,event_type,note,created_at").single();
    if (eventError) throw eventError;
    res.status(201).json({ event });
  } catch (error) {
    res.status(503).json({ error: "cpa_collaboration_unavailable", message: error instanceof Error ? error.message : "Could not save CPA activity." });
  }
});

export default router;
