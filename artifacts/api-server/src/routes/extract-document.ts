import { Router } from "express";
import { createRequire } from "node:module";
import { requireAuth } from "../middlewares/require-auth";
import {
  STATEMENT_PROMPT_VERSION,
  STATEMENT_SCHEMA_VERSION,
  hasAnyNonZeroValue,
  normalizeStatementType,
  parseStructuredStatement,
  sha256,
  statementFields,
  validateAccounting,
} from "../lib/financial-statements";

const _require = createRequire(import.meta.url);
type PdfParseResult = { text: string; numpages: number };
const pdfParse = _require("pdf-parse") as (buf: Buffer) => Promise<PdfParseResult>;
const router = Router();

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 40;
const MAX_TEXT_CHARS = 120_000;

type DetectedFormat = "pdf" | "png" | "jpeg" | "webp" | "csv" | "xlsx" | "docx" | "text";

export function detectFormat(buffer: Buffer, suppliedMime: string, filename = ""): DetectedFormat {
  const ext = filename.toLowerCase().split(".").pop();
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buffer.subarray(0, 4).toString("hex") === "d0cf11e0") {
    throw new Error(ext === "xls" ? "Legacy .xls files are unsupported. Save as .xlsx or CSV." : "Legacy .doc files are unsupported. Save as .docx or PDF.");
  }
  if (buffer.subarray(0, 2).toString("ascii") === "PK") {
    if (ext === "xlsx" || suppliedMime.includes("spreadsheet")) return "xlsx";
    if (ext === "docx" || suppliedMime.includes("wordprocessingml")) return "docx";
    throw new Error("Unsupported ZIP-based document format.");
  }
  if (ext === "csv" || suppliedMime === "text/csv") return "csv";
  if (suppliedMime.startsWith("text/") || ext === "txt") return "text";
  throw new Error("Unsupported file format. Use PDF, JPG, PNG, WebP, CSV, XLSX, DOCX, or text.");
}

export function parseDelimited(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t", "|"];
  const delimiter = candidates.sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\"") {
      if (quoted && text[i + 1] === "\"") { field += "\""; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  row.push(field); if (row.some(Boolean)) rows.push(row);
  return rows.map((cells, index) => `row ${index + 1}: ${cells.map((v, i) => `c${i + 1}=${JSON.stringify(v)}`).join(" | ")}`).join("\n");
}

async function extractLocalText(format: DetectedFormat, buffer: Buffer): Promise<{ text: string; pages: number | null }> {
  if (format === "pdf") {
    const parsed = await pdfParse(buffer);
    if (parsed.numpages > MAX_PDF_PAGES) throw new Error(`PDF exceeds the ${MAX_PDF_PAGES}-page extraction limit.`);
    return { text: parsed.text?.trim() ?? "", pages: parsed.numpages };
  }
  if (format === "csv") return { text: parseDelimited(buffer.toString("utf8")), pages: null };
  if (format === "xlsx") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const text = workbook.SheetNames.map(name => {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false });
      return `SHEET ${JSON.stringify(name)}\n${parseDelimited(csv)}`;
    }).join("\n\n");
    return { text, pages: null };
  }
  if (format === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value.trim(), pages: null };
  }
  if (format === "text") return { text: buffer.toString("utf8"), pages: null };
  return { text: "", pages: null };
}

function jsonSchema(type: "pnl" | "bs" | "cf") {
  const fields = statementFields(type);
  return {
    name: `financial_statement_${type}`,
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["metadata", "values", "evidence", "warnings", "confidence"],
      properties: {
        metadata: {
          type: "object", additionalProperties: false,
          required: ["statement_type", "entity_name", "period_start", "period_end", "as_of_date", "currency", "scale", "comparative_periods"],
          properties: {
            statement_type: { type: "string", enum: [type] },
            entity_name: { type: ["string", "null"] },
            period_start: { type: ["string", "null"] },
            period_end: { type: ["string", "null"] },
            as_of_date: { type: ["string", "null"] },
            currency: { type: "string", pattern: "^[A-Z]{3}$" },
            scale: { type: "string", enum: ["ones", "thousands", "millions"] },
            comparative_periods: { type: "array", items: {
              type: "object", additionalProperties: false,
              required: ["label", "period_start", "period_end", "as_of_date"],
              properties: {
                label: { type: "string" }, period_start: { type: ["string", "null"] },
                period_end: { type: ["string", "null"] }, as_of_date: { type: ["string", "null"] },
              },
            }},
          },
        },
        values: {
          type: "object", additionalProperties: false, required: [...fields],
          properties: Object.fromEntries(fields.map(field => [field, { type: ["number", "null"] }])),
        },
        evidence: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["field", "page", "location", "excerpt"],
          properties: {
            field: { type: "string", enum: [...fields] }, page: { type: ["integer", "null"], minimum: 1 },
            location: { type: ["string", "null"] }, excerpt: { type: ["string", "null"] },
          },
        }},
        warnings: { type: "array", items: { type: "string" } },
        confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
      },
    },
  };
}

