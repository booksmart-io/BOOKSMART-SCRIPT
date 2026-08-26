import { classifyGmailFinancialMetadata, CONTRACTOR_GMAIL_TARGETED_QUERIES } from "./contractor-gmail";
import { parseGmailPayload, type GmailPayloadPart } from "./gmail-message-parser";

export type GmailApiMessage = { id: string; threadId?: string; internalDate?: string; snippet?: string; payload?: GmailPayloadPart & { headers?: Array<{ name?: string; value?: string }> } };
export type GmailScanClient = { listMessageIds(query: string, limit: number): Promise<string[]>; getMessage(id: string): Promise<GmailApiMessage> };
export type GmailScanCandidate = { messageId: string; threadId: string | null; sender: string | null; subject: string | null; messageDate: string | null; classification: ReturnType<typeof classifyGmailFinancialMetadata>; plainText: string | null; htmlText: string | null; attachments: ReturnType<typeof parseGmailPayload>["attachments"] };

const header = (message: GmailApiMessage, name: string) => message.payload?.headers?.find(item => item.name?.toLowerCase() === name)?.value?.trim().slice(0, 1000) || null;

export async function scanGmailCandidates(client: GmailScanClient, options: { limit?: number; queries?: readonly string[] } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
  const ids = new Set<string>();
  for (const query of options.queries ?? CONTRACTOR_GMAIL_TARGETED_QUERIES) {
    for (const id of await client.listMessageIds(query, limit)) if (id && ids.size < limit) ids.add(id);
    if (ids.size >= limit) break;
  }
  const candidates: GmailScanCandidate[] = []; const failures: Array<{ messageId: string; error: string }> = []; let ignored = 0;
  for (const messageId of ids) {
    try {
      const message = await client.getMessage(messageId);
      const parsed = parseGmailPayload(message.payload ?? {});
      const messageDate = message.internalDate && Number.isFinite(Number(message.internalDate)) ? new Date(Number(message.internalDate)).toISOString() : header(message, "date");
      const metadata = { messageId, threadId: message.threadId ?? null, sender: header(message, "from"), subject: header(message, "subject"), messageDate, snippet: message.snippet ?? null, attachmentNames: parsed.attachments.map(item => item.filename) };
      const classification = classifyGmailFinancialMetadata(metadata);
      if (!classification.relevant) { ignored += 1; continue; }
      candidates.push({ ...metadata, classification, plainText: parsed.plainText, htmlText: parsed.htmlText, attachments: parsed.attachments });
    } catch (error) { failures.push({ messageId, error: error instanceof Error ? error.message.slice(0, 200) : "message_failed" }); }
  }
  return { reviewed: ids.size, candidates, ignored, failures, accountingEffect: "none" as const };
}
