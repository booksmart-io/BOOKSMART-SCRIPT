import { createClient } from "@supabase/supabase-js";
import { Router } from "express";
import { canTransitionOrder, isOrderStatus, type OrderStatus } from "../lib/cpa-access";
import { requireApprovedCpa } from "../middlewares/require-approved-cpa";
import { requireAuth } from "../middlewares/require-auth";

const router = Router();
const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";

function adminClient() {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

router.use("/cpa/orders", requireAuth, requireApprovedCpa);

router.patch("/cpa/orders/:orderId", async (req, res) => {
  const orderId = Number(req.params["orderId"]);
  const { status, amount } = req.body ?? {};
  if (!Number.isSafeInteger(orderId) || orderId <= 0 || !isOrderStatus(status)) {
    res.status(400).json({ error: "invalid_request", message: "A valid order ID and status are required" });
    return;
  }
  if (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) {
    res.status(400).json({ error: "invalid_request", message: "Amount must be a non-negative number" });
    return;
  }

  try {
    const admin = adminClient();
    const { data: order, error: findError } = await admin
      .from("orders")
      .select("id,cpa_id,status,amount")
      .eq("id", orderId)
      .eq("cpa_id", req.cpaUserId!)
      .maybeSingle();
    if (findError) throw findError;
    if (!order) {
      res.status(404).json({ error: "order_not_found" });
      return;
    }

    const currentStatus = order.status as OrderStatus;
    if (!isOrderStatus(currentStatus) || !canTransitionOrder(currentStatus, status)) {
      res.status(409).json({ error: "invalid_status_transition", message: `Cannot change an order from ${currentStatus} to ${status}` });
      return;
    }

    const changes: { status: OrderStatus; amount?: number } = { status };
    if (amount !== undefined) changes.amount = amount;
    const { data: updated, error: updateError } = await admin
      .from("orders")
      .update(changes)
      .eq("id", orderId)
      .eq("cpa_id", req.cpaUserId!)
      .select("id,status,amount")
      .single();
    if (updateError) throw updateError;

    res.json({ order: updated });
  } catch (error) {
    res.status(502).json({ error: "cpa_order_update_error", message: String(error) });
  }
});

export default router;
