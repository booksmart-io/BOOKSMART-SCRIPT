import { Router } from "express";
import { requireAuth } from "../middlewares/require-auth";
import { createRequire } from "node:module";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const _require = createRequire(import.meta.url);
type PdfParseResult = { text: string; numpages: number };
const pdfParse = _require("pdf-parse") as (buf: Buffer) => Promise<PdfParseResult>;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const router = Router();

function getAdminClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, serviceRoleKey, { auth: { persistSession: false } });
}

const SYSTEM_PROMPT = `You are a bank statement parser. Extract every transaction from the document.

Return ONLY a JSON object with a "transactions" array where each item has:
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
- Never return null for title, amount, transaction_type, date_time, or description
- Return only valid JSON.`;

type ParsedTransaction = {
  title: string;
  amount: number;
  transaction_type: "debit" | "credit";
  date_time: string;
  description: string;
  running_balance: number | null;
};

async function sbFetch(path: string, token: string, method = "GET", body?: unknown) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be configured");
  }

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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAiChat(apiKey: string, body: unknown) {
  return fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

async function callOpenAiResponses(apiKey: string, body: unknown) {
  return fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

function responseOutputText(payload: {
  output_text?: string;
  output?: { content?: { text?: string }[] }[];
}) {
  return payload.output_text?.trim()
    ?? payload.output?.flatMap(o => o.content ?? []).map(c => c.text ?? "").join("\n").trim()
    ?? "";
}

async function ocrPdfWithOpenAi(apiKey: string, fileData: string) {
  console.log("[scan-statement] OpenAI PDF OCR request started");
  const res = await callOpenAiResponses(apiKey, {
    model: "gpt-4o",
    input: [{
      role: "user",
      content: [
        {
          type: "input_file",
          filename: "bank-statement.pdf",
          file_data: `data:application/pdf;base64,${fileData}`,
        },
        {
          type: "input_text",
          text: "This is a bank statement. Extract ALL transaction lines as plain text exactly as they appear: date, description, amounts, and balances. No explanations.",
        },
      ],
    }],
    max_output_tokens: 12000,
  });

  if (!res.ok) {
    return { ok: false as const, status: res.status, detail: await res.text() };
  }

  const payload = await res.json() as {
    output_text?: string;
    output?: { content?: { text?: string }[] }[];
  };
  const text = responseOutputText(payload);
  console.log(`[scan-statement] OpenAI PDF OCR request finished with ${text.length} chars`);
  return { ok: true as const, text };
}

async function ocrImageWithOpenAi(apiKey: string, mimeType: string, fileData: string) {
  console.log("[scan-statement] OpenAI image OCR request started");
  const res = await callOpenAiChat(apiKey, {
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileData}`, detail: "high" } },
        { type: "text", text: "This is a bank statement image. Extract ALL transaction lines as plain text: date, description, amounts, and balances. No explanations." },
      ],
    }],
    temperature: 0,
    max_tokens: 4096,
  });

  if (!res.ok) {
    return { ok: false as const, status: res.status, detail: await res.text() };
  }

  const payload = await res.json() as { choices?: { message?: { content?: string } }[] };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  console.log(`[scan-statement] OpenAI image OCR request finished with ${text.length} chars`);
  return { ok: true as const, text };
}

async function parseTransactionsWithOpenAi(apiKey: string, statementText: string, model = "gpt-4o") {
  console.log(`[scan-statement] parsing ${statementText.length} chars with OpenAI ${model}`);
  const res = await callOpenAiChat(apiKey, {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Here is the bank statement:\n\n${statementText}\n\nExtract all transactions.` },
    ],
    temperature: 0,
    max_tokens: 4096,
    response_format: { type: "json_object" },
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("[scan-statement] OpenAI parse failed", res.status, detail);
    return { ok: false as const, status: res.status, detail };
  }

  const payload = await res.json() as { choices?: { message?: { content?: string } }[] };
  const raw = payload.choices?.[0]?.message?.content ?? "{}";
  console.log(`[scan-statement] OpenAI ${model} returned ${raw.length} chars`);
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned) as { transactions?: ParsedTransaction[]; data?: ParsedTransaction[] } | ParsedTransaction[];
  const transactions = Array.isArray(parsed) ? parsed : (parsed.transactions ?? parsed.data ?? []);
  console.log(`[scan-statement] ${model} parsed ${transactions.length} transaction rows`);
  return { ok: true as const, transactions };
}

