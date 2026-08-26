import type { NextFunction, Request, Response } from "express";

export type ApiTimingLevel = "normal" | "slow" | "very_slow";

export function classifyApiDuration(durationMs: number): ApiTimingLevel {
  if (durationMs >= 2_000) return "very_slow";
  if (durationMs >= 750) return "slow";
  return "normal";
}

export function formatServerTiming(durationMs: number): string {
  return `app;dur=${Math.max(0, durationMs).toFixed(1)}`;
}

function requestPath(req: Request): string {
  return (req.originalUrl || req.url || "/").split("?", 1)[0];
}

/**
 * Adds a total application duration to ordinary API responses and emits one
 * structured timing event per request. Query strings and authorization data
 * are intentionally excluded from the timing event.
 */
export function apiTiming(req: Request, res: Response, next: NextFunction): void {
  const startedAt = performance.now();
  const originalEnd = res.end.bind(res);

  res.end = ((...args: Parameters<Response["end"]>) => {
    if (!res.headersSent) {
      res.setHeader("Server-Timing", formatServerTiming(performance.now() - startedAt));
    }
    return originalEnd(...args);
  }) as Response["end"];

  res.once("finish", () => {
    const durationMs = performance.now() - startedAt;
    req.log?.info({
      event: "api_timing",
      method: req.method,
      path: requestPath(req),
      status_code: res.statusCode,
      duration_ms: Number(durationMs.toFixed(1)),
      auth_duration_ms: req.authDurationMs == null ? undefined : Number(req.authDurationMs.toFixed(1)),
      timing_level: classifyApiDuration(durationMs),
    }, "API request completed");
  });

  next();
}
