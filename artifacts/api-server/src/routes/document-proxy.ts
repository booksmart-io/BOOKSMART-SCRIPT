import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";

const router = Router();

const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";


router.post("/document-signed-url", requireAuth, async (req, res) => {
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceRoleKey) {
    res.status(500).json({ error: "missing_service_role_key" });
    return;
  }

  const filePath: string | undefined = (req.body ?? {})["path"];
  if (!filePath || typeof filePath !== "string") {
    res.status(400).json({ error: "missing_path" });
    return;
  }

  const userId = req.supabaseUserId!;
  // Keep percent-encoding intact (do NOT decode) so createSignedUrl receives a
  // valid URL-safe path. Spaces encoded as %20 are decoded by Supabase server.
  const normalizedPath = filePath.replace(/^\/+/, "");
  // Folder owner check: decode just the first segment (UUID has no special chars)
  const folderOwner = decodeURIComponent(normalizedPath.split("/")[0]);
  if (folderOwner !== userId) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  try {
    // Use the admin client (service role key bypasses all RLS/policies)
    const adminClient = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false },
    });

    console.log("[doc-signed-url] creating signed URL for path:", normalizedPath);
    const { data, error } = await adminClient.storage
      .from("documents")
      .createSignedUrl(normalizedPath, 3600);

    if (error || !data?.signedUrl) {
      const isNotFound = error?.message?.toLowerCase().includes("not found");
      console.log("[doc-signed-url] error:", error?.message);
      res.status(isNotFound ? 404 : 502).json({ error: "sign_failed", message: error?.message });
      return;
    }

    res.json({ signedUrl: data.signedUrl });
  } catch (e) {
    res.status(502).json({ error: "sign_request_failed", message: String(e) });
  }
});

export default router;