function extractionPrompt(type: "pnl" | "bs" | "cf") {
  return `Extract the requested ${type} statement into the supplied strict schema.
Preserve signs: parentheses normally mean negative. Detect whether displayed values are ones, thousands, or millions, but return numbers exactly as displayed before scale multiplication.
Use null when a value is absent; genuine printed zero must be 0. Never infer a missing amount merely to force a statement to balance.
Dates must be YYYY-MM-DD. Currency must be ISO 4217. Select the primary/current comparative column and list other columns in comparative_periods.
For every non-null value include evidence with a one-based page when known and a concise row/cell/location. Do not include sensitive content beyond short evidence excerpts.`;
}

router.post("/extract-document", requireAuth, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) { res.status(500).json({ error: "extraction_unavailable" }); return; }
  const { fileData, mimeType, docType, filename } = req.body as {
    fileData?: string; mimeType?: string; docType?: string; filename?: string;
  };
  const type = normalizeStatementType(docType);
  if (!fileData || !mimeType || !type) { res.status(400).json({ error: "invalid_request" }); return; }
  const buffer = Buffer.from(fileData.includes(",") ? fileData.split(",").pop()! : fileData, "base64");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
    res.status(413).json({ error: "file_size_limit", maxBytes: MAX_FILE_BYTES }); return;
  }
  let format: DetectedFormat;
  let local: { text: string; pages: number | null };
  try {
    format = detectFormat(buffer, mimeType, filename);
  } catch (error) {
    res.status(422).json({ error: "unsupported_format", message: error instanceof Error ? error.message : "Unsupported document format." }); return;
  }
  try {
    local = await extractLocalText(format, buffer);
  } catch (error) {
    if (format === "pdf") {
      // A PDF that the local text layer cannot decode may still be readable by
      // the provider's multimodal PDF input. Treat it like a scanned PDF
      // instead of dropping the user into an empty manual template.
      local = { text: "", pages: null };
    } else {
      res.status(422).json({ error: "unreadable_document", message: error instanceof Error ? error.message : "Could not read document." }); return;
    }
  }
  if (local.text.length > MAX_TEXT_CHARS) {
    res.status(413).json({ error: "extraction_text_limit", maxChars: MAX_TEXT_CHARS }); return;
  }
  const imageMime = format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
  const scannedPdf = format === "pdf" && local.text.length < 100;
  const content: unknown[] = [];
  if (["png", "jpeg", "webp"].includes(format)) {
    content.push({ type: "image_url", image_url: { url: `data:${imageMime};base64,${buffer.toString("base64")}`, detail: "high" } });
  } else {
    content.push({ type: "text", text: `Extracted document content:\n${local.text}` });
  }
  content.push({ type: "text", text: extractionPrompt(type) });
  try {
    const endpoint = scannedPdf ? "https://api.openai.com/v1/responses" : "https://api.openai.com/v1/chat/completions";
    const requestBody = scannedPdf
      ? {
          model: "gpt-4.1-mini", temperature: 0, max_output_tokens: 4096,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: "You are a precise financial statement parser. Return only schema-valid data." }],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_file",
                  filename: filename || "statement.pdf",
                  file_data: `data:application/pdf;base64,${buffer.toString("base64")}`,
                },
                { type: "input_text", text: extractionPrompt(type) },
              ],
            },
          ],
          text: { format: { type: "json_schema", ...jsonSchema(type) } },
        }
      : {
          model: "gpt-4.1-mini", temperature: 0, max_tokens: 4096,
          messages: [{ role: "system", content: "You are a precise financial statement parser. Return only schema-valid data." }, { role: "user", content }],
          response_format: { type: "json_schema", json_schema: jsonSchema(type) },
        };
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
    });
    if (!upstream.ok) {
      res.status(502).json({ error: "provider_error", message: "The AI provider could not process this document." }); return;
    }
    const payload = await upstream.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
      model?: string;
      system_fingerprint?: string;
    };
    const rawText = payload.choices?.[0]?.message?.content
      ?? payload.output_text
      ?? payload.output?.flatMap(item => item.content ?? []).map(item => item.text ?? "").join("")
      ?? "";
    let raw: unknown;
    try { raw = JSON.parse(rawText); } catch { throw new Error("Provider returned malformed JSON."); }
    const normalized = parseStructuredStatement(raw, type);
    const validation = validateAccounting(normalized);
    const warnings = [...normalized.warnings];
    if (!hasAnyNonZeroValue(normalized)) warnings.push("All extracted numeric values are zero or missing; explicit user confirmation is required.");
    res.json({
      extracted: normalized, docType: type, validation, warnings,
      rawResponse: raw, fileHash: sha256(buffer), detectedFormat: format, pageCount: local.pages,
      model: payload.model ?? "gpt-4.1-mini", modelVersion: payload.system_fingerprint ?? null,
      promptVersion: STATEMENT_PROMPT_VERSION, schemaVersion: STATEMENT_SCHEMA_VERSION,
    });
  } catch {
    res.status(502).json({ error: "invalid_provider_response", message: "The extracted data did not match the required financial statement schema." });
  }
});

export default router;
