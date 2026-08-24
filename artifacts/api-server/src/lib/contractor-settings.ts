export type ContractorMarginSetting = {
  targetGrossMargin: number | null;
  targetMarginSource: "organization" | "industry" | null;
};

export function parseContractorMarginSetting(input: unknown): ContractorMarginSetting {
  if (!input || typeof input !== "object") throw new Error("Margin setting is required.");
  const value = (input as { targetGrossMargin?: unknown }).targetGrossMargin;
  const source = (input as { targetMarginSource?: unknown }).targetMarginSource;
  if (value === null) {
    if (source !== null && source !== undefined) throw new Error("Margin source must be empty when the target is cleared.");
    return { targetGrossMargin: null, targetMarginSource: null };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("Target gross margin must be between 0 and 1.");
  if (source !== "organization" && source !== "industry") throw new Error("Target margin source must be organization or industry.");
  return { targetGrossMargin: value, targetMarginSource: source };
}
