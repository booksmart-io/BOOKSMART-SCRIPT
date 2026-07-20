-- ── 1. Global categories (admin-managed) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  type      TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default system categories
INSERT INTO categories (name, type, is_system) VALUES
  ('Software/SaaS',         'expense', true),
  ('Travel',                'expense', true),
  ('Freelance Income',      'income',  true),
  ('Office Space',          'expense', true),
  ('Meals & Entertainment', 'expense', true),
  ('Professional Services', 'expense', true),
  ('Equipment',             'expense', true),
  ('Marketing',             'expense', true),
  ('Health Insurance',      'expense', true),
  ('Utilities',             'expense', true),
  ('Crypto Trading',        'income',  false)
ON CONFLICT DO NOTHING;

-- ── 2. AI tax deduction rules (admin-managed) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_deduction_rules (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  condition   TEXT NOT NULL,
  avg_savings TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default rules
INSERT INTO tax_deduction_rules (title, condition, avg_savings) VALUES
  ('Home Office Deduction', 'High rent/mortgage + WFH status', '$1,500+'),
  ('Vehicle Mileage',       'Gas/Auto repairs > $500/mo',      '$800+'),
  ('S-Corp Election',       'Net profit > $80k',               '$4,000+'),
  ('QBI Deduction',         'Pass-through entity',             'Up to 20%')
ON CONFLICT DO NOTHING;

-- ── 3. User-level auto-categorization rules ───────────────────────────────────
CREATE TABLE IF NOT EXISTS category_rules (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  condition   TEXT    NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Add category_id to transactions ────────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

-- ── RLS: allow all authenticated users to READ categories & tax rules ─────────
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_deduction_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_rules      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read categories"
  ON categories FOR SELECT USING (true);

CREATE POLICY "Anyone can read tax rules"
  ON tax_deduction_rules FOR SELECT USING (true);

CREATE POLICY "Admins can insert categories"
  ON categories FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can update categories"
  ON categories FOR UPDATE USING (true);

CREATE POLICY "Admins can delete categories"
  ON categories FOR DELETE USING (true);

CREATE POLICY "Admins can manage tax rules"
  ON tax_deduction_rules FOR ALL USING (true);

CREATE POLICY "Users own their category rules"
  ON category_rules FOR ALL
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Plaid bank connections ------------------------------------------------------
CREATE TABLE IF NOT EXISTS plaid_items (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plaid_item_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  institution_id TEXT,
  institution_name TEXT,
  transactions_cursor TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plaid_accounts (
  id BIGSERIAL PRIMARY KEY,
  plaid_item_id BIGINT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  plaid_account_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  official_name TEXT,
  mask TEXT,
  type TEXT,
  subtype TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS plaid_account_id TEXT,
  ADD COLUMN IF NOT EXISTS plaid_category JSONB,
  ADD COLUMN IF NOT EXISTS pending BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_plaid_transaction_id_key
  ON transactions (plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS plaid_items_user_org_idx
  ON plaid_items (user_id, org_id);

CREATE INDEX IF NOT EXISTS plaid_accounts_item_idx
  ON plaid_accounts (plaid_item_id);

ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE plaid_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their Plaid items"
  ON plaid_items FOR ALL
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "Users own their Plaid accounts"
  ON plaid_accounts FOR ALL
  USING (
    plaid_item_id IN (
      SELECT id FROM plaid_items
      WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  )
  WITH CHECK (
    plaid_item_id IN (
      SELECT id FROM plaid_items
      WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- Token-based feature unlocks -------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_unlocks (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  feature_key TEXT NOT NULL,
  scope_key TEXT,
  tokens_spent INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feature_unlocks_user_feature_idx
  ON feature_unlocks (user_id, feature_key, scope_key, expires_at);

ALTER TABLE feature_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their feature unlocks"
  ON feature_unlocks FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Persist the user's selected organization across browsers/devices.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_org_id BIGINT REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_active_org_id_idx
  ON users (active_org_id);

-- Track clients who signed up from a CPA referral link.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referred_by_cpa_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_referred_by_cpa_id_idx
  ON users (referred_by_cpa_id);
