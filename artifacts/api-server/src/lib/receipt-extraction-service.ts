import { CONTRACTOR_RECEIPT_PROMPT, contractorReceiptJsonSchema, normalizeContractorReceipt, type ContractorReceiptExtraction } from "./contractor-receipt";

type FetchLike = typeof fetch;
export class ReceiptExtractionUpstreamError extends Error {}

function providerText(payload: any) {
  return payload?.output_text ?? payload?.output?.flatMap((item: any) => item.content ?? []).map((item: any) => item.text ?? "").join("") ?? "";
}

async function requestReceiptExtraction(userContent: Array<Record<string, unknown>>, options: { apiKey?: string; fetchImpl?: FetchLike } = {}): Promise<ContractorReceiptExtraction> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("Receipt extraction is not configured.");
  const upstream = await (options.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-4.1-mini", temperature: 0, max_output_tokens: 4096,
      input: [
        { role: "system", content: [{ type: "input_text", text: "Extract contractor receipt facts. Return only strict schema-valid data." }] },
        { role: "user", content: [...userContent, { type: "input_text", text: CONTRACTOR_RECEIPT_PROMPT }] },
      ], text: { format: { type: "json_schema", ...contractorReceiptJsonSchema } },
    }),
  });
  if (!upstream.ok) throw new ReceiptExtractionUpstreamError("Receipt extraction failed.");
  try { return normalizeContractorReceipt(JSON.parse(providerText(await upstream.json()))); }
  catch { throw new ReceiptExtractionUpstreamError("Receipt extraction returned invalid data."); }
}

export function extractReceiptFile(input: { filename: string; mimeType: string; base64Data: string }, options?: { apiKey?: string; fetchImpl?: FetchLike }) {
  const fileContent = input.mimeType === "application/pdf"
    ? { type: "input_file", filename: input.filename, file_data: `data:${input.mimeType};base64,${input.base64Data}` }
    : { type: "input_image", image_url: `data:${input.mimeType};base64,${input.base64Data}`, detail: "high" };
  return requestReceiptExtraction([fileContent], options);
}

export function extractReceiptText(text: string, options?: { apiKey?: string; fetchImpl?: FetchLike }) {
  const bounded = text.trim().slice(0, 100_000);
  if (!bounded) throw new Error("Receipt text is empty.");
  return requestReceiptExtraction([{ type: "input_text", text: `Receipt email content:\n${bounded}` }], options);
}
