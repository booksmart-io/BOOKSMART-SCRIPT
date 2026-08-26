import compression from "compression";
import type { Request, Response } from "express";

export const API_COMPRESSION_THRESHOLD_BYTES = 1_024;

export function apiCompressionFilter(req: Request, res: Response): boolean {
  if (req.headers["x-no-compression"] !== undefined) return false;
  return compression.filter(req, res);
}

export const apiCompression = compression({
  threshold: API_COMPRESSION_THRESHOLD_BYTES,
  filter: apiCompressionFilter,
});
