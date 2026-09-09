import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function encryptionKey(): Buffer {
  const secret = process.env.PLAID_TOKEN_ENCRYPTION_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Plaid token encryption key is not configured");
  return createHash("sha256").update(secret).digest();
}

function decode(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encrypted Plaid token");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new Error("Invalid encrypted Plaid token");
  return decoded;
}

export function plaidTokenNeedsEncryption(value: string): boolean {
  return !value.startsWith(`${VERSION}.`);
}

export function encryptPlaidToken(value: string): string {
  if (!value) throw new Error("Cannot encrypt an empty Plaid token");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${VERSION}.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptPlaidToken(value: string): string {
  // Existing development/sandbox rows predate application encryption. They
  // remain usable so they can be upgraded in place on their next safe use.
  if (plaidTokenNeedsEncryption(value)) return value;
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== VERSION || !iv || !tag || !encrypted || extra) throw new Error("Invalid encrypted Plaid token");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), decode(iv));
  decipher.setAuthTag(decode(tag));
  return Buffer.concat([decipher.update(decode(encrypted)), decipher.final()]).toString("utf8");
}
