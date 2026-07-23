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
const OFF_TOPIC_RESPONSE =
  "I can only help with BookSmart-related topics like taxes, accounting, transactions, deductions, financial reports, business strategy, subscriptions, tokens, Plaid, Stripe, and CPA workflows. Please ask a question related to your business finances.";

type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

const DOMAIN_TERMS = [
  "1099", "account", "accounting", "asset", "balance sheet", "bank", "bookkeeping",
  "booksmart", "business", "cash flow", "category", "cogs", "cpa", "credit",
  "deduct", "deduction", "debt", "depreciation", "ein", "equity", "expense",
  "financial", "filing", "income", "invoice", "irs", "liability", "loan",
  "loss", "money", "payroll", "plaid", "profit", "receipt", "report",
  "revenue", "saving", "savings", "schedule c", "statement", "stripe",
  "sub-category", "subscription", "tax", "token", "transaction", "write-off",
  "document", "documents", "upload", "uploaded", "file", "files",
];

const ALLOWED_FOLLOW_UP_PHRASES = [
  "why",
  "how",
  "what",
  "yes",
  "no",
  "more",
  "details",
  "continue",
  "explain",
  "explain more",
  "tell me more",
  "what does that mean",
  "what about this",
  "what about that",
  "how so",
  "why is that",
  "give me an example",
  "show me an example",
  "example",
];

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join(" ");
  }
  return "";
}

function includesDomainTerm(text: string): boolean {
  const normalized = text.toLowerCase();
  return DOMAIN_TERMS.some((term) => normalized.includes(term));
}

function isVagueFollowUp(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
  return ALLOWED_FOLLOW_UP_PHRASES.includes(normalized);
}

function isCategorizationTask(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("category_id") &&
    normalized.includes("sub_category_id") &&
    (normalized.includes("transaction") || normalized.includes("transactions"))
  );
}

function isAllowedBookSmartRequest(messages: ChatMessage[]): boolean {
  const lastUserText = [...messages]
    .reverse()
    .find((message) => message?.role === "user")
    ?.content;
  const userText = textFromContent(lastUserText).trim();
  if (!userText) return false;
  if (isCategorizationTask(userText)) return true;
  if (includesDomainTerm(userText)) return true;

  const contextText = messages
    .filter((message) => message?.role === "system" || message?.role === "assistant")
    .map((message) => textFromContent(message.content))
    .join(" ");
  return isVagueFollowUp(userText) && includesDomainTerm(contextText);
}

function offTopicCompletion(model: string) {
  return {
    id: "booksmart-topic-guard",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: OFF_TOPIC_RESPONSE },
      },
    ],
  };
}

