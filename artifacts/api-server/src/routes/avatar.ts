import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import {
  AVATAR_BUCKET,
  AVATAR_MAX_BYTES,
  managedAvatarPath,
  validateAvatarImage,
} from "../lib/avatar-image";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: AVATAR_MAX_BYTES },
});

function adminClient() {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

async function removeManagedAvatar(
  client: NonNullable<ReturnType<typeof adminClient>>,
  publicUrl: string | null | undefined,
  authUuid: string,
) {
  const supabaseUrl = process.env["SUPABASE_URL"];
  if (!supabaseUrl) return;
  const path = managedAvatarPath(publicUrl, authUuid, supabaseUrl);
  if (!path) return;
  const { error } = await client.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) console.warn("[avatar] old avatar cleanup failed:", error.message);
}

router.post("/avatar", requireAuth, (req, res) => {
  upload.single("file")(req, res, async (uploadError) => {
    if (uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "file_too_large", message: "Profile photos must be 5 MB or smaller." });
      return;
    }
    if (uploadError) {
      res.status(400).json({ error: "invalid_upload", message: "The profile photo could not be read." });
      return;
    }

    const client = adminClient();
    if (!client) {
      res.status(503).json({ error: "avatar_service_unavailable", message: "Avatar storage is not configured." });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "no_file", message: "Choose a profile photo to upload." });
      return;
    }

    let image;
    let uploadedPath: string | null = null;
    let profileUpdated = false;
    try {
      image = validateAvatarImage(req.file.buffer);
    } catch (error) {
      const code = error instanceof Error ? error.message : "invalid_image";
      const message = code === "file_too_large"
        ? "Profile photos must be 5 MB or smaller."
        : code === "invalid_dimensions"
          ? "Profile photos must be between 128×128 and 4096×4096 pixels."
          : "Please choose a valid JPG, PNG, or WebP image.";
      res.status(code === "file_too_large" ? 413 : 400).json({ error: code, message });
      return;
    }

    const authUuid = req.supabaseUserId!;
    const storagePath = `${authUuid}/avatar-${Date.now()}-${randomUUID()}.${image.extension}`;

    try {
      const { data: userRow, error: userError } = await client
        .from("users")
        .select("id,img_url")
        .eq("auth_id", authUuid)
        .single();
      if (userError || !userRow) {
        res.status(404).json({ error: "profile_not_found", message: "Your BookSmart profile could not be found." });
        return;
      }

      const { error: storageError } = await client.storage
        .from(AVATAR_BUCKET)
        .upload(storagePath, req.file.buffer, {
          contentType: image.contentType,
          cacheControl: "31536000",
          upsert: false,
        });
      if (storageError) {
        console.error("[avatar] upload failed:", storageError.message);
        const missingBucket = /bucket.*not found/i.test(storageError.message);
        res.status(missingBucket ? 503 : 502).json({
          error: missingBucket ? "avatar_bucket_missing" : "upload_failed",
          message: missingBucket ? "Avatar storage is not configured." : "The profile photo could not be uploaded.",
        });
        return;
      }
      uploadedPath = storagePath;

      const { data: publicData } = client.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);
      const publicUrl = publicData.publicUrl;
      const { error: updateError } = await client
        .from("users")
        .update({ img_url: publicUrl })
        .eq("auth_id", authUuid);

      if (updateError) {
        await client.storage.from(AVATAR_BUCKET).remove([storagePath]);
        uploadedPath = null;
        console.error("[avatar] profile update failed:", updateError.message);
        res.status(502).json({ error: "profile_update_failed", message: "The profile photo could not be saved." });
        return;
      }
      profileUpdated = true;

      await removeManagedAvatar(client, userRow.img_url as string | null, authUuid);
      res.json({ ok: true, publicUrl });
    } catch (error) {
      if (uploadedPath && !profileUpdated) {
        await client.storage.from(AVATAR_BUCKET).remove([uploadedPath]).catch(() => undefined);
      }
      console.error("[avatar] unexpected upload error:", error);
      res.status(502).json({ error: "upload_failed", message: "The profile photo could not be uploaded." });
    }
  });
});

router.delete("/avatar", requireAuth, async (req, res) => {
  const client = adminClient();
  if (!client) {
    res.status(503).json({ error: "avatar_service_unavailable", message: "Avatar storage is not configured." });
    return;
  }

  const authUuid = req.supabaseUserId!;
  try {
    const { data: userRow, error: userError } = await client
      .from("users")
      .select("id,img_url")
      .eq("auth_id", authUuid)
      .single();
    if (userError || !userRow) {
      res.status(404).json({ error: "profile_not_found", message: "Your BookSmart profile could not be found." });
      return;
    }

    const { error: updateError } = await client
      .from("users")
      .update({ img_url: null })
      .eq("auth_id", authUuid);
    if (updateError) {
      console.error("[avatar] profile clear failed:", updateError.message);
      res.status(502).json({ error: "profile_update_failed", message: "The profile photo could not be removed." });
      return;
    }

    await removeManagedAvatar(client, userRow.img_url as string | null, authUuid);
    res.json({ ok: true });
  } catch (error) {
    console.error("[avatar] unexpected remove error:", error);
    res.status(502).json({ error: "remove_failed", message: "The profile photo could not be removed." });
  }
});

export default router;
