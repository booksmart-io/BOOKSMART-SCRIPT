import { Request, Response, NextFunction } from "express";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

declare global {
  namespace Express {
    interface Request {
      supabaseUserId?: string;
    }
  }
}

/**
 * Verifies the Supabase JWT from the Authorization header by calling
 * Supabase's /auth/v1/user endpoint. Rejects unauthenticated requests
 * with 401 before they can consume any paid-provider resources.
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

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      res.status(503).json({ error: "auth_service_unavailable", message: "Supabase is not configured" });
      return;
    }

    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });

    if (!response.ok) {
      res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
      return;
    }

    const user = await response.json() as { id?: string };
    if (!user?.id) {
      res.status(401).json({ error: "unauthorized", message: "Could not resolve user" });
      return;
    }

    req.supabaseUserId = user.id;
    next();
  } catch {
    res.status(503).json({ error: "auth_service_unavailable", message: "Could not verify token" });
  }
}
