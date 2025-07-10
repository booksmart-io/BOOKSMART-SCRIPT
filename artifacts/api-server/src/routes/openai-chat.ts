import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { PLAN_LIMITS, getUserTier, countAiQuestionsThisMonth, logAiQuestionUsage } from "../lib/plan-limits";

const router = Router();
const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";

function getAdminClient() {
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false } });
}

// Allowlisted models to prevent cost abuse
const ALLOWED_MODELS = new Set([
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
]);

// Maps our OpenRouter-style model ids to the actual OpenAI model name
const MODEL_MAP: Record<string, string> = {
  "openai/gpt-4o-mini": "gpt-4o-mini",
  "openai/gpt-4o": "gpt-4o",
};

const MAX_MESSAGES = 50;
const MAX_TOKENS = 2000;
const MAX_BODY_BYTES = 64 * 1024; // 64 KB

router.post("/openai-chat", requireAuth, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    res.status(500).json({ error: "missing_openai_key" });
    return;
  }

  // Reject oversized payloads (belt-and-suspenders; express.json already limits)
  const rawLength = Number(req.headers["content-length"] ?? 0);
  if (rawLength > MAX_BODY_BYTES) {
    res.status(413).json({ error: "payload_too_large" });
    return;
  }

  const { model, messages, max_tokens, ...rest } = req.body as {
    model?: string;
    messages?: unknown[];
    max_tokens?: number;
    [key: string]: unknown;
  };

  // Model allowlist
  const resolvedModel = model ?? "openai/gpt-4o-mini";
  if (!ALLOWED_MODELS.has(resolvedModel)) {
    res.status(400).json({ error: "model_not_allowed", allowed: [...ALLOWED_MODELS] });
    return;
  }

  // Messages validation
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages_required" });
    return;
  }
  if (messages.length > MAX_MESSAGES) {
    res.status(400).json({ error: "too_many_messages", max: MAX_MESSAGES });
    return;
  }

  // Plan-based monthly AI question limit
  const authUserId = req.supabaseUserId!;
  const admin = getAdminClient();
  let tier: Awaited<ReturnType<typeof getUserTier>>;
  try {
    tier = await getUserTier(admin, authUserId);
    const limit = PLAN_LIMITS[tier].aiQuestionsPerMonth;
    const used = await countAiQuestionsThisMonth(admin, authUserId);
    if (used >= limit) {
      res.status(403).json({
        error: "limit_reached",
        limit,
        used,
        tier,
        message: `You've reached your ${tier} plan's monthly AI question limit (${limit}). Upgrade your plan for more.`,
      });
      return;
    }
  } catch (e) {
    res.status(502).json({ error: "plan_limits_error", message: String(e) });
    return;
  }

  // Cap max_tokens
  const resolvedMaxTokens = Math.min(
    typeof max_tokens === "number" && max_tokens > 0 ? max_tokens : MAX_TOKENS,
    MAX_TOKENS
  );

  // Strip unknown top-level keys to prevent forwarding unexpected fields
  const safePayload = {
    model: MODEL_MAP[resolvedModel] ?? resolvedModel,
    messages,
    max_tokens: resolvedMaxTokens,
    ...(typeof rest.temperature === "number" ? { temperature: rest.temperature } : {}),
    ...(typeof rest.stream === "boolean" ? { stream: rest.stream } : {}),
  };

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(safePayload),
    });

    const text = await upstream.text();
    const ct = upstream.headers.get("content-type") || "application/json";

    if (upstream.ok) {
      try {
        const { data: userRow } = await admin
          .from("users")
          .select("token_balance")
          .eq("auth_id", authUserId)
          .maybeSingle();
        await logAiQuestionUsage(admin, authUserId, userRow?.token_balance ?? 0);
      } catch {
        // Non-fatal: don't block the chat response if usage logging fails.
      }
    }

    res.status(upstream.status);
    res.setHeader("Content-Type", ct);
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: "upstream_failed", message: String(e) });
  }
});

export default router;
