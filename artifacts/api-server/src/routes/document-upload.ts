import { Router } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { PLAN_LIMITS, getUserTier, countDocumentUploadsThisMonth } from "../lib/plan-limits";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";

router.post("/document-upload", requireAuth, upload.single("file"), async (req, res) => {
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceRoleKey) {
    res.status(500).json({ error: "missing_service_role_key" });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "no_file" });
    return;
  }

  const userId = req.supabaseUserId!;
  const originalName: string = (req.body as Record<string, string>)["originalName"] ?? file.originalname ?? "upload";
  const category = (req.body as Record<string, string>)["category"];
  // Keep the original filename (spaces included) — Supabase storage handles them fine and
  // getPublicUrl encodes them as %20, which matches how the browser fetches the file.
  // Only strip forward slashes and null bytes to prevent path traversal.
  const safeName = `${Date.now()}_${originalName.replace(/[/\0]/g, "_")}`;
  const storagePath = `${userId}/${safeName}`;

  try {
    const adminClient = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Plan-based monthly upload limit (skipped if the caller didn't send a
    // category — older/other callers, e.g. chat attachments, aren't gated here).
    if (category) {
      const { data: userRow } = await adminClient
        .from("users")
        .select("id")
        .eq("auth_id", userId)
        .maybeSingle();

      if (userRow) {
        const kind = category === "Receipts" ? "receipt" : "statement";
        const tier = await getUserTier(adminClient, userId);
        const limit = kind === "receipt"
          ? PLAN_LIMITS[tier].receiptUploadsPerMonth
          : PLAN_LIMITS[tier].statementUploadsPerMonth;
        const used = await countDocumentUploadsThisMonth(adminClient, userRow.id as number, kind);

        if (used >= limit) {
          const label = kind === "receipt" ? "receipt" : "bank statement/document";
          res.status(403).json({
            error: "limit_reached",
            kind,
            limit,
            used,
            tier,
            message: `You've reached your ${tier} plan's monthly ${label} upload limit (${limit}). Upgrade your plan to upload more.`,
          });
          return;
        }
      }
    }

    const { error: uploadError } = await adminClient.storage
      .from("documents")
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (uploadError) {
      console.error("[document-upload] storage error:", uploadError.message);
      res.status(502).json({ error: "upload_failed", message: uploadError.message });
      return;
    }

    const { data: { publicUrl } } = adminClient.storage.from("documents").getPublicUrl(storagePath);

    console.log("[document-upload] uploaded:", storagePath, "→", publicUrl);
    res.json({ publicUrl, storagePath });
  } catch (e) {
    console.error("[document-upload] error:", e);
    res.status(502).json({ error: "upload_error", message: String(e) });
  }
});

export default router;
