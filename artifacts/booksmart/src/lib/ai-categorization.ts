import { supabase } from "@/lib/supabase";

type Category = { id: number; name: string };
type SubCategory = { id: number; name: string; category_id: number };
type CategoryRule = { memo: string; category_id: number; sub_category_id: number | null };
type RuleRow = {
  memo?: string | null;
  condition?: string | null;
  category_id?: number | null;
  sub_category_id?: number | null;
};
type UncategorizedTransaction = {
  id: number;
  title: string | null;
  description: string | null;
  amount: number | null;
  type?: string | null;
  plaid_category?: unknown;
  category_id?: number | null;
  sub_category_id?: number | null;
};

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function parsePlaidCategory(plaid: unknown) {
  if (!plaid) return "";
  if (typeof plaid === "string") {
    try {
      const parsed = JSON.parse(plaid) as { primary?: string; detailed?: string };
      return `${parsed.primary ?? ""} ${parsed.detailed ?? ""}`.trim();
    } catch {
      return plaid;
    }
  }
  if (typeof plaid === "object") {
    const value = plaid as { primary?: string; detailed?: string };
    return `${value.primary ?? ""} ${value.detailed ?? ""}`.trim();
  }
  return "";
}

function normalizeSubCategoryId(
  categoryId: number,
  subCategoryId: number | null | undefined,
  subCategories: SubCategory[]
) {
  if (subCategoryId && subCategories.some(s => s.id === subCategoryId && s.category_id === categoryId)) {
    return subCategoryId;
  }
  return subCategories.find(s => s.category_id === categoryId)?.id ?? null;
}

async function applyRuleFallback(
  transactions: UncategorizedTransaction[],
  rules: CategoryRule[],
  subCategories: SubCategory[]
) {
  let updated = 0;
  const unmatched: UncategorizedTransaction[] = [];

  for (const tx of transactions) {
    const plaidText = parsePlaidCategory(tx.plaid_category);
    const text = `${tx.title ?? ""} ${tx.description ?? ""} ${plaidText}`.toLowerCase();
    const rule = rules.find(r => r.memo && text.includes(r.memo.toLowerCase()));

    if (!rule) {
      unmatched.push(tx);
      continue;
    }

    const subCategoryId = normalizeSubCategoryId(rule.category_id, rule.sub_category_id, subCategories);
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: rule.category_id, sub_category_id: subCategoryId })
      .eq("id", tx.id);

    if (error) {
      console.warn("[ai_categorization:fallback] rule update failed:", error);
      unmatched.push(tx);
    } else {
      updated += 1;
    }
  }

  return { updated, unmatched };
}

async function applyAiFallback(
  transactions: UncategorizedTransaction[],
  categories: Category[],
  subCategories: SubCategory[]
) {
  if (!transactions.length || !categories.length) return 0;

  let totalUpdated = 0;
  for (const batch of chunkArray(transactions, 10)) {
    totalUpdated += await applyAiFallbackBatch(batch, categories, subCategories);
  }

  return totalUpdated;
}

async function applyAiFallbackBatch(
  transactions: UncategorizedTransaction[],
  categories: Category[],
  subCategories: SubCategory[]
) {
  if (!transactions.length || !categories.length) return 0;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const structure = categories.map(category => ({
    id: category.id,
    name: category.name,
    sub_categories: subCategories
      .filter(sub => sub.category_id === category.id)
      .map(sub => ({ id: sub.id, name: sub.name })),
  }));

  const prompt = `You are a financial transaction categorization assistant.

Use ONLY the category and sub-category IDs provided below.
If a chosen category has sub-categories, choose the closest sub_category_id from that category.
If a chosen category has no sub-categories, use null for sub_category_id.
Return ONLY valid JSON. No markdown.

Categories:
${JSON.stringify(structure)}

Transactions:
${JSON.stringify(transactions.map(tx => ({
  id: tx.id,
  title: tx.title,
  description: tx.description,
  amount: tx.amount,
  type: tx.type,
  plaid_category: parsePlaidCategory(tx.plaid_category),
})))}

Return:
[
  { "id": number, "category_id": number, "sub_category_id": number | null }
]`;

  const res = await fetch("/api/openai-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    console.warn("[ai_categorization:fallback] AI request failed:", res.status, errorText);
    return 0;
  }

  const aiData = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = aiData.choices?.[0]?.message?.content ?? "[]";
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return 0;

  let parsed: Array<{ id?: number; category_id?: number; sub_category_id?: number | null }>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    console.warn("[ai_categorization:fallback] bad AI JSON:", content);
    return 0;
  }

  let updated = 0;
  const validCategoryIds = new Set(categories.map(c => c.id));
  const transactionIds = new Set(transactions.map(tx => tx.id));

  for (const row of parsed) {
    if (!row.id || !transactionIds.has(row.id) || !row.category_id || !validCategoryIds.has(row.category_id)) {
      continue;
    }

    const subCategoryId = normalizeSubCategoryId(row.category_id, row.sub_category_id, subCategories);
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: row.category_id, sub_category_id: subCategoryId })
      .eq("id", row.id);

    if (error) {
      console.warn("[ai_categorization:fallback] AI update failed:", error);
    } else {
      updated += 1;
    }
  }

  return updated;
}

