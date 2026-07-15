export type TokenUnlockKey =
  | "ai_tax_strategy_deep_dive"
  | "credit_score_boost"
  | "loan_readiness_simulation"
  | "cpa_quick_review"
  | "revenue_growth_forecast"
  | "double_xp_boost"
  | "streak_shield_7_day"
  | "transactions_100"
  | "transactions_250"
  | "transactions_500"
  | "transactions_1000"
  | "bank_account_1_30d"
  | "bank_accounts_3_30d"
  | "receipt_uploads_10"
  | "receipt_uploads_25"
  | "receipt_uploads_50"
  | "receipt_uploads_100"
  | "statement_upload_1"
  | "statement_uploads_5"
  | "statement_uploads_10"
  | "ai_questions_10"
  | "ai_questions_25"
  | "ai_questions_50"
  | "ai_questions_100"
  | "ai_strategy_1"
  | "ai_strategies_5"
  | "ai_strategies_10"
  | "ai_strategies_20"
  | "balance_sheet_once"
  | "balance_sheet_30d"
  | "deduction_report"
  | "missed_deduction_analysis"
  | "tax_savings_analysis"
  | "pl_pdf_export"
  | "cash_flow_pdf_export"
  | "full_financial_pdf_package"
  | "cpa_contact"
  | "cpa_consultation_request"
  | "cpa_matching_analysis"
  | "funding_readiness_assessment"
  | "funding_marketplace_30d"
  | "ai_cfo_session"
  | "ai_cfo_five_sessions"
  | "ai_funding_coach_session"
  | "ai_funding_coach_five_sessions"
  | "ai_deduction_optimizer_review"
  | "ai_deduction_optimizer_five_reviews"
  | "additional_business_30d";

export type TokenUnlock = {
  key: TokenUnlockKey;
  label: string;
  tokens: number;
  category: "transactions" | "ocr" | "ai" | "reports" | "cpa" | "funding" | "business";
  quantity?: number;
  durationDays?: number;
  subscriptionOnly?: boolean;
};

