import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

declare global {
  namespace Express {
    interface Request {
      supabaseUserId?: string;
      authDurationMs?: number;
    }
  }
}

const authClient = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

export function authenticatedSubject(claims: unknown): string | null {
  if (!claims || typeof claims !== "object") return null;
  const subject = (claims as { sub?: unknown }).sub;
  return typeof subject === "string" && subject.trim().length > 0 ? subject : null;
}

/**
 * Verifies the Supabase JWT using Supabase's supported claims verifier.
 * Asymmetric signing keys are verified locally with a cached JWKS; legacy
 * symmetric tokens safely fall back to verification by the Auth server.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized", message: "Missing bearer token" });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Empty bearer token" });
    return;
  }

  const authStartedAt = performance.now();
  try {
    if (!authClient) {
      res.status(503).json({ error: "auth_service_unavailable", message: "Supabase is not configured" });
      return;
    }

    const { data, error } = await authClient.auth.getClaims(token);
    if (error) {
      res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
      return;
    }

    const subject = authenticatedSubject(data?.claims);
    if (!subject) {
      res.status(401).json({ error: "unauthorized", message: "Could not resolve user" });
      return;
    }

    req.supabaseUserId = subject;
    next();
  } catch {
    res.status(503).json({ error: "auth_service_unavailable", message: "Could not verify token" });
  } finally {
    req.authDurationMs = performance.now() - authStartedAt;
  }
}
