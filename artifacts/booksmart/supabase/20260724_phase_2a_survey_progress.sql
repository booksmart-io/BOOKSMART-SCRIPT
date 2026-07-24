-- Phase 2A: durable, organization-scoped survey workflow state.
-- Survey answers remain in organizations and organizations.debts.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS equipment_current_value NUMERIC;

CREATE TABLE IF NOT EXISTS organization_survey_progress (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  survey_key TEXT NOT NULL CHECK (survey_key IN ('business_survey', 'balance_sheet_profile')),
  survey_version INTEGER NOT NULL DEFAULT 1 CHECK (survey_version > 0),
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'completed_with_skips')),
  current_section_key TEXT,
  answered_question_keys TEXT[] NOT NULL DEFAULT '{}',
  completed_question_keys TEXT[] NOT NULL DEFAULT '{}',
  skipped_question_keys TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  completion_source TEXT
    CHECK (completion_source IS NULL OR completion_source IN ('user', 'legacy_inferred', 'admin', 'migration')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, survey_key, survey_version)
);

CREATE INDEX IF NOT EXISTS organization_survey_progress_org_idx
  ON organization_survey_progress (organization_id);

CREATE INDEX IF NOT EXISTS organization_survey_progress_status_idx
  ON organization_survey_progress (status, last_saved_at);

ALTER TABLE organization_survey_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own organization survey progress"
  ON organization_survey_progress
  FOR ALL
  USING (
    organization_id IN (
      SELECT organizations.id
      FROM organizations
      JOIN users ON users.id = organizations.owner_id
      WHERE users.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organizations.id
      FROM organizations
      JOIN users ON users.id = organizations.owner_id
      WHERE users.auth_id = auth.uid()
    )
  );
