import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

type JobberOAuthState = {
  userId: string;
  organizationId: number;
  nonce: string;
  expiresAt: number;
};

function decodeCanonicalBase64url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url value");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new Error("Invalid base64url value");
  return decoded;
}

function stateSecret(): string {
  const secret = process.env.JOBBER_STATE_SECRET ?? process.env.JOBBER_CLIENT_SECRET;
  if (!secret) throw new Error("Jobber OAuth state secret is not configured");
  return secret;
}

function encryptionKey(): Buffer {
  const secret = process.env.JOBBER_TOKEN_ENCRYPTION_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Jobber token encryption key is not configured");
  return createHash("sha256").update(secret).digest();
}

export function createJobberOAuthState(
  userId: string,
  organizationId: number,
  ttlSeconds = 600,
): string {
  const state: JobberOAuthState = {
    userId,
    organizationId,
    nonce: randomBytes(24).toString("base64url"),
    expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyJobberOAuthState(value: string): JobberOAuthState {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) throw new Error("Invalid OAuth state");
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  let received: Buffer;
  try {
    received = decodeCanonicalBase64url(signature);
  } catch {
    throw new Error("Invalid OAuth state signature");
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error("Invalid OAuth state signature");
  }
  const parsed = JSON.parse(decodeCanonicalBase64url(payload).toString("utf8")) as JobberOAuthState;
  if (
    !parsed.userId ||
    !Number.isSafeInteger(parsed.organizationId) ||
    parsed.organizationId <= 0 ||
    !parsed.nonce ||
    !Number.isSafeInteger(parsed.expiresAt)
  ) {
    throw new Error("Invalid OAuth state payload");
  }
  if (parsed.expiresAt < Math.floor(Date.now() / 1000)) throw new Error("OAuth state expired");
  return parsed;
}

export function hashJobberOAuthState(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createJobberPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function encryptJobberSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptJobberSecret(value: string): string {
  const [version, ivValue, tagValue, encryptedValue, extra] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue || extra) {
    throw new Error("Invalid encrypted Jobber secret");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    decodeCanonicalBase64url(ivValue),
  );
  decipher.setAuthTag(decodeCanonicalBase64url(tagValue));
  return Buffer.concat([
    decipher.update(decodeCanonicalBase64url(encryptedValue)),
    decipher.final(),
  ]).toString("utf8");
}
