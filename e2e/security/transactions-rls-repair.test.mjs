import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

// Temporary dependency, intentionally outside the application's dependency tree.
const require = createRequire(new URL('../../.tmp/transaction-policy-validation/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const repair = read('lib/db/scripts/repair-transactions-tenant-isolation.sql');
const audit = read('lib/db/scripts/audit-transactions-tenant-isolation.sql');
const phase3 = read('artifacts/booksmart/supabase/20260728_phase_3_cpa_client_access.sql');
const helpers = phase3.slice(phase3.indexOf('CREATE OR REPLACE FUNCTION public.current_app_user_id()'),
  phase3.indexOf('-- Prevent authenticated callers'));

test('transaction repair against isolated PostgreSQL with repository identity helpers', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      CREATE TABLE public.users (id bigint PRIMARY KEY, auth_id uuid UNIQUE, role text, verification_status text);
      CREATE TABLE public.organizations (id bigint PRIMARY KEY, owner_id bigint REFERENCES public.users);
      CREATE TABLE public.cpa_client_access (cpa_id bigint, client_id bigint, organization_id bigint, status text);
      CREATE TABLE public.orders (cpa_id bigint, user_id bigint, status text);
      CREATE TABLE public.transactions (id bigint PRIMARY KEY, org_id bigint REFERENCES public.organizations, amount numeric);
      INSERT INTO public.users VALUES
        (1, '00000000-0000-0000-0000-000000000001', 'user', null),
        (2, '00000000-0000-0000-0000-000000000002', 'user', null),
        (3, '00000000-0000-0000-0000-000000000003', 'cpa', 'approved'),
        (4, '00000000-0000-0000-0000-000000000004', 'cpa', 'pending'),
        (5, '00000000-0000-0000-0000-000000000005', 'cpa', 'approved'),
        (6, '00000000-0000-0000-0000-000000000006', 'admin', null);
      INSERT INTO public.organizations VALUES (101, 1), (102, 2);
      INSERT INTO public.transactions VALUES (11, 101, 10), (22, 102, 20);
      INSERT INTO public.cpa_client_access VALUES (3, 1, 101, 'active'), (4, 1, 101, 'active');
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
      GRANT SELECT ON public.transactions TO anon;
      GRANT SELECT (id) ON public.transactions TO anon, PUBLIC;
      ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
      CREATE POLICY legacy_broad_access ON public.transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
      ${helpers}
      ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
      CREATE POLICY preserved_org_policy ON public.organizations FOR SELECT TO authenticated USING (
        owner_id = public.current_app_user_id() OR public.current_app_role() = 'admin' OR public.cpa_has_org_access(id)
      );
      ALTER TABLE public.cpa_client_access ENABLE ROW LEVEL SECURITY;
    `);

    async function asUser(id, sql, role = 'authenticated') {
      await db.exec('BEGIN');
      try {
        await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [id ? `00000000-0000-0000-0000-${String(id).padStart(12, '0')}` : '']);
        await db.exec(`SET LOCAL ROLE ${role}`);
        return await db.query(sql);
      } finally { await db.exec('ROLLBACK'); }
    }
    const ids = result => result.rows.map(r => Number(r.id));
    const denied = promise => assert.rejects(promise, error => error.code === '42501');

    await t.test('reproduces a legacy permissive policy exposing foreign rows', async () => {
      assert.deepEqual(ids(await asUser(1, 'SELECT id FROM transactions ORDER BY id')), [11, 22]);
    });
    await t.test('audit query executes without modifying the policy set', async () => {
      await db.exec(audit);
      assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE policyname='legacy_broad_access'")).rows[0].n, 1);
    });
    await t.test('repair executes and can be reapplied', async () => {
      await db.exec(repair);
      await db.exec(repair);
      assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE tablename='transactions'")).rows[0].n, 4);
      assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE policyname='preserved_org_policy'")).rows[0].n, 1);
    });
    for (const [user, own, foreign] of [[1, 11, 22], [2, 22, 11]]) {
      await t.test(`owner ${user} reads its own row and no foreign row`, async () => {
        assert.deepEqual(ids(await asUser(user, 'SELECT id FROM transactions ORDER BY id')), [own]);
        assert.deepEqual(ids(await asUser(user, `SELECT id FROM transactions WHERE id=${foreign}`)), []);
      });
    }
    await t.test('anonymous role has no table or column read access', async () => {
      await denied(asUser(null, 'SELECT id FROM transactions', 'anon'));
    });
    await t.test('owner can insert, update and delete its own disposable row', async () => {
      assert.deepEqual(ids(await asUser(1, 'INSERT INTO transactions VALUES (33,101,1) RETURNING id')), [33]);
      assert.deepEqual(ids(await asUser(1, 'UPDATE transactions SET amount=11 WHERE id=11 RETURNING id')), [11]);
      assert.deepEqual(ids(await asUser(1, 'DELETE FROM transactions WHERE id=11 RETURNING id')), [11]);
    });
    await t.test('cross-tenant inserts and organization transfers are rejected', async () => {
      await denied(asUser(1, 'INSERT INTO transactions VALUES (33,102,1)'));
      await denied(asUser(1, 'UPDATE transactions SET org_id=102 WHERE id=11'));
      await denied(asUser(1, 'INSERT INTO transactions VALUES (33,NULL,1)'));
    });
    await t.test('foreign updates and deletes affect zero rows', async () => {
      assert.deepEqual(ids(await asUser(1, 'UPDATE transactions SET amount=99 WHERE id=22 RETURNING id')), []);
      assert.deepEqual(ids(await asUser(1, 'DELETE FROM transactions WHERE id=22 RETURNING id')), []);
    });
    await t.test('engaged approved CPA has scoped read access and no writes', async () => {
      assert.deepEqual(ids(await asUser(3, 'SELECT id FROM transactions ORDER BY id')), [11]);
      await denied(asUser(3, 'INSERT INTO transactions VALUES (33,101,1)'));
      assert.deepEqual(ids(await asUser(3, 'UPDATE transactions SET amount=99 WHERE id=11 RETURNING id')), []);
      assert.deepEqual(ids(await asUser(3, 'DELETE FROM transactions WHERE id=11 RETURNING id')), []);
    });
    await t.test('pending and unengaged CPAs cannot read transactions', async () => {
      for (const user of [4, 5]) assert.deepEqual(ids(await asUser(user, 'SELECT id FROM transactions')), []);
    });
    await t.test('revoking a CPA engagement removes transaction access', async () => {
      await db.exec("UPDATE cpa_client_access SET status='revoked' WHERE cpa_id=3");
      assert.deepEqual(ids(await asUser(3, 'SELECT id FROM transactions')), []);
    });
    await t.test('admin retains reads without acquiring direct row writes', async () => {
      assert.deepEqual(ids(await asUser(6, 'SELECT id FROM transactions ORDER BY id')), [11, 22]);
      await denied(asUser(6, 'INSERT INTO transactions VALUES (33,101,1)'));
      assert.deepEqual(ids(await asUser(6, 'DELETE FROM transactions RETURNING id')), []);
    });
    await t.test('service role retains backend processing privileges', async () => {
      assert.deepEqual(ids(await asUser(null, 'SELECT id FROM transactions ORDER BY id', 'service_role')), [11, 22]);
      assert.deepEqual(ids(await asUser(null, 'UPDATE transactions SET amount=99 WHERE id=22 RETURNING id', 'service_role')), [22]);
    });
    await t.test('authenticated users cannot truncate transactions', async () => {
      await denied(asUser(1, 'TRUNCATE transactions'));
    });
    await t.test('missing helper stops the repair without dropping existing policies', async () => {
      await db.exec('ALTER FUNCTION public.current_app_user_id() RENAME TO renamed_identity_helper');
      await assert.rejects(db.exec(repair), /Missing scoped identity\/CPA helpers/);
      await db.exec('ROLLBACK');
      assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE tablename='transactions'")).rows[0].n, 4);
    });
  } finally { await db.close(); }
});
