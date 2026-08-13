import { Router } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { loadConnectionStatus } from "../lib/connection-status";

const router = Router();
const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://pvppwmkswnluidlwnnck.supabase.co";

function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Connection status is unavailable.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

router.get("/connections/status", requireAuth, async (req, res) => {
  const organizationId = Number(req.query.organization_id);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
    res.status(400).json({ error: "organization_required" }); return;
  }
  try {
    const admin = adminClient();
    const { data: user } = await admin.from("users").select("id").eq("auth_id", req.supabaseUserId!).maybeSingle();
    if (!user) { res.status(403).json({ error: "forbidden" }); return; }
    const { data: organization } = await admin.from("organizations").select("id").eq("id", organizationId).eq("owner_id", user.id).maybeSingle();
    if (!organization) { res.status(403).json({ error: "forbidden" }); return; }
    res.json(await loadConnectionStatus(admin, organizationId, Number(user.id)));
  } catch (error) {
    res.status(503).json({ error: "connection_status_unavailable", message: error instanceof Error ? error.message : "Connection status is unavailable." });
  }
});

export default router;
