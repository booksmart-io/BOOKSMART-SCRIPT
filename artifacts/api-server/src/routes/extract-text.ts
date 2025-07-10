import { Router } from "express";
import { requireAuth } from "../middlewares/require-auth";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
type PdfParseResult = { text: string; numpages: number };
// pdf-parse v1 exports a plain function via module.exports
const pdfParse = _require("pdf-parse") as (buf: Buffer) => Promise<PdfParseResult>;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const router = Router();

/**
 * POST /api/extract-text
 * Body: { fileData: string }  — base64 data-URL of a PDF
 * Returns: { text: string, isScanned: boolean }
 *
 * Step 1: pdf-parse (fast, works for text-layer PDFs)
 * Step 2: If text is empty/short (scanned image PDF) → Gemini Flash vision
 *         via OpenRouter. Gemini can read scanned PDFs natively.
 */
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

    // ── Step 1: pdf-parse text extraction ────────────────────────────────────
    try {
      const result = await pdfParse(buffer);
      text = (result.text ?? "").trim();
      console.log(`[extract-text] pdf-parse got ${text.length} chars`);
    } catch (e) {
      console.warn("[extract-text] pdf-parse failed:", e);
      text = "";
    }

    const needsVision = text.length < 50;

    // ── Step 2: Gemini vision fallback for scanned PDFs ───────────────────────
    if (needsVision) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        console.warn("[extract-text] No OPENROUTER_API_KEY — cannot use vision fallback");
      } else {
        console.log("[extract-text] Scanned PDF — using Gemini vision fallback");
        try {
          const visionRes = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": "https://booksmart.app",
              "X-Title": "BookSmart",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:application/pdf;base64,${base64}`,
                      },
                    },
                    {
                      type: "text",
                      text: "This is a bank statement. Please extract ALL transactions from it as plain text. For each transaction include: date, description/merchant name, and amount (negative for debits/withdrawals, positive for credits/deposits). Return only the raw transaction data as plain text — no markdown, no headings, no explanations.",
                    },
                  ],
                },
              ],
            }),
          });

          if (visionRes.ok) {
            const visionData = (await visionRes.json()) as {
              choices?: { message?: { content?: string } }[];
            };
            const extracted = visionData.choices?.[0]?.message?.content ?? "";
            console.log(`[extract-text] Gemini vision got ${extracted.length} chars`);
            if (extracted.length > 10) {
              text = extracted;
            }
          } else {
            const errBody = await visionRes.text();
            console.warn(`[extract-text] Gemini vision error ${visionRes.status}:`, errBody);
          }
        } catch (e) {
          console.warn("[extract-text] Gemini vision fallback threw:", e);
        }
      }
    }

    // is_scanned tells n8n whether to use the image path (file from storage)
    // or the text path (extracted_text field). Since we always extract text
    // ourselves (pdf-parse OR Gemini), always use the text path — even if the
    // original PDF was a scanned image. Setting is_scanned=true when the file
    // in storage is still a PDF causes n8n to fail with "unsupported image format".
    const isScanned = false;

    res.json({ text, isScanned });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
