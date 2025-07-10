import { Router } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";
const BUCKET = "chat-attachments";

router.post("/chat-upload", requireAuth, upload.single("file"), async (req, res) => {
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
  const safeName = `${Date.now()}_${file.originalname.replace(/[/\0]/g, "_")}`;
  const storagePath = `${userId}/${safeName}`;

  try {
    const admin = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Ensure bucket exists (private — no public access)
    const { data: buckets } = await admin.storage.listBuckets();
    if (!buckets?.find(b => b.name === BUCKET)) {
      await admin.storage.createBucket(BUCKET, { public: false });
    }

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (uploadError) {
      console.error("[chat-upload] storage error:", uploadError.message);
      res.status(502).json({ error: "upload_failed", message: uploadError.message });
      return;
    }

    // Use a short-lived signed URL (1 hour) so only authenticated callers can view
    const { data: signedData, error: signError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);

    if (signError || !signedData) {
      console.error("[chat-upload] signed URL error:", signError?.message);
      res.status(502).json({ error: "signed_url_failed" });
      return;
    }

    const isImage = file.mimetype.startsWith("image/");
    res.json({
      publicUrl: signedData.signedUrl,
      storagePath,
      name: file.originalname,
      size: file.size,
      mime: file.mimetype,
      type: isImage ? "image" : "file",
    });
  } catch (e) {
    console.error("[chat-upload] error:", e);
    res.status(502).json({ error: "upload_error", message: String(e) });
  }
});

export default router;
