import { Router } from "express";

const router = Router();

const ALLOWED_HOST = "pvppwmkswnluidlwnnck.supabase.co";

router.get("/document-download", async (req, res) => {
  const rawUrl = (req.query["url"] as string) ?? "";
  const filename = (req.query["filename"] as string) ?? "download";

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "invalid_url" });
    return;
  }

  if (parsed.hostname !== ALLOWED_HOST || !parsed.pathname.startsWith("/storage/")) {
    res.status(400).json({ error: "disallowed_url" });
    return;
  }

  let upstream: Response;
  try {
    upstream = await fetch(rawUrl);
  } catch (e) {
    res.status(502).json({ error: "fetch_failed", message: String(e) });
    return;
  }

  if (!upstream.ok) {
    res.status(upstream.status).json({ error: "upstream_error", status: upstream.status });
    return;
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const safeFilename = filename.replace(/[^\w.\-\s]/g, "_");

  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
  res.setHeader("Content-Type", contentType);
  const ct = upstream.headers.get("content-length");
  if (ct) res.setHeader("Content-Length", ct);

  const buf = await upstream.arrayBuffer();
  res.send(Buffer.from(buf));
});

export default router;
