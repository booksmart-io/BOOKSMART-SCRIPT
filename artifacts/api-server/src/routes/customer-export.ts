import { Router, type RequestHandler } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { requireAuth } from "../middlewares/require-auth";
import { buildCustomerExport, ExportError } from "../lib/customer-export";

const compress = promisify(gzip);
export async function assertExportAccountActive(client: SupabaseClient, authId: string) {
  const { data, error } = await client.auth.admin.getUserById(authId);
  const user = data?.user as (typeof data.user & { banned_until?: string; deleted_at?: string }) | undefined;
  if (error || !user || user.id !== authId || user.deleted_at ||
    (user.banned_until && Date.parse(user.banned_until) > Date.now())) throw new ExportError("export_forbidden", 403);
}

export function customerExportRouter(options: {
  authenticate?: RequestHandler;
  client?: () => SupabaseClient;
  build?: typeof buildCustomerExport;
} = {}) {
  const router = Router();
  const active = new Set<string>();
  router.post("/account/export", options.authenticate ?? requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const authId = req.supabaseUserId;
    if (!authId) { res.status(401).json({ error: "unauthorized" }); return; }
    // No caller-supplied account, company, table or path selectors are accepted.
    if (Object.keys(req.query).length || (req.body && Object.keys(req.body).length)) {
      res.status(400).json({ error: "export_does_not_accept_selectors" }); return;
    }
    if (active.has(authId) || active.size >= 2) {
      res.setHeader("Retry-After", "30"); res.status(429).json({ error: "export_busy" }); return;
    }
    active.add(authId);
    try {
      const client = options.client ? options.client() : (() => {
        const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new ExportError("export_unavailable");
        return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) } });
      })();
      await assertExportAccountActive(client, authId);
      const result = await (options.build ?? buildCustomerExport)(client, authId);
      // Recheck ownership and account status after the potentially long collection.
      await assertExportAccountActive(client, authId);
      const { data: profile, error } = await client.from("users").select("id,role").eq("auth_id", authId).maybeSingle();
      if (error || !profile || profile.role !== "user" || profile.id !== result.records.users[0].id) throw new ExportError("export_forbidden", 403);
      const { data: organizations, error: orgError } = await client.from("organizations").select("id").eq("owner_id", profile.id);
      const original = result.records.organizations.map(row => String(row.id)).sort();
      if (orgError || !organizations || JSON.stringify(organizations.map(row => String(row.id)).sort()) !== JSON.stringify(original))
        throw new ExportError("export_data_changed", 409);
      const bytes = await compress(Buffer.from(JSON.stringify(result)));
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="booksmart-account-export-${new Date().toISOString().slice(0, 10)}.json.gz"`);
      res.send(bytes);
    } catch (error) {
      // Never serialize provider/transport errors: they can contain privileged headers.
      const safe = error instanceof ExportError ? error : new ExportError("export_unavailable");
      res.status(safe.status).json({ error: safe.code });
    } finally { active.delete(authId); }
  });
  return router;
}

export default customerExportRouter();
