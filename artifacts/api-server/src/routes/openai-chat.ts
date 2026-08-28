import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/require-auth";
import { PLAN_LIMITS, getUserTier, countAiQuestionsThisMonth, logAiQuestionUsage } from "../lib/plan-limits";
import { buildCanonicalFinancialSummary, type CanonicalStatementDocument } from "../lib/canonical-financial-summary";
import type { FinancialCategory, FinancialSubCategory, FinancialTransaction } from "../../../booksmart/src/lib/financial-engine";
import type { DeductionRule, DeductionRuleGroup, OrgRow } from "../../../booksmart/src/lib/deduction-calculation";

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
const MAX_TOKENS = 3500;
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
  "can you elaborate",
  "elaborate",
];

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

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
  if (ALLOWED_FOLLOW_UP_PHRASES.includes(normalized)) return true;
  if (normalized.length > 32) return false;
  return ALLOWED_FOLLOW_UP_PHRASES.some((phrase) => editDistance(normalized, phrase) <= 2);
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

async function buildBookSmartDataContext(admin: ReturnType<typeof getAdminClient>, authUserId: string, requestedOrganizationId?: number): Promise<string> {
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

  const activeOrgId = Number.isSafeInteger(requestedOrganizationId) && Number(requestedOrganizationId) > 0 ? Number(requestedOrganizationId) : Number(userRow.active_org_id);
  const org = (orgs ?? []).find((row) => Number(row.id) === activeOrgId) ?? orgs?.[0] ?? null;
  if (requestedOrganizationId && Number(org?.id) !== requestedOrganizationId) throw new Error("The requested organization is not available to this user.");
  if (!org?.id) {
    return [
      "BOOKSMART LIVE DATA CONTEXT",
      `User: ${[userRow.first_name, userRow.last_name].filter(Boolean).join(" ") || userRow.email || "Current user"}`,
      "No business/organization is set up yet.",
      "If the user asks about their financial data, explain that they need to add a business and upload/connect transactions first.",
    ].join("\n");
  }

  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const [txResult, categoriesResult, subCategoriesResult, docsResult, ruleGroupsResult, rulesResult, jobberResult, receiptsResult, assignmentsResult, signalsResult, tasksResult, balancesResult, plaidResult, quickBooksResult, gmailResult, planningSettingsResult, planningItemsResult, surveyProgressResult, jobberConnectionResult] = await Promise.all([
    admin.from("transactions").select("id,title,amount,type,date_time,description,deductible,category_id,sub_category_id,pending").eq("org_id", org.id).gte("date_time", yearStart.toISOString()).lte("date_time", now.toISOString()).order("date_time", { ascending: false }),
    admin.from("category").select("id,name"),
    admin.from("sub_category").select("id,name,category_id"),
    admin.from("user_documents").select("id,name,category,tax_year,created_at,parsed_data").eq("user_id", userRow.id).order("created_at", { ascending: false }),
    admin.from("deduction_rule_groups").select("*"),
    admin.from("deduction_rules").select("*"),
    admin.from("jobber_records").select("external_id,object_type,record_number,status,title,amount,source_updated_at").eq("organization_id", org.id).eq("is_archived", false).order("source_updated_at", { ascending: false }).limit(60),
    admin.from("contractor_receipt_extractions").select("source_id,vendor,receipt_date,total,po_number,job_number,customer_or_project,receipt_number,updated_at").eq("organization_id", org.id).order("updated_at", { ascending: false }).limit(25),
    admin.from("contractor_job_cost_assignments").select("jobber_job_id,source_provider,source_record_id,amount,cost_category,created_at").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(25),
    admin.from("business_signals").select("title,description,category,severity,amount,percentage,status,recommended_action,detected_at").eq("organization_id", org.id).eq("status", "active").order("detected_at", { ascending: false }).limit(20),
    admin.from("financial_tasks").select("title,description,category,priority,status,due_date,cta_route,updated_at").eq("organization_id", org.id).in("status", ["open","in_progress","waiting"]).order("updated_at", { ascending: false }).limit(20),
    admin.from("account_balance_snapshots").select("account_name,account_type,account_subtype,current_balance,available_balance,currency,balance_timestamp").eq("organization_id", org.id).order("balance_timestamp", { ascending: false }).limit(25),
    admin.from("plaid_items").select("status,last_sync_status,last_synced_at,institution_name").eq("org_id", org.id),
    admin.from("quickbooks_connections").select("company_name,status,last_synced_at,last_sync_status,updated_at").eq("organization_id", org.id).maybeSingle(),
    admin.from("gmail_connections").select("google_account_email,status,last_scan_at,last_scan_status,updated_at").eq("organization_id", org.id).maybeSingle(),
    admin.from("financial_planning_settings").select("payroll_amount,payroll_cadence,next_payroll_date,operating_buffer,tax_effective_rate,projected_taxable_income,tax_amount_set_aside,updated_at").eq("organization_id", org.id).maybeSingle(),
    admin.from("financial_planning_items").select("item_type,name,amount,due_date,recurrence,status,notes,updated_at").eq("organization_id", org.id).eq("status", "active").order("due_date").limit(30),
    admin.from("organization_survey_progress").select("survey_key,status,current_section_key,answered_question_keys,skipped_question_keys,last_saved_at,completed_at").eq("organization_id", org.id),
    admin.from("jobber_connections").select("jobber_account_name,status,last_successful_sync_at,last_sync_error,updated_at").eq("organization_id", org.id).maybeSingle(),
  ]);
  if (txResult.error || categoriesResult.error || subCategoriesResult.error || ruleGroupsResult.error || rulesResult.error) throw txResult.error ?? categoriesResult.error ?? subCategoriesResult.error ?? ruleGroupsResult.error ?? rulesResult.error;

  const transactions = (txResult.data ?? []) as FinancialTransaction[];
  const contextTransactions = transactions.filter(transaction => (transaction as FinancialTransaction & { pending?: boolean | null }).pending !== true);
  const organizationDocuments = (docsResult.data ?? []).filter((doc) => {
    const workflow = doc.parsed_data?.statement_workflow;
    return workflow && typeof workflow === "object" && Number((workflow as Record<string, unknown>).organization_id) === Number(org.id);
  });
  const canonical = buildCanonicalFinancialSummary({ organizationId: Number(org.id), start: yearStart, end: now,
    transactions, categories: (categoriesResult.data ?? []) as FinancialCategory[], subCategories: (subCategoriesResult.data ?? []) as FinancialSubCategory[],
    documents: organizationDocuments as CanonicalStatementDocument[], organization: org as OrgRow,
    deductionRuleGroups: (ruleGroupsResult.data ?? []) as DeductionRuleGroup[], deductionRules: (rulesResult.data ?? []) as DeductionRule[] });

  const expenseGroups = new Map<string, number>();
  for (const tx of contextTransactions) {
    const amount = Number(tx.amount || 0);
    if (amount >= 0) continue;
    const label = compactText(tx.type, 40) || "Expense";
    expenseGroups.set(label, (expenseGroups.get(label) ?? 0) + Math.abs(amount));
  }
  const topExpenses = [...expenseGroups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, amount]) => `- ${label}: ${money(amount)}`);

  const recentTransactions = contextTransactions.slice(0, 20).map((tx) => {
    const amount = Number(tx.amount || 0);
    const sign = amount >= 0 ? "+" : "-";
    return `- ${safeDate(tx.date_time)} | ${compactText(tx.title, 52)} | ${sign}${money(Math.abs(amount))} | ${tx.deductible ? "deductible" : "not marked deductible"}`;
  });

  const docSummary = organizationDocuments.slice(0, 10).map((doc) => (
    `- ${safeDate(doc.created_at)} | ${compactText(doc.name, 58)} | ${doc.category ?? "Uncategorized"}${doc.tax_year ? ` | ${doc.tax_year}` : ""}`
  ));
  const summarizeRows = (rows: any[] | null, formatter: (row: any) => string, empty: string) => rows?.length ? rows.map(formatter) : [`- ${empty}`];
  const connectionLines = [
    `- Plaid: ${plaidResult.error ? "unavailable" : plaidResult.data?.length ? plaidResult.data.map(row => `${row.institution_name || "Bank"} (${row.status}, sync ${row.last_sync_status || "unknown"})`).join("; ") : "not connected"}`,
    `- QuickBooks: ${quickBooksResult.error ? "unavailable" : quickBooksResult.data ? `${quickBooksResult.data.company_name || "Connected company"} (${quickBooksResult.data.status}, sync ${quickBooksResult.data.last_sync_status || "unknown"})` : "not connected"}`,
    `- Gmail receipts: ${gmailResult.error ? "unavailable" : gmailResult.data ? `${gmailResult.data.google_account_email || "connected account"} (${gmailResult.data.status}, scan ${gmailResult.data.last_scan_status || "unknown"})` : "not connected"}`,
    `- Jobber: ${jobberConnectionResult.error ? "unavailable" : jobberConnectionResult.data ? `${jobberConnectionResult.data.jobber_account_name || "connected account"} (${jobberConnectionResult.data.status}, last successful sync ${safeDate(jobberConnectionResult.data.last_successful_sync_at) || "unavailable"})` : "not connected"}`,
  ];

  return [
    "BOOKSMART LIVE DATA CONTEXT",
    "Use this context when answering questions about the user's own business data. If the data is not present here, say that BookSmart does not have enough uploaded/connected data yet. Do not invent numbers.",
    "",
    `User: ${[userRow.first_name, userRow.last_name].filter(Boolean).join(" ") || userRow.email || "Current user"}`,
    `Active business: ${org.name ?? "Unnamed business"} (ID ${org.id})`,
    `Business details: entity=${org.entity_type ?? "unknown"}, state=${org.state ?? org.primary_state ?? "unknown"}, industry=${org.industry ?? "unknown"}, filing_status=${org.filing_status ?? "unknown"}, status=${org.business_status ?? "unknown"}`,
    "",
    `Canonical year-to-date financial summary (${yearStart.toISOString().slice(0, 10)} through ${now.toISOString().slice(0, 10)}):`,
    `- Source: ${canonical.source}; calculation=${canonical.calculationVersion}; complete=${canonical.completeness.complete}`,
    `- Revenue: ${money(canonical.revenue)}`,
    `- Accounting expenses: ${money(canonical.accountingExpenses)}`,
    `- Net income: ${money(canonical.netIncome)}`,
    `- Money in: ${money(canonical.moneyIn)}; money out: ${money(canonical.moneyOut)}; net cash movement: ${money(canonical.netCashMovement)}`,
    `- Deductible amount: ${money(canonical.deductibleAmount)}`,
    `- Approved transactions: ${canonical.completeness.approvedTransactionCount}; uncategorized: ${canonical.completeness.uncategorizedTransactionCount}; warnings: ${canonical.warnings.join(", ") || "none"}`,
    "",
    "Top expense groups:",
    ...(topExpenses.length ? topExpenses : ["- No expense transactions found."]),
    "",
    "Recent transactions:",
    ...(recentTransactions.length ? recentTransactions : ["- No transactions found."]),
    "",
    "Recently uploaded documents:",
    ...(docsResult.error ? ["- Document metadata could not be loaded."] : docSummary.length ? docSummary : ["- No organization-scoped financial documents found."]),
    "",
    "Connection health:", ...connectionLines,
    "",
    "Current Jobber operational records:", ...summarizeRows(jobberResult.error ? null : jobberResult.data, row => `- ${row.object_type} ${row.record_number || row.external_id}: ${compactText(row.title, 48)} | ${row.status || "unknown"}${row.amount == null ? "" : ` | ${money(Number(row.amount))}`}`, "No synchronized Jobber records."),
    "",
    "Receipt evidence:", ...summarizeRows(receiptsResult.error ? null : receiptsResult.data, row => `- ${safeDate(row.receipt_date)} | ${compactText(row.vendor, 45) || "Unknown vendor"} | ${row.total == null ? "amount unavailable" : money(Number(row.total))} | receipt ${row.receipt_number || "unavailable"}`, "No receipt evidence."),
    "",
    "Approved job-cost assignments:", ...summarizeRows(assignmentsResult.error ? null : assignmentsResult.data, row => `- Jobber job ${row.jobber_job_id} | ${money(Number(row.amount))} | source ${row.source_provider}:${row.source_record_id}`, "No approved job-cost assignments."),
    "",
    "Active business insights:", ...summarizeRows(signalsResult.error ? null : signalsResult.data, row => `- [${row.severity}] ${compactText(row.title, 70)}: ${compactText(row.description, 140)}`, "No active insights."),
    "",
    "Tasks needing action:", ...summarizeRows(tasksResult.error ? null : tasksResult.data, row => `- [${row.priority}] ${compactText(row.title, 70)} | ${row.status}${row.due_date ? ` | due ${row.due_date}` : ""}`, "No active tasks."),
    "",
    "Latest connected-account balances:", ...summarizeRows(balancesResult.error ? null : balancesResult.data, row => `- ${compactText(row.account_name, 40)} | ${row.currency || "USD"} current=${row.current_balance == null ? "unavailable" : money(Number(row.current_balance))}, available=${row.available_balance == null ? "unavailable" : money(Number(row.available_balance))} | as of ${safeDate(row.balance_timestamp)}`, "No balance snapshots."),
    "",
    "Financial planning settings:",
    ...(planningSettingsResult.error ? ["- Planning settings unavailable."] : planningSettingsResult.data ? [
      `- Payroll: ${planningSettingsResult.data.payroll_amount == null ? "not configured" : money(Number(planningSettingsResult.data.payroll_amount))} ${planningSettingsResult.data.payroll_cadence || ""}; next ${planningSettingsResult.data.next_payroll_date || "unavailable"}`,
      `- Operating buffer: ${planningSettingsResult.data.operating_buffer == null ? "not configured" : money(Number(planningSettingsResult.data.operating_buffer))}`,
      `- Tax rate: ${planningSettingsResult.data.tax_effective_rate ?? "not configured"}; projected taxable income: ${planningSettingsResult.data.projected_taxable_income == null ? "not configured" : money(Number(planningSettingsResult.data.projected_taxable_income))}; set aside: ${planningSettingsResult.data.tax_amount_set_aside == null ? "not configured" : money(Number(planningSettingsResult.data.tax_amount_set_aside))}`,
    ] : ["- No planning settings configured."]),
    "Planning items:", ...summarizeRows(planningItemsResult.error ? null : planningItemsResult.data, row => `- ${row.item_type}: ${compactText(row.name, 60)} | ${row.amount == null ? "amount unavailable" : money(Number(row.amount))} | due ${row.due_date} | ${row.recurrence}`, "No active planning items."),
    "",
    "Business questionnaire status:", ...summarizeRows(surveyProgressResult.error ? null : surveyProgressResult.data, row => `- ${row.survey_key}: ${row.status}; ${row.answered_question_keys?.length ?? 0} answered; ${row.skipped_question_keys?.length ?? 0} skipped; updated ${safeDate(row.last_saved_at)}`, "No questionnaire progress."),
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

  const { model, messages, max_tokens, use_live_context, organization_id, ...rest } = req.body as {
    model?: string;
    messages?: unknown[];
    max_tokens?: number;
    use_live_context?: boolean;
    organization_id?: number;
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
  if (!categorizationTask && use_live_context !== false) {
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
      const requestedOrganizationId = Number(organization_id);
      const dataContext = await buildBookSmartDataContext(admin, authUserId, Number.isSafeInteger(requestedOrganizationId) && requestedOrganizationId > 0 ? requestedOrganizationId : undefined);
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
