import { Router } from "express";
import { createRequire } from "node:module";
import { requireAuth } from "../middlewares/require-auth";

const _require = createRequire(import.meta.url);
type PdfParseResult = { text: string; numpages: number };
const pdfParse = _require("pdf-parse") as (buffer: Buffer) => Promise<PdfParseResult>;

const router = Router();
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 40;
const MAX_TEXT_CHARS = 100_000;

type ProviderPayload = {
  choices?: Array<{ message?: { content?: string } }>;
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
};

const addressSchema = {
  type: ["object", "null"],
  additionalProperties: false,
  required: ["street", "suite", "city", "state", "postalCode", "country"],
  properties: {
    street: { type: ["string", "null"] },
    suite: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    state: { type: ["string", "null"] },
    postalCode: { type: ["string", "null"] },
    country: { type: ["string", "null"] },
  },
};

const extractionSchema = {
  name: "business_registration_document",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "businessName",
      "entityType",
      "formationState",
      "formationDate",
      "principalAddress",
      "registrationNumber",
      "registeredAgent",
      "organizers",
      "warnings",
    ],
    properties: {
      businessName: { type: ["string", "null"] },
      entityType: { type: ["string", "null"] },
      formationState: { type: ["string", "null"] },
      formationDate: { type: ["string", "null"], description: "ISO date YYYY-MM-DD when explicitly printed." },
      principalAddress: addressSchema,
      registrationNumber: { type: ["string", "null"] },
      registeredAgent: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["name", "address"],
        properties: {
          name: { type: ["string", "null"] },
          address: addressSchema,
        },
      },
      organizers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name"],
          properties: { name: { type: ["string", "null"] } },
        },
      },
      warnings: { type: "array", items: { type: "string" } },
    },
  },
};

const extractionPrompt = `Extract only facts explicitly printed in this official business registration document.
Return null when a field is absent or ambiguous. Never guess or supplement from outside knowledge.
formationDate must be YYYY-MM-DD only when the complete date is printed.
Keep entityType as the legal entity wording in the document.
principalAddress means the business's principal/business address, not the registered agent's address.
registrationNumber means the state filing, charter, document, or registration number.
Do not extract or infer EIN/TIN, industry, revenue, expenses, employees, contractors, federal tax classification, business goals, funding needs, accounting method, or tax-strategy answers.
Add a short warning when the document is not a business registration document or a value is materially ambiguous.`;

function providerText(payload: ProviderPayload) {
  return payload.choices?.[0]?.message?.content
    ?? payload.output_text
    ?? payload.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("")
    ?? "";
}

function isPdf(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

router.post("/business-document/extract", requireAuth, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ error: "extraction_unavailable", message: "Business document extraction is temporarily unavailable." });
    return;
  }

  const { fileData, mimeType, filename } = req.body as {
    fileData?: string;
    mimeType?: string;
    filename?: string;
  };
  if (!fileData || mimeType !== "application/pdf") {
    res.status(400).json({ error: "unsupported_file", message: "Choose a PDF business registration document." });
    return;
  }

  let buffer: Buffer;
  try {
    const encoded = fileData.includes(",") ? fileData.split(",").pop()! : fileData;
    buffer = Buffer.from(encoded, "base64");
  } catch {
    res.status(400).json({ error: "invalid_file", message: "The selected PDF could not be read." });
    return;
  }
  if (!buffer.length || !isPdf(buffer)) {
    res.status(422).json({ error: "invalid_pdf", message: "The selected file is not a valid PDF." });
    return;
  }
  if (buffer.length > MAX_FILE_BYTES) {
    res.status(413).json({ error: "file_size_limit", message: "The PDF must be 10 MB or smaller." });
    return;
  }

  let text = "";
  let pageCount: number | null = null;
  try {
    const parsed = await pdfParse(buffer);
    pageCount = parsed.numpages;
    if (pageCount > MAX_PDF_PAGES) {
      res.status(413).json({ error: "page_limit", message: `The PDF must be ${MAX_PDF_PAGES} pages or fewer.` });
      return;
    }
    text = parsed.text?.trim() ?? "";
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("password") || message.includes("encrypted")) {
      res.status(422).json({ error: "password_protected_pdf", message: "Remove the PDF password and try again." });
      return;
    }
    // A scanned PDF may have no readable local text layer; multimodal extraction can still process it.
  }

  if (text.length > MAX_TEXT_CHARS) {
    res.status(413).json({ error: "text_limit", message: "The PDF contains too much text to process safely." });
    return;
  }

  const scannedPdf = text.length < 100;
  const endpoint = scannedPdf
    ? "https://api.openai.com/v1/responses"
    : "https://api.openai.com/v1/chat/completions";
  const requestBody = scannedPdf
    ? {
        model: "gpt-4o",
        temperature: 0,
        max_output_tokens: 4096,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: "Extract structured business registration facts. Return only schema-valid data." }],
          },
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: filename || "business-registration.pdf",
                file_data: `data:application/pdf;base64,${buffer.toString("base64")}`,
              },
              { type: "input_text", text: extractionPrompt },
            ],
          },
        ],
        text: { format: { type: "json_schema", ...extractionSchema } },
      }
    : {
        model: "gpt-4o",
        temperature: 0,
        max_tokens: 4096,
        messages: [
          { role: "system", content: "Extract structured business registration facts. Return only schema-valid data." },
          { role: "user", content: `${extractionPrompt}\n\nDocument text:\n${text}` },
        ],
        response_format: { type: "json_schema", json_schema: extractionSchema },
      };

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
    });
    if (!upstream.ok) {
      res.status(502).json({ error: "extraction_failed", message: "BookSmart could not extract this document. Try another PDF or enter the details manually." });
      return;
    }
    const rawText = providerText(await upstream.json() as ProviderPayload);
    const extracted = JSON.parse(rawText) as Record<string, unknown>;
    if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) {
      throw new Error("Invalid structured response");
    }
    res.json({ extracted, scannedPdf, pageCount });
  } catch {
    res.status(502).json({ error: "invalid_ai_response", message: "BookSmart could not read the extracted information. Try another PDF or enter the details manually." });
  }
});

export default router;
