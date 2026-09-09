import { Router, type RequestHandler } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { AccountDeletionError, deleteSelfAccount, type AccountDeletionDependencies } from "../lib/account-deletion";

export function accountDeletionRouter(options: { authenticate?: RequestHandler; client?: () => SupabaseClient; dependencies?: AccountDeletionDependencies } = {}) {
  const router = Router();
  const active = new Set<string>();
  router.delete("/account", options.authenticate ?? requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const authId = req.supabaseUserId;
    if (!authId) { res.status(401).json({ error: "unauthorized" }); return; }
    if (active.has(authId)) { res.status(409).json({ error: "deletion_in_progress" }); return; }
    active.add(authId);
    try {
      const admin = options.client ? options.client() : (() => {
        const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new AccountDeletionError("account_delete_unavailable");
        return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
          fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
        } });
      })();
      const result = await deleteSelfAccount(admin, authId, req.body?.email, req.body?.confirmation, options.dependencies);
      res.json(result);
    } catch (error) {
      const safe = error instanceof AccountDeletionError ? error : new AccountDeletionError("account_delete_unavailable");
      res.status(safe.status).json({ error: safe.code });
    } finally { active.delete(authId); }
  });
  return router;
}
export default accountDeletionRouter();