export const TOKEN_UNLOCKS: Record<TokenUnlockKey, TokenUnlock> = {
  ai_tax_strategy_deep_dive: { key: "ai_tax_strategy_deep_dive", label: "AI Tax Strategy Deep Dive", tokens: 150, category: "ai", quantity: 1 },
  credit_score_boost: { key: "credit_score_boost", label: "Credit Score Boost", tokens: 120, category: "funding", quantity: 1 },
  loan_readiness_simulation: { key: "loan_readiness_simulation", label: "Loan Readiness Simulation", tokens: 200, category: "funding", quantity: 1 },
  cpa_quick_review: { key: "cpa_quick_review", label: "CPA Quick Review", tokens: 180, category: "cpa", quantity: 1 },
  revenue_growth_forecast: { key: "revenue_growth_forecast", label: "Revenue Growth Forecast", tokens: 220, category: "ai", quantity: 1 },
  double_xp_boost: { key: "double_xp_boost", label: "Double XP Boost", tokens: 80, category: "business", durationDays: 1 },
  streak_shield_7_day: { key: "streak_shield_7_day", label: "7 Day Streak Shield", tokens: 60, category: "business", durationDays: 7 },
  transactions_100: { key: "transactions_100", label: "Additional 100 transactions", tokens: 3, category: "transactions", quantity: 100 },
  transactions_250: { key: "transactions_250", label: "Additional 250 transactions", tokens: 6, category: "transactions", quantity: 250 },
  transactions_500: { key: "transactions_500", label: "Additional 500 transactions", tokens: 10, category: "transactions", quantity: 500 },
  transactions_1000: { key: "transactions_1000", label: "Additional 1,000 transactions", tokens: 18, category: "transactions", quantity: 1000 },
  bank_account_1_30d: { key: "bank_account_1_30d", label: "1 additional connected account for 30 days", tokens: 2, category: "transactions", quantity: 1, durationDays: 30 },
  bank_accounts_3_30d: { key: "bank_accounts_3_30d", label: "3 additional connected accounts for 30 days", tokens: 5, category: "transactions", quantity: 3, durationDays: 30 },
  receipt_uploads_10: { key: "receipt_uploads_10", label: "Additional 10 receipt uploads", tokens: 2, category: "ocr", quantity: 10 },
  receipt_uploads_25: { key: "receipt_uploads_25", label: "Additional 25 receipt uploads", tokens: 4, category: "ocr", quantity: 25 },
  receipt_uploads_50: { key: "receipt_uploads_50", label: "Additional 50 receipt uploads", tokens: 7, category: "ocr", quantity: 50 },
  receipt_uploads_100: { key: "receipt_uploads_100", label: "Additional 100 receipt uploads", tokens: 12, category: "ocr", quantity: 100 },
  statement_upload_1: { key: "statement_upload_1", label: "Additional statement upload", tokens: 2, category: "ocr", quantity: 1 },
  statement_uploads_5: { key: "statement_uploads_5", label: "Additional 5 statement uploads", tokens: 6, category: "ocr", quantity: 5 },
  statement_uploads_10: { key: "statement_uploads_10", label: "Additional 10 statement uploads", tokens: 10, category: "ocr", quantity: 10 },
  ai_questions_10: { key: "ai_questions_10", label: "Additional 10 AI questions", tokens: 2, category: "ai", quantity: 10 },
  ai_questions_25: { key: "ai_questions_25", label: "Additional 25 AI questions", tokens: 4, category: "ai", quantity: 25 },
  ai_questions_50: { key: "ai_questions_50", label: "Additional 50 AI questions", tokens: 7, category: "ai", quantity: 50 },
  ai_questions_100: { key: "ai_questions_100", label: "Additional 100 AI questions", tokens: 12, category: "ai", quantity: 100 },
  ai_strategy_1: { key: "ai_strategy_1", label: "Additional AI tax strategy", tokens: 2, category: "ai", quantity: 1 },
  ai_strategies_5: { key: "ai_strategies_5", label: "Additional 5 AI tax strategies", tokens: 7, category: "ai", quantity: 5 },
  ai_strategies_10: { key: "ai_strategies_10", label: "Additional 10 AI tax strategies", tokens: 12, category: "ai", quantity: 10 },
  ai_strategies_20: { key: "ai_strategies_20", label: "Additional 20 AI tax strategies", tokens: 20, category: "ai", quantity: 20 },
  balance_sheet_once: { key: "balance_sheet_once", label: "One-time Balance Sheet generation", tokens: 2, category: "reports", quantity: 1 },
  balance_sheet_30d: { key: "balance_sheet_30d", label: "Monthly Balance Sheet access", tokens: 5, category: "reports", durationDays: 30 },
  deduction_report: { key: "deduction_report", label: "Generate Tax Deduction Report", tokens: 3, category: "reports", quantity: 1 },
  missed_deduction_analysis: { key: "missed_deduction_analysis", label: "Missed Deduction Analysis", tokens: 5, category: "reports", quantity: 1 },
  tax_savings_analysis: { key: "tax_savings_analysis", label: "Tax Savings Analysis", tokens: 5, category: "reports", quantity: 1 },
  pl_pdf_export: { key: "pl_pdf_export", label: "P&L PDF export", tokens: 1, category: "reports", quantity: 1 },
  cash_flow_pdf_export: { key: "cash_flow_pdf_export", label: "Cash Flow PDF export", tokens: 1, category: "reports", quantity: 1 },
  full_financial_pdf_package: { key: "full_financial_pdf_package", label: "Full financial package PDF", tokens: 3, category: "reports", quantity: 1 },
  cpa_contact: { key: "cpa_contact", label: "Unlock contact for 1 CPA", tokens: 3, category: "cpa", quantity: 1 },
  cpa_consultation_request: { key: "cpa_consultation_request", label: "CPA consultation request", tokens: 2, category: "cpa", quantity: 1 },
  cpa_matching_analysis: { key: "cpa_matching_analysis", label: "CPA matching analysis", tokens: 5, category: "cpa", quantity: 1 },
  funding_readiness_assessment: { key: "funding_readiness_assessment", label: "Funding readiness assessment", tokens: 5, category: "funding", quantity: 1 },
  funding_marketplace_30d: { key: "funding_marketplace_30d", label: "Funding marketplace access", tokens: 7, category: "funding", durationDays: 30 },
  ai_cfo_session: { key: "ai_cfo_session", label: "One AI CFO session", tokens: 5, category: "ai", quantity: 1 },
  ai_cfo_five_sessions: { key: "ai_cfo_five_sessions", label: "Five AI CFO sessions", tokens: 20, category: "ai", quantity: 5 },
  ai_funding_coach_session: { key: "ai_funding_coach_session", label: "One AI Funding Coach session", tokens: 5, category: "ai", quantity: 1 },
  ai_funding_coach_five_sessions: { key: "ai_funding_coach_five_sessions", label: "Five AI Funding Coach sessions", tokens: 20, category: "ai", quantity: 5 },
  ai_deduction_optimizer_review: { key: "ai_deduction_optimizer_review", label: "One AI Deduction Optimizer review", tokens: 5, category: "ai", quantity: 1 },
  ai_deduction_optimizer_five_reviews: { key: "ai_deduction_optimizer_five_reviews", label: "Five AI Deduction Optimizer reviews", tokens: 20, category: "ai", quantity: 5 },
  additional_business_30d: { key: "additional_business_30d", label: "Add one additional business for 30 days", tokens: 7, category: "business", quantity: 1, durationDays: 30 },
};

export function tokenUpgradeMessage(monthlySpend: number): string | null {
  if (monthlySpend >= 20) return "Upgrade to BookSmart Pro for unlimited access and premium AI tools.";
  if (monthlySpend >= 15) return "BookSmart Pro now costs less than your token usage.";
  if (monthlySpend >= 8) return "BookSmart Plus would save you money and unlock additional features.";
  return null;
}