async function fallbackCategorizeUncategorizedTransactions(limit: number, orgId?: number | null) {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const authUserId = authData.user?.id;
    let numericUserId: number | null = null;

    if (authUserId) {
      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_id", authUserId)
        .maybeSingle();

      if (!userError) {
        numericUserId = (userRow as { id?: number } | null)?.id ?? null;
      }
    }

    let transactionsQuery = supabase
      .from("transactions")
      .select("id,title,description,amount,type,plaid_category,category_id,sub_category_id")
      .or("category_id.is.null,sub_category_id.is.null")
      .order("date_time", { ascending: false })
      .limit(limit);

    if (orgId) {
      transactionsQuery = transactionsQuery.eq("org_id", orgId);
    }

    const rulesPromise = numericUserId
      ? supabase.from("category_rules").select("memo,category_id,sub_category_id").eq("user_id", numericUserId)
      : Promise.resolve({ data: [], error: null });

    const [categoriesRes, subCategoriesRes, rulesRes, transactionsRes] = await Promise.all([
      supabase.from("category").select("id,name").eq("is_deleted", false),
      supabase.from("sub_category").select("id,name,category_id").eq("is_deleted", false),
      rulesPromise,
      transactionsQuery,
    ]);

    let ruleRows = (rulesRes.data ?? []) as RuleRow[];
    if (rulesRes.error && numericUserId) {
      const legacyRulesRes = await supabase
        .from("category_rules")
        .select("condition,category_id,sub_category_id")
        .eq("user_id", numericUserId);

      if (legacyRulesRes.error) {
        console.warn("[ai_categorization:fallback] rules unavailable; continuing with AI only:", {
          rules: rulesRes.error,
          legacyRules: legacyRulesRes.error,
        });
        ruleRows = [];
      } else {
        ruleRows = (legacyRulesRes.data ?? []) as RuleRow[];
      }
    }

    if (categoriesRes.error || subCategoriesRes.error || transactionsRes.error) {
      console.warn("[ai_categorization:fallback] fetch failed:", {
        categories: categoriesRes.error,
        subCategories: subCategoriesRes.error,
        transactions: transactionsRes.error,
      });
      return 0;
    }

    const transactions = (transactionsRes.data ?? []) as UncategorizedTransaction[];
    if (!transactions.length) return 0;

    const categories = (categoriesRes.data ?? []) as Category[];
    const subCategories = (subCategoriesRes.data ?? []) as SubCategory[];
    const rules = ruleRows
      .map((rule) => ({
        memo: rule.memo ?? rule.condition ?? "",
        category_id: Number(rule.category_id),
        sub_category_id: rule.sub_category_id == null ? null : Number(rule.sub_category_id),
      }))
      .filter((rule): rule is CategoryRule => Boolean(rule.memo) && Number.isFinite(rule.category_id));

    const ruleResult = await applyRuleFallback(transactions, rules, subCategories);
    const aiUpdated = await applyAiFallback(ruleResult.unmatched, categories, subCategories);

    return ruleResult.updated + aiUpdated;
  } catch (error) {
    console.warn("[ai_categorization:fallback] failed:", error);
    return 0;
  }
}

export async function categorizeUncategorizedTransactions(expectedTransactions = 10, orgId?: number | null) {
  const fallbackUpdated = await fallbackCategorizeUncategorizedTransactions(Math.max(expectedTransactions, 10), orgId);

  return { updated: fallbackUpdated, passes: 0, fallbackUpdated };
}
