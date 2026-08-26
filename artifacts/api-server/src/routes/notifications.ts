import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";

const router = Router();
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://pvppwmkswnluidlwnnck.supabase.co";
const adminClient = (): SupabaseClient => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Notifications are unavailable.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
};

async function ownerOrganizationIds(admin: SupabaseClient, authId: string) {
  const { data: user, error: userError } = await admin.from("users").select("id").eq("auth_id", authId).maybeSingle();
  if (userError) throw userError;
  if (!user) return [];
  const { data, error } = await admin.from("organizations").select("id").eq("owner_id", user.id);
  if (error) throw error;
  return (data ?? []).map(row => Number(row.id));
}

router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const admin = adminClient();
    const organizationIds = await ownerOrganizationIds(admin, req.supabaseUserId!);
    if (!organizationIds.length) { res.json({ notifications: [], unread_count: 0 }); return; }
    const [{ data, error }, { count, error: countError }] = await Promise.all([
      admin.from("account_activity_notifications").select("id,organization_id,event_type,title,description,amount,route,metadata,read_at,created_at").in("organization_id", organizationIds).order("created_at", { ascending: false }).limit(50),
      admin.from("account_activity_notifications").select("id", { count: "exact", head: true }).in("organization_id", organizationIds).is("read_at", null),
    ]);
    if (error || countError) throw error ?? countError;
    const notifications = (data ?? []).map(row => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const transactionId = Number(metadata.transaction_id);
      const taskId = Number(metadata.task_id);
      const assignmentId = Number(metadata.assignment_id);
      let route = row.route;
      if (row.event_type.startsWith("transaction_") && Number.isSafeInteger(transactionId)) route = `/user/reports?tab=transactions&transaction_id=${transactionId}`;
      if (row.event_type.startsWith("task_") && Number.isSafeInteger(taskId)) route = `/user/tasks?task_id=${taskId}`;
      if (row.event_type.startsWith("job_cost_") && Number.isSafeInteger(assignmentId)) route = `/user/tasks?assignment_id=${assignmentId}`;
      if (row.event_type === "job_match_found" && Number.isSafeInteger(transactionId)) route = `/user/tasks?transaction_id=${transactionId}`;
      return { ...row, route };
    });
    res.json({ notifications, unread_count: count ?? 0 });
  } catch (error) {
    console.error("notifications:list", error);
    res.status(500).json({ error: "notifications_unavailable", message: "Could not load account activity." });
  }
});

router.patch("/notifications/read", requireAuth, async (req, res) => {
  const requestedIds = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0) : [];
  try {
    const admin = adminClient();
    const organizationIds = await ownerOrganizationIds(admin, req.supabaseUserId!);
    if (!organizationIds.length) { res.json({ updated: 0 }); return; }
    let query = admin.from("account_activity_notifications").update({ read_at: new Date().toISOString() }).in("organization_id", organizationIds).is("read_at", null);
    if (requestedIds.length) query = query.in("id", requestedIds);
    const { data, error } = await query.select("id");
    if (error) throw error;
    res.json({ updated: data?.length ?? 0 });
  } catch (error) {
    console.error("notifications:read", error);
    res.status(500).json({ error: "notification_update_failed", message: "Could not update notifications." });
  }
});

export default router;
