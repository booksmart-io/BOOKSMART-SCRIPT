import { createClient } from "@supabase/supabase-js";
import type { NextFunction, Request, Response } from "express";
import { isApprovedCpa, type CpaAccessRow } from "../lib/cpa-access";

const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";

declare global {
  namespace Express {
    interface Request {
      cpaUserId?: number;
    }
  }
}

export async function requireApprovedCpa(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.supabaseUserId) {
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
    const { data, error } = await admin
      .from("users")
      .select("id,role,verification_status")
      .eq("auth_id", req.supabaseUserId)
      .maybeSingle();

    if (error) throw error;
    const cpa = data as CpaAccessRow | null;
    if (!isApprovedCpa(cpa)) {
      res.status(403).json({ error: "forbidden", message: "Approved CPA access required" });
      return;
    }

    req.cpaUserId = cpa.id;
    next();
  } catch {
    res.status(503).json({ error: "auth_service_unavailable" });
  }
}
