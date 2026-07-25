-- Phase 1: additive answer storage for Business Survey v2.
-- Version 1 progress and all existing answer data remain unchanged.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS business_activity_model TEXT,
  ADD COLUMN IF NOT EXISTS issues_1099s TEXT,
  ADD COLUMN IF NOT EXISTS accounting_software TEXT,
  ADD COLUMN IF NOT EXISTS business_goals TEXT[],
  ADD COLUMN IF NOT EXISTS funding_interest TEXT,
  ADD COLUMN IF NOT EXISTS funding_purposes TEXT[];
