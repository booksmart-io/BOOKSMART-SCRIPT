import { Router } from "express";
import { requireAuth } from "../middlewares/require-auth";

const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2cHB3bWtzd25sdWlkbHdubmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODg1MjgsImV4cCI6MjA4MDI2NDUyOH0.Sa9fKeEn0jbbvswuyABNHrpb01E4iKfI65_1HgfPWsM";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const router = Router();

async function sbFetch(path: string, token: string, method = "GET", body?: unknown) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: method === "DELETE" ? "return=minimal" : "",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

type TxRow = { id: number; title: string; amount: number };

async function classifyWithAI(txs: TxRow[], apiKey: string): Promise<number[]> {
  const list = txs.map((t, i) => `${i + 1}. id=${t.id} | "${t.title}" | amount=${t.amount}`).join("\n");

  const systemPrompt = `You are a financial data quality assistant.
Your job is to identify which transactions are NOT real individual bank transactions —
specifically, P&L (Profit & Loss) summary line items, budget categories, accounting
summary entries, or any row that represents an aggregated financial category rather
than a single real transaction.

Examples of P&L/summary entries to flag:
- "Hotel Accommodation +780000", "Wages & Salaries -223500", "Rent for Premises -74300",
  "Depreciation -38000", "Advertising -15000", "Cost of Goods Sold", "Gross Profit",
  "Operating Expenses", "Net Income", "Total Revenue", "Food & Beverages +110800".

Examples of REAL bank transactions to keep:
- "UPI/9196.../MR H MOHAMMED HAKKEEM +1660", "ATM WITHDRAWAL -1500",
  "PURCHASE LIFESTYLE CHENNAI -3599", "Amazon Payment -449", "Credit of Interest +797",
  "Netflix monthly -15.99", "Stripe payout +2340.00".

Rules:
- Flag amounts >= $50,000 that look like category summaries.
- Real individual transactions rarely exceed $50,000 for freelancers/SMBs.
- Return ONLY a JSON array of the ids to DELETE (integers). No markdown, no explanation.`;

  const userMsg = `Classify these transactions. Return a JSON array of the IDs that are P&L/summary entries to delete:\n\n${list}`;

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      temperature: 0,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  }

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "[]";

  const cleaned = raw.replace(/```json|```/g, "").trim();
  const ids = JSON.parse(cleaned) as number[];
  return Array.isArray(ids) ? ids.filter(Number.isInteger) : [];
}

router.post("/clean-pl-transactions", requireAuth, async (req, res) => {
  const token = req.headers.authorization!.slice(7);
  const { dryRun = true } = req.body as { dryRun?: boolean };

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    res.status(500).json({ error: "missing_openrouter_key" });
    return;
  }

  try {
    const orgRes = await sbFetch("organizations?select=id&limit=1", token);
    const orgs = (await orgRes.json()) as Array<{ id: number }>;
    if (!orgs?.length) {
      res.status(404).json({ error: "no_organization" });
      return;
    }
    const orgId = orgs[0].id;

    const txRes = await sbFetch(
      `transactions?org_id=eq.${orgId}&select=id,title,amount&limit=2000`,
      token
    );
    const txs = (await txRes.json()) as TxRow[];
    if (!Array.isArray(txs) || txs.length === 0) {
      res.json({ deleted: 0, dryRun, found: [] });
      return;
    }

    const suspectIds = await classifyWithAI(txs, apiKey);

    if (suspectIds.length === 0) {
      res.json({ deleted: 0, dryRun, found: [] });
      return;
    }

    const found = txs.filter(t => suspectIds.includes(t.id));

    if (dryRun) {
      res.json({ dryRun: true, found });
      return;
    }

    const delRes = await sbFetch(
      `transactions?id=in.(${suspectIds.join(",")})&org_id=eq.${orgId}`,
      token,
      "DELETE"
    );

    if (!delRes.ok) {
      const err = await delRes.text();
      res.status(500).json({ error: "delete_failed", detail: err });
      return;
    }

    res.json({ deleted: suspectIds.length, dryRun: false });
  } catch (err) {
    console.error("[clean-pl-transactions]", err);
    res.status(500).json({ error: "internal", detail: String(err) });
  }
});

export default router;
