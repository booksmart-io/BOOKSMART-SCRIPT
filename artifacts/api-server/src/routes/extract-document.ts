import { Router } from "express";
import { requireAuth } from "../middlewares/require-auth";
import { createRequire } from "node:module";

// pdf-parse is CJS only — use createRequire so the ESM bundle can load it
const _require = createRequire(import.meta.url);
type PdfParseResult = { text: string; numpages: number };
const pdfParse = _require("pdf-parse") as (buf: Buffer) => Promise<PdfParseResult>;

const router = Router();

// ── Prompts (mirrors Flutter AIExtractionService._getPromptForType) ───────────

const SYSTEM_PROMPT = `You are a financial document parser. Your job is to extract specific financial 
figures from documents such as profit & loss statements, balance sheets, and 
cash flow statements.

Rules:
- Extract only numeric totals/subtotals, not line-item details
- If a value is negative (e.g. net loss, cash outflow), return it as a negative number
- If a field cannot be found, return 0
- Never return null for numeric fields — always return a number
- Return ONLY a raw JSON object. No markdown, no explanation, no backticks
- All values must be plain numbers (no currency symbols, commas, or units)`;

const PROMPTS: Record<string, string> = {
  pnl: `Extract the Profit & Loss summary totals from this document.

Look for these values (they may appear under different names):
- revenue: Total Revenue, Total Sales, Total Income, Net Sales, Turnover
- cost_of_goods_sold: COGS, Cost of Sales, Direct Costs, Cost of Revenue
- gross_profit: Gross Profit, Gross Margin (revenue minus COGS)
- operating_expenses: Total Operating Expenses, OpEx, Indirect Costs, SG&A + Other
- net_income: Net Income, Net Profit/Loss, Profit After Tax, Bottom Line
  → If this is a net loss, return a negative number

Return this exact JSON structure:
{
  "revenue": 0.0,
  "cost_of_goods_sold": 0.0,
  "gross_profit": 0.0,
  "operating_expenses": 0.0,
  "net_income": 0.0
}`,

  bs: `Extract the Balance Sheet totals from this document.

Look for these values:
- assets.current: Total Current Assets (cash, receivables, inventory, prepaid)
- assets.non_current: Total Non-Current / Fixed Assets (property, equipment, intangibles)
- liabilities.current: Total Current Liabilities (payables, short-term debt, accruals)
- liabilities.long_term: Total Long-Term / Non-Current Liabilities (long-term loans, deferred tax)
- equity: Total Equity, Shareholders' Equity, Net Assets, Owner's Equity

Return this exact JSON structure:
{
  "assets": { "current": 0.0, "non_current": 0.0 },
  "liabilities": { "current": 0.0, "long_term": 0.0 },
  "equity": 0.0
}`,

  cf: `Extract the Cash Flow statement totals from this document.

- operating_activities: Net Cash from Operating Activities
- investing_activities: TOTAL Net Cash from Investing Activities
- financing_activities: TOTAL Net Cash from Financing Activities

Return this exact JSON structure:
{
  "operating_activities": 0.0,
  "investing_activities": 0.0,
  "financing_activities": 0.0
}`,
};

// ── Route ─────────────────────────────────────────────────────────────────────

router.post("/extract-document", requireAuth, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    res.status(500).json({ error: "missing_openai_key" });
    return;
  }

  const { fileData, mimeType, docType } = req.body as {
    fileData?: string;
    mimeType?: string;
    docType?: string;
  };

  if (typeof fileData !== "string" || !fileData) {
    res.status(400).json({ error: "fileData_required" });
    return;
  }
  if (typeof mimeType !== "string" || !mimeType) {
    res.status(400).json({ error: "mimeType_required" });
    return;
  }

  const normalizedType = normalizeDocType(docType ?? "");
  const prompt = PROMPTS[normalizedType];
  if (!prompt) {
    res.status(400).json({ error: "unsupported_docType", supported: Object.keys(PROMPTS) });
    return;
  }

  // Build content parts
  const contentParts: unknown[] = [];

  if (mimeType.startsWith("image/")) {
    // Images → send as base64 vision input
    contentParts.push({
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${fileData}`, detail: "high" },
    });
  } else if (mimeType === "application/pdf") {
    // PDFs → extract text with pdf-parse, then send as text
    // (OpenRouter/GPT-4o does not accept PDFs as image_url)
    let pdfText: string;
    try {
      const buffer = Buffer.from(fileData, "base64");
      const parsed = await pdfParse(buffer);
      pdfText = parsed.text?.trim() ?? "";
    } catch (e) {
      res.status(422).json({ error: "pdf_parse_failed", message: String(e) });
      return;
    }
    if (!pdfText) {
      res.status(422).json({ error: "pdf_empty", message: "No text could be extracted from the PDF. Try uploading a scanned image instead." });
      return;
    }
    contentParts.push({
      type: "text",
      text: `Here is the financial document (extracted from PDF):\n\n${pdfText}`,
    });
  } else {
    // CSV, plain text, docx — decode and send as text
    let text: string;
    try {
      text = Buffer.from(fileData, "base64").toString("utf-8");
    } catch {
      text = fileData;
    }
    contentParts.push({
      type: "text",
      text: `Here is the financial document:\n\n${text}`,
    });
  }

  contentParts.push({ type: "text", text: prompt });

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: contentParts },
        ],
        temperature: 0,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(502).json({ error: "upstream_error", detail: errText });
      return;
    }

    const json = (await upstream.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const raw = json.choices?.[0]?.message?.content ?? "";
    let extracted: unknown;
    try {
      const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      extracted = JSON.parse(cleaned);
    } catch {
      res.status(502).json({ error: "parse_failed", raw });
      return;
    }

    res.json({ extracted, docType: normalizedType });
  } catch (e) {
    res.status(502).json({ error: "upstream_failed", message: String(e) });
  }
});

function normalizeDocType(t: string): string {
  const s = t.trim().toLowerCase();
  if (["pl", "pnl", "profit_loss", "profit & loss", "income statement"].includes(s)) return "pnl";
  if (["bs", "balance_sheet", "balance sheet"].includes(s)) return "bs";
  if (["cf", "cash_flow", "cash flow statement", "cashflow"].includes(s)) return "cf";
  return s;
}

export default router;