function latestUserText(messages: ChatMessage[]): string {
  const lastUserText = [...messages]
    .reverse()
    .find((message) => message?.role === "user")
    ?.content;
  return textFromContent(lastUserText).trim();
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function startOfMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function safeDate(value: unknown) {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function compactText(value: unknown, max = 80) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

async function buildBookSmartDataContext(admin: ReturnType<typeof getAdminClient>, authUserId: string): Promise<string> {
  const { data: userRow, error: userError } = await admin
    .from("users")
    .select("id, email, first_name, last_name, active_org_id")
    .eq("auth_id", authUserId)
    .maybeSingle();
  if (userError) throw userError;
  if (!userRow?.id) return "BOOKSMART LIVE DATA CONTEXT\nNo BookSmart user profile row was found for this auth user.";

  const { data: orgs, error: orgError } = await admin
    .from("organizations")
    .select("*")
    .eq("owner_id", userRow.id)
    .order("id", { ascending: true });
  if (orgError) throw orgError;

  const activeOrgId = Number(userRow.active_org_id);
  const org = (orgs ?? []).find((row) => Number(row.id) === activeOrgId) ?? orgs?.[0] ?? null;
  if (!org?.id) {
    return [
      "BOOKSMART LIVE DATA CONTEXT",
      `User: ${[userRow.first_name, userRow.last_name].filter(Boolean).join(" ") || userRow.email || "Current user"}`,
      "No business/organization is set up yet.",
      "If the user asks about their financial data, explain that they need to add a business and upload/connect transactions first.",
    ].join("\n");
  }

  const txResult = await admin
    .from("transactions")
    .select("id, title, amount, type, date_time, description, deductible, category_id, sub_category_id")
    .eq("org_id", org.id)
    .order("date_time", { ascending: false })
    .limit(250);
  const docsResult = await admin
    .from("user_documents")
    .select("id, name, category, tax_year, created_at")
    .eq("user_id", userRow.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: txs, error: txError } = txResult;
  const { data: docs, error: docsError } = docsResult;
  if (txError) throw txError;

  const transactions = txs ?? [];
  const monthStart = startOfMonthIso();
  const monthTxs = transactions.filter((tx) => typeof tx.date_time === "string" && tx.date_time >= monthStart);
  const totalIncome = transactions.filter((tx) => Number(tx.amount) > 0).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const totalExpenses = transactions.filter((tx) => Number(tx.amount) < 0).reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
  const monthIncome = monthTxs.filter((tx) => Number(tx.amount) > 0).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const monthExpenses = monthTxs.filter((tx) => Number(tx.amount) < 0).reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
  const deductibleExpenses = transactions
    .filter((tx) => tx.deductible === true && Number(tx.amount) < 0)
    .reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);

  const expenseGroups = new Map<string, number>();
  for (const tx of transactions) {
    const amount = Number(tx.amount || 0);
    if (amount >= 0) continue;
    const label = compactText(tx.type, 40) || "Expense";
    expenseGroups.set(label, (expenseGroups.get(label) ?? 0) + Math.abs(amount));
  }
  const topExpenses = [...expenseGroups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, amount]) => `- ${label}: ${money(amount)}`);

  const recentTransactions = transactions.slice(0, 20).map((tx) => {
    const amount = Number(tx.amount || 0);
    const sign = amount >= 0 ? "+" : "-";
    return `- ${safeDate(tx.date_time)} | ${compactText(tx.title, 52)} | ${sign}${money(Math.abs(amount))} | ${tx.deductible ? "deductible" : "not marked deductible"}`;
  });

  const docSummary = docsError ? [] : (docs ?? []).slice(0, 10).map((doc) => (
    `- ${safeDate(doc.created_at)} | ${compactText(doc.name, 58)} | ${doc.category ?? "Uncategorized"}${doc.tax_year ? ` | ${doc.tax_year}` : ""}`
  ));

  return [
    "BOOKSMART LIVE DATA CONTEXT",
    "Use this context when answering questions about the user's own business data. If the data is not present here, say that BookSmart does not have enough uploaded/connected data yet. Do not invent numbers.",
    "",
    `User: ${[userRow.first_name, userRow.last_name].filter(Boolean).join(" ") || userRow.email || "Current user"}`,
    `Active business: ${org.name ?? "Unnamed business"} (ID ${org.id})`,
    `Business details: entity=${org.entity_type ?? "unknown"}, state=${org.state ?? org.primary_state ?? "unknown"}, industry=${org.industry ?? "unknown"}, filing_status=${org.filing_status ?? "unknown"}, status=${org.business_status ?? "unknown"}`,
    "",
    "Financial summary from transactions loaded in BookSmart:",
    `- Transactions analyzed: ${transactions.length}`,
    `- All-time income: ${money(totalIncome)}`,
    `- All-time expenses: ${money(totalExpenses)}`,
    `- All-time net: ${money(totalIncome - totalExpenses)}`,
    `- Current-month income: ${money(monthIncome)}`,
    `- Current-month expenses: ${money(monthExpenses)}`,
    `- Current-month net: ${money(monthIncome - monthExpenses)}`,
    `- Expenses marked deductible: ${money(deductibleExpenses)}`,
    "",
    "Top expense groups:",
    ...(topExpenses.length ? topExpenses : ["- No expense transactions found."]),
    "",
    "Recent transactions:",
    ...(recentTransactions.length ? recentTransactions : ["- No transactions found."]),
    "",
    "Recently uploaded documents:",
    ...(docsError ? ["- Document metadata could not be loaded for this response."] : docSummary.length ? docSummary : ["- No uploaded documents found."]),
  ].join("\n");
}

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
  if (!messages.every((message) => message && typeof message === "object")) {
    res.status(400).json({ error: "invalid_messages" });
    return;
  }
  const chatMessages = messages as ChatMessage[];
  if (!isAllowedBookSmartRequest(chatMessages)) {
    res.status(200).json(offTopicCompletion(MODEL_MAP[resolvedModel] ?? resolvedModel));
    return;
  }

  const authUserId = req.supabaseUserId!;
  const admin = getAdminClient();
  const categorizationTask = isCategorizationTask(latestUserText(chatMessages));

  // Categorization is part of transaction processing, not a user AI-chat question.
  if (!categorizationTask) {
    try {
      const tier = await getUserTier(admin, authUserId);
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
  }

  let augmentedMessages = messages;
  if (!categorizationTask) {
    try {
      const dataContext = await buildBookSmartDataContext(admin, authUserId);
      augmentedMessages = [
        {
          role: "system",
          content: dataContext,
        },
        ...messages,
      ];
    } catch {
      augmentedMessages = [
        {
          role: "system",
          content: "BOOKSMART LIVE DATA CONTEXT\nLive user financial data could not be loaded for this response. Do not invent user-specific numbers; ask the user to retry or check their uploaded/connected data.",
        },
        ...messages,
      ];
    }
  }

  // Cap max_tokens
  const resolvedMaxTokens = Math.min(
    typeof max_tokens === "number" && max_tokens > 0 ? max_tokens : MAX_TOKENS,
    MAX_TOKENS
  );

  // Strip unknown top-level keys to prevent forwarding unexpected fields
  const safePayload = {
    model: MODEL_MAP[resolvedModel] ?? resolvedModel,
    messages: augmentedMessages,
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

    if (upstream.ok && !categorizationTask) {
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
