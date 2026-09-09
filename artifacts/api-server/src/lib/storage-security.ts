const DOCUMENT_BUCKET = "documents";

export function normalizeOwnedStoragePath(rawPath: unknown, authUserId: string): string | null {
  if (typeof rawPath !== "string" || !rawPath || rawPath.includes("\0")) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath).replace(/^\/+/, "");
  } catch {
    return null;
  }
  if (decoded.includes("\\") || decoded.split("/").some(part => part === ".." || part === ".")) return null;
  const parts = decoded.split("/");
  return parts.length >= 2 && parts[0] === authUserId && parts.slice(1).every(Boolean) ? decoded : null;
}

export function ownedDocumentPathFromUrl(rawUrl: unknown, authUserId: string, supabaseUrl: string): string | null {
  if (typeof rawUrl !== "string") return null;
  let candidate: URL;
  let expected: URL;
  try {
    candidate = new URL(rawUrl);
    expected = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (candidate.origin !== expected.origin || candidate.username || candidate.password) return null;
  const marker = `/storage/v1/object/`;
  if (!candidate.pathname.startsWith(marker)) return null;
  const remainder = candidate.pathname.slice(marker.length);
  const prefixes = [`public/${DOCUMENT_BUCKET}/`, `sign/${DOCUMENT_BUCKET}/`, `${DOCUMENT_BUCKET}/`];
  const prefix = prefixes.find(value => remainder.startsWith(value));
  if (!prefix) return null;
  return normalizeOwnedStoragePath(remainder.slice(prefix.length), authUserId);
}

export const STORAGE_SECURITY = { documentBucket: DOCUMENT_BUCKET } as const;
