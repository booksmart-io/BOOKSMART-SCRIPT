import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";

/**
 * Must run after requireAuth (relies on req.supabaseUserId). Confirms the
 * caller's `users.role` is "admin" before allowing access to admin-only
 * account/plan/token management routes.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authUserId = req.supabaseUserId;
  if (!authUserId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceRoleKey) {
    res.status(500).json({ error: "server_misconfigured" });
    return;
  }

  try {
    const admin = createClient(SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false } });
    const { data: userRow } = await admin
      .from("users")
      .select("role")
      .eq("auth_id", authUserId)
      .maybeSingle();

    if (!userRow || userRow.role !== "admin") {
      res.status(403).json({ error: "forbidden", message: "Admin access required" });
      return;
    }

    next();
  } catch {
    res.status(503).json({ error: "auth_service_unavailable" });
  }
}
