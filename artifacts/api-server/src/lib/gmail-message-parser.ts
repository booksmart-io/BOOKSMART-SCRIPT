export type GmailPayloadPart = {
  mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPayloadPart[];
};

export type GmailParsedMessage = {
  plainText: string | null; htmlText: string | null;
  attachments: Array<{ attachmentId: string; filename: string; mimeType: string; size: number | null }>;
};

const MAX_BODY_CHARS = 100_000;
const supportedAttachmentTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);

export function decodeGmailBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value)) throw new Error("Invalid Gmail body encoding");
  return Buffer.from(value, "base64url").toString("utf8");
}

export function htmlToReceiptText(html: string) {
  return html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, MAX_BODY_CHARS);
}

export function parseGmailPayload(payload: GmailPayloadPart): GmailParsedMessage {
  const plain: string[] = []; const html: string[] = []; const attachments: GmailParsedMessage["attachments"] = [];
  const visit = (part: GmailPayloadPart) => {
    const mimeType = String(part.mimeType ?? "").toLowerCase();
    const filename = String(part.filename ?? "").trim().slice(0, 300);
    const attachmentId = part.body?.attachmentId?.trim();
    if (attachmentId && filename && supportedAttachmentTypes.has(mimeType)) attachments.push({ attachmentId: attachmentId.slice(0, 500), filename, mimeType, size: Number.isSafeInteger(part.body?.size) ? Number(part.body?.size) : null });
    if (part.body?.data && mimeType === "text/plain") plain.push(decodeGmailBase64Url(part.body.data));
    if (part.body?.data && mimeType === "text/html") html.push(htmlToReceiptText(decodeGmailBase64Url(part.body.data)));
    for (const child of part.parts ?? []) visit(child);
  };
  visit(payload);
  const bounded = (values: string[]) => values.map(value => value.trim()).filter(Boolean).join("\n").slice(0, MAX_BODY_CHARS) || null;
  return { plainText: bounded(plain), htmlText: bounded(html), attachments };
}
