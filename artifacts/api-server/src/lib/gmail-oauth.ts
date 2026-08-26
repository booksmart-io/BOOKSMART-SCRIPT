import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly" as const;
type GmailOAuthState = { userId: string; organizationId: number; nonce: string; expiresAt: number };

function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url value");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new Error("Invalid base64url value");
  return decoded;
}
function stateSecret() {
  const value = process.env.GMAIL_STATE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!value) throw new Error("Gmail OAuth state secret is not configured");
  return value;
}
function encryptionKey() {
  const value = process.env.GMAIL_TOKEN_ENCRYPTION_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Gmail token encryption key is not configured");
  return createHash("sha256").update(value).digest();
}
export const gmailIntegrationEnabled = () => process.env.GMAIL_INTEGRATION_ENABLED === "true";
export function createGmailOAuthState(userId: string, organizationId: number, ttlSeconds = 600) {
  const state: GmailOAuthState = { userId, organizationId, nonce: randomBytes(24).toString("base64url"), expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${createHmac("sha256", stateSecret()).update(payload).digest("base64url")}`;
}
export function verifyGmailOAuthState(value: string): GmailOAuthState {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) throw new Error("Invalid OAuth state");
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  let received: Buffer;
  try { received = decode(signature); } catch { throw new Error("Invalid OAuth state signature"); }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("Invalid OAuth state signature");
  const parsed = JSON.parse(decode(payload).toString("utf8")) as GmailOAuthState;
  if (!parsed.userId || !Number.isSafeInteger(parsed.organizationId) || parsed.organizationId <= 0 || !parsed.nonce || !Number.isSafeInteger(parsed.expiresAt)) throw new Error("Invalid OAuth state payload");
  if (parsed.expiresAt < Math.floor(Date.now() / 1000)) throw new Error("OAuth state expired");
  return parsed;
}
export const hashGmailOAuthState = (value: string) => createHash("sha256").update(value).digest("hex");
export function encryptGmailToken(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
export function decryptGmailToken(value: string) {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra) throw new Error("Invalid encrypted Gmail token");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), decode(iv)); decipher.setAuthTag(decode(tag));
  return Buffer.concat([decipher.update(decode(encrypted)), decipher.final()]).toString("utf8");
}