router.post("/scan-statement", requireAuth, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    res.status(500).json({ error: "missing_openai_key" });
    return;
  }

  const { importId, fileData, mimeType, documentId, org_id } = req.body as {
    importId?: number;
    fileData?: string;
    mimeType?: string;
    documentId?: string;
    org_id?: number;
  };

  if (typeof fileData !== "string" || !mimeType) {
    res.status(400).json({ error: "fileData and mimeType are required" });
    return;
  }

  const userJwt = req.headers.authorization!.slice(7);
  const authUuid = req.supabaseUserId!;
  let admin: SupabaseClient;
  try {
    admin = getAdminClient();
  } catch (err) {
    res.status(500).json({ error: "missing_service_role_key", message: String(err) });
    return;
  }

  let numericUserId: number | null = null;
  let orgId: number | null = null;
  try {
    const { data: userRow } = await admin
      .from("users")
      .select("id")
      .eq("auth_id", authUuid)
      .maybeSingle();
    numericUserId = (userRow as { id: number } | null)?.id ?? null;

    if (numericUserId) {
      if (importId) {
        const { data: importRow } = await admin
          .from("statement_imports")
          .select("org_id")
          .eq("id", importId)
          .eq("user_id", numericUserId)
          .maybeSingle();
        orgId = (importRow as { org_id: number | null } | null)?.org_id ?? null;
      }

      const requestedOrgId = Number(org_id);
      if (orgId === null && Number.isFinite(requestedOrgId) && requestedOrgId > 0) {
        const { data: requestedOrgRow } = await admin
          .from("organizations")
          .select("id")
          .eq("id", requestedOrgId)
          .eq("owner_id", numericUserId)
          .maybeSingle();
        orgId = (requestedOrgRow as { id: number } | null)?.id ?? null;
      }

      if (orgId === null) {
        const { data: orgRows } = await admin
          .from("organizations")
          .select("id")
          .eq("owner_id", numericUserId)
          .order("id", { ascending: true })
          .limit(1);
        orgId = ((orgRows as { id: number }[] | null)?.[0]?.id) ?? null;
      }
    }
  } catch {
    // Continue so the import can still mark failed with a useful error if needed.
  }

  let statementText = "";

  if (mimeType === "application/pdf") {
    try {
      const parsed = await pdfParse(Buffer.from(fileData, "base64"));
      statementText = parsed.text?.trim() ?? "";
      console.log(`[scan-statement] pdf-parse got ${statementText.length} chars`);
    } catch (e) {
      console.warn("[scan-statement] pdf-parse failed:", e);
    }

    if (statementText.length < 50) {
      console.log("[scan-statement] falling back to OpenAI PDF OCR");
      let ocr: Awaited<ReturnType<typeof ocrPdfWithOpenAi>>;
      try {
        ocr = await ocrPdfWithOpenAi(apiKey, fileData);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[scan-statement] OpenAI PDF OCR request threw", err);
        if (importId) await markFailed(admin, importId, `OpenAI OCR request failed: ${message}`);
        res.status(502).json({ error: "vision_request_failed", message });
        return;
      }
      if (!ocr.ok) {
        console.error("[scan-statement] OpenAI PDF OCR failed", ocr.status, ocr.detail);
        if (importId) await markFailed(admin, importId, `OpenAI OCR error: ${ocr.status}`);
        res.status(502).json({ error: "vision_error", status: ocr.status, detail: ocr.detail });
        return;
      }
      statementText = ocr.text;
      console.log(`[scan-statement] OpenAI PDF OCR got ${statementText.length} chars`);
    }
  } else if (mimeType.startsWith("image/")) {
    console.log("[scan-statement] image file - using OpenAI vision OCR");
    let ocr: Awaited<ReturnType<typeof ocrImageWithOpenAi>>;
    try {
      ocr = await ocrImageWithOpenAi(apiKey, mimeType, fileData);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[scan-statement] OpenAI image OCR request threw", err);
      if (importId) await markFailed(admin, importId, `OpenAI OCR request failed: ${message}`);
      res.status(502).json({ error: "vision_request_failed", message });
      return;
    }
    if (!ocr.ok) {
      console.error("[scan-statement] OpenAI image OCR failed", ocr.status, ocr.detail);
      if (importId) await markFailed(admin, importId, `OpenAI OCR error: ${ocr.status}`);
      res.status(502).json({ error: "vision_error", status: ocr.status, detail: ocr.detail });
      return;
    }
    statementText = ocr.text;
  } else {
    statementText = Buffer.from(fileData, "base64").toString("utf-8");
  }

  if (!statementText) {
    if (importId) await markFailed(admin, importId, "Could not extract text from document.");
    res.status(422).json({ error: "no_text_extracted" });
    return;
  }

  let transactions: ParsedTransaction[] = [];
  try {
    let parsed = await parseTransactionsWithOpenAi(apiKey, statementText);
    if (!parsed.ok) {
      console.warn("[scan-statement] retrying parse with gpt-4o-mini");
      parsed = await parseTransactionsWithOpenAi(apiKey, statementText, "gpt-4o-mini");
    }
    if (!parsed.ok) {
      const message = `OpenAI parse error ${parsed.status}: ${parsed.detail.slice(0, 500)}`;
      if (importId) await markFailed(admin, importId, message);
      res.status(502).json({ error: "upstream_error", status: parsed.status, detail: parsed.detail });
      return;
    }
    transactions = parsed.transactions;
  } catch (e) {
    console.error("[scan-statement] parse exception:", e);
    if (importId) await markFailed(admin, importId, `Parse error: ${String(e)}`);
    res.status(502).json({ error: "parse_failed", message: String(e) });
    return;
  }

  if (transactions.length > 0) {
    if (importId !== undefined) {
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
      const { error: insertError } = await admin.from("pending_transactions").insert(rows);
      if (insertError) {
        console.error("[scan-statement] pending transaction insert failed:", insertError);
        await markFailed(admin, importId, `Pending transaction insert error: ${insertError.message}`);
        res.status(502).json({ error: "pending_insert_failed", message: insertError.message, details: insertError.details });
        return;
      }
    } else {
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
          ...(documentId ? { file_path: documentId } : {}),
        };
      });
      const { error: insertError } = await admin.from("transactions").insert(rows);
      if (insertError) {
        res.status(502).json({ error: "transaction_insert_failed", message: insertError.message });
        return;
      }
    }
  }

  if (importId) {
    await admin
      .from("statement_imports")
      .update({ status: "completed", error_message: null })
      .eq("id", importId)
      .eq("user_id", numericUserId);
  }

  res.json({ ok: true, count: transactions.length });
});

async function markFailed(admin: SupabaseClient, importId: number, message: string) {
  try {
    await admin
      .from("statement_imports")
      .update({ status: "failed", error_message: message })
      .eq("id", importId);
  } catch {}
}

export default router;
