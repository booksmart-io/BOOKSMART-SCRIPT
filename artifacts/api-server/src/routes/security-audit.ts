import { Router } from "express";
import { requireAuth } from "../middlewares/require-auth";
import { securityAuditAdminClient, writeSecurityAuditEvent } from "../lib/security-audit";

const router = Router();
router.post("/security-audit/session", requireAuth, async (req, res) => {
  const event = req.body?.event;
  if (!(["signed_in", "signed_out"] as const).includes(event)) { res.status(400).json({ error: "invalid_session_event" }); return; }
  try {
    await writeSecurityAuditEvent(securityAuditAdminClient(), { eventType: event === "signed_in" ? "session_signed_in" : "session_signed_out",
      outcome: "succeeded", actorAuthId: req.supabaseUserId, source: "web", metadata: { session_event: event },
      eventKey: `${req.supabaseUserId}:${req.supabaseSessionId ?? "session"}:${event}` });
    res.status(204).end();
  } catch { res.status(503).json({ error: "security_audit_unavailable" }); }
});

router.post("/security-audit/cpa-access", requireAuth, async (req, res) => {
  const orderId = Number(req.body?.order_id); const action = req.body?.action;
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !["authorized", "revoked"].includes(action)) { res.status(400).json({ error: "invalid_audit_event" }); return; }
  try {
    const admin = securityAuditAdminClient();
    const { data: user, error: userError } = await admin.from("users").select("id").eq("auth_id", req.supabaseUserId!).maybeSingle();
    if (userError || !user) { res.status(403).json({ error: "forbidden" }); return; }
    const { data: order, error } = await admin.from("orders").select("id,cpa_id,client_authorized").eq("id", orderId).eq("user_id", user.id).maybeSingle();
    if (error || !order || Boolean(order.client_authorized) !== (action === "authorized")) { res.status(409).json({ error: "audit_state_mismatch" }); return; }
    await writeSecurityAuditEvent(admin, { eventType: "cpa_access_change", outcome: "succeeded", actorAuthId: req.supabaseUserId,
      target: `cpa:${order.cpa_id}`, metadata: { action }, eventKey: `${req.supabaseUserId}:${orderId}:${action}:${Date.now()}` });
    res.status(204).end();
  } catch { res.status(503).json({ error: "security_audit_unavailable" }); }
});
export default router;
