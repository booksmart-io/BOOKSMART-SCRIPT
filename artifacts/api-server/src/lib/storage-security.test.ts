import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOwnedStoragePath, ownedDocumentPathFromUrl } from "./storage-security";

const owner = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const base = "https://project.supabase.co";

test("accepts only canonical paths below the authenticated user's folder", () => {
  assert.equal(normalizeOwnedStoragePath(`${owner}/report%202026.pdf`, owner), `${owner}/report 2026.pdf`);
  for (const path of [`${other}/report.pdf`, `${owner}`, `${owner}/../${other}/x.pdf`, `${owner}/`, "", null])
    assert.equal(normalizeOwnedStoragePath(path, owner), null);
});

test("extracts owned public and signed document URLs from the configured Supabase origin", () => {
  assert.equal(ownedDocumentPathFromUrl(`${base}/storage/v1/object/public/documents/${owner}/a.pdf`, owner, base), `${owner}/a.pdf`);
  assert.equal(ownedDocumentPathFromUrl(`${base}/storage/v1/object/sign/documents/${owner}/a.pdf?token=fake`, owner, base), `${owner}/a.pdf`);
});

test("rejects foreign folders, buckets, origins and deceptive URLs", () => {
  for (const url of [
    `${base}/storage/v1/object/sign/documents/${other}/a.pdf?token=fake`,
    `${base}/storage/v1/object/public/userImages/${owner}/a.png`,
    `https://evil.example/storage/v1/object/public/documents/${owner}/a.pdf`,
    `https://project.supabase.co.evil.example/storage/v1/object/public/documents/${owner}/a.pdf`,
  ]) assert.equal(ownedDocumentPathFromUrl(url, owner, base), null);
});
