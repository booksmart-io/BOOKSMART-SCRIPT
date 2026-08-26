import type { GmailApiMessage, GmailScanClient } from "./gmail-scan";

type FetchLike = typeof fetch;
export class GmailConnectionError extends Error {
  constructor(public readonly code: "reauthorization_required" | "temporarily_unavailable", message: string) { super(message); }
}

export async function refreshGmailAccessToken(refreshToken: string, options: { fetchImpl?: FetchLike; clientId?: string; clientSecret?: string } = {}) {
  const clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Gmail OAuth is not configured.");
  const response = await (options.fetchImpl ?? fetch)("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !body.access_token || !body.expires_in) {
    if (body.error === "invalid_grant") throw new GmailConnectionError("reauthorization_required", "Gmail authorization has expired. Reconnect Gmail.");
    throw new GmailConnectionError("temporarily_unavailable", "Gmail is temporarily unavailable. Try again.");
  }
  return { accessToken: body.access_token, expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString() };
}

async function gmailRequest<T>(accessToken: string, path: string, fetchImpl: FetchLike): Promise<T> {
  const response = await fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 401 || response.status === 403) throw new GmailConnectionError("reauthorization_required", "Gmail authorization must be renewed.");
  if (!response.ok) throw new GmailConnectionError("temporarily_unavailable", "Gmail is temporarily unavailable. Try again.");
  return response.json() as Promise<T>;
}

export function createGmailScanClient(accessToken: string, fetchImpl: FetchLike = fetch): GmailScanClient & { getAttachment(messageId: string, attachmentId: string): Promise<string> } {
  return {
    async listMessageIds(query, limit) {
      const params = new URLSearchParams({ q: query, maxResults: String(Math.min(Math.max(limit, 1), 100)) });
      const body = await gmailRequest<{ messages?: Array<{ id?: string }> }>(accessToken, `messages?${params}`, fetchImpl);
      return (body.messages ?? []).map(item => item.id ?? "").filter(Boolean);
    },
    getMessage(messageId) {
      return gmailRequest<GmailApiMessage>(accessToken, `messages/${encodeURIComponent(messageId)}?format=full`, fetchImpl);
    },
    async getAttachment(messageId, attachmentId) {
      const body = await gmailRequest<{ data?: string }>(accessToken, `messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, fetchImpl);
      if (!body.data) throw new GmailConnectionError("temporarily_unavailable", "Gmail attachment data is unavailable.");
      return body.data;
    },
  };
}
