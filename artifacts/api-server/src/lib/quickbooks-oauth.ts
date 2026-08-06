import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";

type OAuthState = {
  userId: string;
  organizationId: number;
  nonce: string;
  expiresAt: number;
};

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function stateSecret(): string {
  const secret = process.env.QUICKBOOKS_STATE_SECRET ?? process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!secret) throw new Error("QuickBooks OAuth state secret is not configured");
  return secret;
}

function encryptionKey(): Buffer {
  const secret = process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("QuickBooks token encryption key is not configured");
  return createHash("sha256").update(secret).digest();
}

export function createOAuthState(userId: string, organizationId: number, ttlSeconds = 600): string {
  const state: OAuthState = {
    userId,
    organizationId,
    nonce: randomBytes(24).toString("base64url"),
    expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payload = base64url(JSON.stringify(state));
  const signature = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(value: string): OAuthState {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) throw new Error("Invalid OAuth state");
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error("Invalid OAuth state signature");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
  if (!parsed.userId || !Number.isSafeInteger(parsed.organizationId) || parsed.organizationId <= 0 ||
      !parsed.nonce || !Number.isSafeInteger(parsed.expiresAt)) {
    throw new Error("Invalid OAuth state payload");
  }
  if (parsed.expiresAt < Math.floor(Date.now() / 1000)) throw new Error("OAuth state expired");
  return parsed;
}

export function hashOAuthState(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptToken(value: string): string {
  const [version, ivValue, tagValue, encryptedValue, extra] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue || extra) {
    throw new Error("Invalid encrypted token");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
