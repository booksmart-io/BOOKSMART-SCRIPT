import { Router } from "express";
import { requireAuth } from "../middlewares/require-auth";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
type PdfParseResult = { text: string; numpages: number };
const pdfParse = _require("pdf-parse") as (buf: Buffer) => Promise<PdfParseResult>;

const SUPABASE_URL = "https://pvppwmkswnluidlwnnck.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2cHB3bWtzd25sdWlkbHdubmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODg1MjgsImV4cCI6MjA4MDI2NDUyOH0.Sa9fKeEn0jbbvswuyABNHrpb01E4iKfI65_1HgfPWsM";

const router = Router();

const SYSTEM_PROMPT = `You are a bank statement parser. Extract every transaction from the document.

Return ONLY a JSON array (no markdown, no explanation) where each item has:
- "title": merchant name or brief transaction description (string)
- "amount": absolute value as a positive number (number)
- "transaction_type": "debit" (money out / withdrawal / purchase) or "credit" (money in / deposit)
- "date_time": ISO 8601 date string "YYYY-MM-DDTHH:mm:ssZ" (infer year from context if missing)
- "description": any reference numbers, memo, or extra notes (string, may be empty)
- "running_balance": running balance after this transaction as a number, or null if not shown

Rules:
- Extract EVERY individual transaction line, not totals or summaries
- Fees, charges, and interest are debits
- Deposits, transfers in, refunds, and credits are credits
- Never return null for title, amount, transaction_type, date_time, or description`;

async function sbFetch(path: string, token: string, method = "GET", body?: unknown) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=minimal" : "",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

