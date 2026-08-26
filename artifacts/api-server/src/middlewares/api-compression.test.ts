import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Request, Response } from "express";
import { API_COMPRESSION_THRESHOLD_BYTES, apiCompressionFilter } from "./api-compression";

test("uses a conservative threshold for API response compression", () => {
  assert.equal(API_COMPRESSION_THRESHOLD_BYTES, 1_024);
});

test("allows diagnostic clients to opt out of compression", () => {
  const req = { headers: { "x-no-compression": "1" } } as unknown as Request;
  const res = {} as Response;
  assert.equal(apiCompressionFilter(req, res), false);
});

test("compresses large JSON responses and preserves their contents", async () => {
  const app = express();
  app.use((await import("./api-compression")).apiCompression);
  app.get("/large", (_req, res) => res.json({ rows: Array.from({ length: 300 }, (_, index) => ({ index, label: "BookSmart financial record" })) }));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/large`, { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-encoding"), "gzip");
    const body = await response.json() as { rows: unknown[] };
    assert.equal(body.rows.length, 300);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
