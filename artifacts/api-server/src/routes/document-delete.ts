import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";

const router = Router();
const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";

router.delete("/document-delete", requireAuth, async (req, res) => {
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceRoleKey) {
    res.status(500).json({ error: "missing_service_role_key" });
    return;
  }

  const storagePath = (req.query["storagePath"] as string) ?? "";
  if (!storagePath) {
    res.status(400).json({ error: "missing_storage_path" });
    return;
  }

  const userId = req.supabaseUserId!;
  if (!storagePath.startsWith(userId + "/")) {
    res.status(403).json({ error: "forbidden", message: "File does not belong to you" });
    return;
  }

  try {
    const adminClient = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { error } = await adminClient.storage.from("documents").remove([storagePath]);
    if (error) {
      console.error("[document-delete] storage error:", error.message);
      res.status(502).json({ error: "delete_failed", message: error.message });
      return;
    }
    console.log("[document-delete] deleted:", storagePath);
    res.json({ ok: true });
  } catch (e) {
    console.error("[document-delete] error:", e);
    res.status(502).json({ error: "delete_error", message: String(e) });
  }
});

export default router;