router.post("/scan-statement", requireAuth, async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    res.status(500).json({ error: "missing_openrouter_key" });
    return;
  }

  const { importId, fileData, mimeType, documentId } = req.body as {
    importId?: number;
    fileData?: string;
    mimeType?: string;
    documentId?: string;
  };

  if (typeof fileData !== "string" || !mimeType) {
    res.status(400).json({ error: "fileData and mimeType are required" });
    return;
  }

  const userJwt = req.headers.authorization!.slice(7);
  const authUuid = req.supabaseUserId!;

  // ── 1. Resolve numericId + orgId via Supabase REST ─────────────────────────
  let numericUserId: number | null = null;
  let orgId: number | null = null;
  try {
    const userRes = await sbFetch(`users?auth_id=eq.${authUuid}&select=id&limit=1`, userJwt);
    const [userRow] = (await userRes.json()) as { id: number }[];
    numericUserId = userRow?.id ?? null;

    if (numericUserId) {
      const orgRes = await sbFetch(
        `organizations?owner_id=eq.${numericUserId}&select=id&limit=1`,
        userJwt
      );
      const [orgRow] = (await orgRes.json()) as { id: number }[];
      orgId = orgRow?.id ?? null;
    }
  } catch {
    // proceed without; pending_transactions may lack org_id
  }

  // ── 2. Resolve statement text ───────────────────────────────────────────────
  // Strategy: always produce a plain-text string first, then feed it to GPT-4o
  // for structured JSON parsing. For scanned PDFs/images we use Gemini vision
  // to OCR the text first (it accepts PDF base64 natively).

  async function callOpenRouter(body: unknown): Promise<Response> {
    return fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://booksmart.replit.app",
        "X-Title": "BookSmart",
      },
      body: JSON.stringify(body),
    });
  }

  let statementText = "";

  if (mimeType === "application/pdf") {
    // Step 1a: try text-layer extraction with pdf-parse
    try {
      const buf = Buffer.from(fileData, "base64");
      const parsed = await pdfParse(buf);
      statementText = parsed.text?.trim() ?? "";
      console.log(`[scan-statement] pdf-parse got ${statementText.length} chars`);
    } catch (e) {
      console.warn("[scan-statement] pdf-parse failed:", e);
    }

    if (statementText.length < 50) {
      // Step 1b: scanned PDF — use Gemini vision to OCR it
      // NOTE: do NOT pass temperature/max_tokens — Gemini rejects them via OpenRouter
      console.log("[scan-statement] falling back to Gemini vision OCR");
      const visionRes = await callOpenRouter({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${fileData}` } },
            { type: "text", text: "This is a bank statement. Extract ALL transaction lines as plain text exactly as they appear — date, description, amounts. No explanations." },
          ],
        }],
      });
      if (visionRes.ok) {
        const vj = await visionRes.json() as { choices?: { message?: { content?: string } }[] };
        statementText = vj.choices?.[0]?.message?.content?.trim() ?? "";
        console.log(`[scan-statement] Gemini vision got ${statementText.length} chars`);
      } else {
        const err = await visionRes.text();
        console.error("[scan-statement] Gemini OCR failed", visionRes.status, err);
        if (importId) await markFailed(importId, userJwt, `Vision OCR error: ${visionRes.status}`);
        res.status(502).json({ error: "vision_error", status: visionRes.status, detail: err });
        return;
      }
    }
  } else if (mimeType.startsWith("image/")) {
    // Step 1: image file — Gemini vision to OCR
    console.log("[scan-statement] image file — using Gemini vision OCR");
    const visionRes = await callOpenRouter({
      model: "google/gemini-2.5-flash",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileData}` } },
          { type: "text", text: "This is a bank statement image. Extract ALL transaction lines as plain text — date, description, amounts. No explanations." },
        ],
      }],
    });
    if (visionRes.ok) {
      const vj = await visionRes.json() as { choices?: { message?: { content?: string } }[] };
      statementText = vj.choices?.[0]?.message?.content?.trim() ?? "";
    } else {
      const err = await visionRes.text();
      console.error("[scan-statement] Gemini image OCR failed", visionRes.status, err);
      if (importId) await markFailed(importId, userJwt, `Vision OCR error: ${visionRes.status}`);
      res.status(502).json({ error: "vision_error", status: visionRes.status, detail: err });
      return;
    }
  } else {
    // CSV / plain text
    statementText = Buffer.from(fileData, "base64").toString("utf-8");
  }

  if (!statementText) {
    if (importId) await markFailed(importId, userJwt, "Could not extract text from document.");
    res.status(422).json({ error: "no_text_extracted" });
    return;
  }

  // ── 3. Parse transactions with GPT-4o ───────────────────────────────────────
  let transactions: {
    title: string;
    amount: number;
    transaction_type: "debit" | "credit";
    date_time: string;
    description: string;
    running_balance: number | null;
  }[] = [];

  try {
    const upstream = await callOpenRouter({
      model: "openai/gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Here is the bank statement:\n\n${statementText}\n\nExtract all transactions.` },
      ],
      temperature: 0,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      if (importId) await markFailed(importId, userJwt, `AI error: ${upstream.status}`);
      res.status(502).json({ error: "upstream_error", detail: errText });
      return;
    }

    const json = (await upstream.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "[]";
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    // GPT may return { transactions: [...] } or just [...]
    const parsed = JSON.parse(cleaned);
    transactions = Array.isArray(parsed)
      ? parsed
      : (parsed.transactions ?? parsed.data ?? []);
  } catch (e) {
    if (importId) await markFailed(importId, userJwt, `Parse error: ${String(e)}`);
    res.status(502).json({ error: "parse_failed", message: String(e) });
    return;
  }

  // ── 4. Insert pending_transactions ─────────────────────────────────────────
  if (transactions.length > 0) {
    if (importId !== undefined) {
      // ── Pending queue path (importId provided) ──────────────────────────────
      const rows = transactions.map((tx) => ({
        import_id: importId,
        ...(numericUserId !== null ? { user_id: numericUserId } : {}),
        ...(orgId !== null ? { org_id: orgId } : {}),
        title: tx.title ?? "Transaction",
        amount: Math.abs(Number(tx.amount) || 0),
        transaction_type: tx.transaction_type === "credit" ? "credit" : "debit",
        date_time: tx.date_time ?? new Date().toISOString(),
        description: tx.description ?? "",
        running_balance: tx.running_balance ?? null,
        is_duplicate: false,
        status: "pending",
      }));
      await sbFetch("pending_transactions", userJwt, "POST", rows);
    } else {
      // ── Direct insert path (no importId — no review step needed) ─────────────
      const rows = transactions.map((tx) => {
        const isCredit = tx.transaction_type === "credit";
        const absAmt = Math.abs(Number(tx.amount) || 0);
        return {
          ...(numericUserId !== null ? { user_id: numericUserId } : {}),
          ...(orgId !== null ? { org_id: orgId } : {}),
          title: tx.title ?? "Transaction",
          amount: isCredit ? absAmt : -absAmt,
          type: "Business",
          date_time: tx.date_time ?? new Date().toISOString(),
          description: tx.description ?? tx.title ?? "",
          deductible: !isCredit,
          is_ai_verified: false,
          // Store source document UUID in file_path so deleting the doc
          // can also clean up its transactions (no extra column needed)
          ...(documentId ? { file_path: documentId } : {}),
        };
      });
      await sbFetch("transactions", userJwt, "POST", rows);
    }
  }

  // ── 5. Mark import as completed (only if we have an importId) ──────────────
  if (importId) {
    await sbFetch(
      `statement_imports?id=eq.${importId}`,
      userJwt,
      "PATCH",
      { status: "completed" }
    );
  }

  res.json({ ok: true, count: transactions.length });
});

async function markFailed(importId: number, jwt: string, message: string) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/statement_imports?id=eq.${importId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "failed", error_message: message }),
    });
  } catch {}
}

export default router;
