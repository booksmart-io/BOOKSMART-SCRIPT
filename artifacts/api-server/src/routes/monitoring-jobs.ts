import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { requireAdmin } from "../middlewares/require-admin";
import { runMonitoring } from "../lib/monitoring-runner";
import { monitoringIntervalMinutes, scheduledMonitoringHealth, scheduledRunKey, validMonitoringSecret } from "../lib/monitoring-scheduler";
import { reconcileScheduledJobberOrganization } from "../lib/jobber-reconciliation";

const router = Router();

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Monitoring database configuration is unavailable.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function idempotencyHeader(req: { headers: Record<string, unknown> }) {
  const value = req.headers["x-idempotency-key"];
  return typeof value === "string" && value.length >= 8 && value.length <= 200 ? value : undefined;
}

router.post("/admin/monitoring/run", requireAuth, requireAdmin, async (req, res) => {
  const organizationId = req.body?.organization_id == null ? undefined : Number(req.body.organization_id);
  if (organizationId !== undefined && (!Number.isSafeInteger(organizationId) || organizationId <= 0)) {
    res.status(400).json({ error: "invalid_organization" }); return;
  }
  try {
    const run = await runMonitoring(adminClient(), "manual", organizationId, { idempotencyKey: idempotencyHeader(req) });
    res.json({ run });
  } catch (error) {
    res.status(500).json({ error: "monitoring_run_failed", message: error instanceof Error ? error.message : "Monitoring run failed." });
  }
});

router.get("/admin/monitoring/runs", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await adminClient().from("monitoring_runs").select("*").order("started_at", { ascending: false }).limit(50);
    if (error) throw error;
    res.json({ runs: data ?? [] });
  } catch (error) {
    res.status(500).json({ error: "monitoring_runs_load_failed", message: error instanceof Error ? error.message : "Could not load runs." });
  }
});

router.get("/admin/monitoring/config", requireAuth, requireAdmin, async (_req, res) => {
  const intervalMinutes = monitoringIntervalMinutes(process.env.MONITORING_INTERVAL_MINUTES);
  const leaseMinutes = 30;
  try {
    const { data: latest, error } = await adminClient().from("monitoring_runs").select("status,started_at,completed_at")
      .eq("trigger_type", "scheduled").order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    res.json({
      interval_minutes: intervalMinutes, execution_lease_minutes: leaseMinutes,
      scheduler_health: scheduledMonitoringHealth({ secretConfigured: Boolean(process.env.MONITORING_CRON_SECRET?.trim()), intervalMinutes, leaseMinutes, latest }),
      notifications_enabled: false, transaction_writes_enabled: false,
    });
  } catch (error) {
    res.status(500).json({ error: "monitoring_config_load_failed", message: error instanceof Error ? error.message : "Could not load monitoring configuration." });
  }
});

router.get("/admin/monitoring/financial-summary-comparisons", requireAuth, requireAdmin, async (req, res) => {
  const classification = typeof req.query.classification === "string" ? req.query.classification : null;
  if (classification && !["match", "expected_source_difference", "unexpected_mismatch"].includes(classification)) {
    res.status(400).json({ error: "invalid_classification" }); return;
  }
  try {
    let query = adminClient().from("financial_summary_shadow_comparisons").select("*").order("created_at", { ascending: false }).limit(100);
    if (classification) query = query.eq("classification", classification);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ comparisons: data ?? [] });
  } catch (error) {
    res.status(500).json({ error: "shadow_comparisons_load_failed", message: error instanceof Error ? error.message : "Could not load comparisons." });
  }
});

router.get("/admin/monitoring/financial-summary-rollout-events", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await adminClient().from("financial_summary_rollout_events").select("*").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ events: data ?? [] });
  } catch (error) {
    res.status(500).json({ error: "rollout_events_load_failed", message: error instanceof Error ? error.message : "Could not load rollout events." });
  }
});

router.post("/monitoring/scheduled-run", async (req, res) => {
  if (!validMonitoringSecret(req.headers["x-monitoring-secret"] as string | undefined, process.env.MONITORING_CRON_SECRET)) {
    res.status(401).json({ error: "unauthorized" }); return;
  }
  try {
    const intervalMinutes = monitoringIntervalMinutes(process.env.MONITORING_INTERVAL_MINUTES);
    const requestedKey = typeof req.headers["x-monitoring-run-id"] === "string" ? req.headers["x-monitoring-run-id"] : null;
    const idempotencyKey = scheduledRunKey(intervalMinutes, Date.now(), requestedKey);
    const admin = adminClient();
    const run = await runMonitoring(admin, "scheduled", undefined, {
      idempotencyKey,
      beforeEvaluateOrganization: (organizationId) => reconcileScheduledJobberOrganization(admin, organizationId),
    });
    res.json({ run, interval_minutes: intervalMinutes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Monitoring run failed.";
    const overlapping = message.includes("monitoring_runs_single_scheduled_run_idx") || message.includes("duplicate key");
    res.status(overlapping ? 409 : 500).json({ error: overlapping ? "monitoring_run_in_progress" : "monitoring_run_failed", message });
  }
});

export default router;
