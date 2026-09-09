import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithProviderRetry, isRetryableProviderStatus, providerRetryDelayMs } from "./provider-retry";

test("provider retries throttling and temporary outages with bounded backoff", async () => {
  const statuses = [429, 503, 200]; const delays: number[] = [];
  const response = await fetchWithProviderRetry("https://provider.example.test", {}, {
    fetchImpl: async () => new Response("{}", { status: statuses.shift()!, headers: { "retry-after": "99" } }),
    sleep: async ms => { delays.push(ms); },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(delays, [4000, 4000]);
});

test("provider retry does not repeat permanent failures", async () => {
  let calls = 0;
  const response = await fetchWithProviderRetry("https://provider.example.test", {}, {
    fetchImpl: async () => { calls++; return new Response("{}", { status: 400 }); }, sleep: async () => {},
  });
  assert.equal(response.status, 400); assert.equal(calls, 1);
  assert.equal(isRetryableProviderStatus(429), true); assert.equal(isRetryableProviderStatus(500), true);
  assert.equal(isRetryableProviderStatus(401), false);
  assert.equal(providerRetryDelayMs(new Response(null, { status: 503 }), 2), 1000);
});

test("provider retry recovers from transport failure and stops at its limit", async () => {
  let calls = 0;
  const ok = await fetchWithProviderRetry("https://provider.example.test", {}, {
    fetchImpl: async () => { if (++calls === 1) throw new Error("offline"); return new Response("{}", { status: 200 }); }, sleep: async () => {},
  });
  assert.equal(ok.status, 200); assert.equal(calls, 2);
  await assert.rejects(fetchWithProviderRetry("https://provider.example.test", {}, {
    attempts: 2, fetchImpl: async () => { throw new Error("offline"); }, sleep: async () => {},
  }), /offline/);
});
