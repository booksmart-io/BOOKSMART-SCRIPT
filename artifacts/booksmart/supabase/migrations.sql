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
