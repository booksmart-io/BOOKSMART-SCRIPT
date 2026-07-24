import { Router } from "express";
import { requireAuth } from "../middlewares/require-auth";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
type PdfParseResult = { text: string; numpages: number };
const pdfParse = _require("pdf-parse") as (buf: Buffer) => Promise<PdfParseResult>;

const router = Router();

type OpenAiResponsePayload = {
  output_text?: string;
  output?: { content?: { text?: string }[] }[];
};

function responseOutputText(payload: OpenAiResponsePayload) {
  return payload.output_text?.trim()
    ?? payload.output?.flatMap(o => o.content ?? []).map(c => c.text ?? "").join("\n").trim()
    ?? "";
}

async function ocrPdfWithOpenAi(apiKey: string, base64: string) {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [{
        role: "user",
        content: [
          {
            type: "input_file",
            filename: "bank-statement.pdf",
            file_data: `data:application/pdf;base64,${base64}`,
          },
          {
            type: "input_text",
            text: "This is a bank statement. Extract ALL transaction lines as plain text. Include date, description, amount, and balance when available. Return only raw transaction text.",
          },
        ],
      }],
    }),
  });
}

router.post("/extract-text", requireAuth, async (req, res) => {
  try {
    const { fileData } = req.body as { fileData?: string };
    if (!fileData) {
      res.status(400).json({ error: "fileData is required" });
      return;
    }

    const base64 = fileData.includes(",") ? fileData.split(",")[1] : fileData;
    const buffer = Buffer.from(base64, "base64");

    let text = "";
    try {
      const result = await pdfParse(buffer);
      text = (result.text ?? "").trim();
      console.log(`[extract-text] pdf-parse got ${text.length} chars`);
    } catch (e) {
      console.warn("[extract-text] pdf-parse failed:", e);
    }

    if (text.length < 50) {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        console.warn("[extract-text] No OPENAI_API_KEY - cannot use OpenAI PDF OCR fallback");
      } else {
        console.log("[extract-text] using OpenAI PDF OCR fallback");
        const visionRes = await ocrPdfWithOpenAi(apiKey, base64);
        if (visionRes.ok) {
          const payload = await visionRes.json() as OpenAiResponsePayload;
          const extracted = responseOutputText(payload);
          console.log(`[extract-text] OpenAI OCR got ${extracted.length} chars`);
          if (extracted.length > 10) text = extracted;
        } else {
          const errBody = await visionRes.text();
          console.warn(`[extract-text] OpenAI OCR error ${visionRes.status}:`, errBody);
        }
      }
    }

    // Keep the old n8n contract: even when OCR was needed, the frontend stores
    // extracted_text and n8n should use the text path. If this is true for a PDF,
    // n8n may treat the stored PDF as an image and fail downstream.
    const isScanned = false;

    res.json({ text, isScanned });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
