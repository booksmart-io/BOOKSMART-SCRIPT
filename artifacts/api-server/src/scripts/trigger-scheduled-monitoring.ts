export {};

const baseUrl = process.env.BOOKSMART_API_BASE_URL?.trim().replace(/\/$/, "");
const secret = process.env.MONITORING_CRON_SECRET?.trim();
if (!baseUrl) throw new Error("BOOKSMART_API_BASE_URL is required.");
if (!secret) throw new Error("MONITORING_CRON_SECRET is required.");
const target = new URL("/api/monitoring/scheduled-run", baseUrl);
if (target.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(target.hostname)) {
  throw new Error("Scheduled monitoring requires HTTPS outside local development.");
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 11 * 60_000);
try {
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-monitoring-secret": secret,
    },
    body: "{}",
    signal: controller.signal,
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Scheduled monitoring returned ${response.status}: ${body.slice(0, 1000)}`);
  const result = JSON.parse(body) as { run?: { id?: number; status?: string; organizations_evaluated?: number; error_count?: number } };
  console.log(JSON.stringify({
    runId: result.run?.id ?? null,
    status: result.run?.status ?? "unknown",
    organizationsEvaluated: result.run?.organizations_evaluated ?? 0,
    errors: result.run?.error_count ?? 0,
  }));
  if (result.run?.status !== "completed" || (result.run?.error_count ?? 0) > 0) process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
