import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(new URL('../../.tmp/transaction-policy-validation/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const repair = readFileSync(new URL('../../lib/db/scripts/repair-stage1-tenant-isolation.sql', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../../lib/db/scripts/audit-stage1-tenant-isolation.sql', import.meta.url), 'utf8');
const exportedFunctions = JSON.parse(readFileSync(new URL('./fixtures/exported-core-functions.json', import.meta.url),'utf8'));
const uuid = id => `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;

test('stage 1 repair: disposable PostgreSQL only, no network', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      CREATE TABLE users (id bigserial PRIMARY KEY, auth_id uuid, role text,
        verification_status text, first_name text, token_balance integer DEFAULT 0,
        future_security_flag boolean DEFAULT false, active_org_id bigint,
        updated_at timestamptz, email text);
      CREATE TABLE organizations (id bigserial PRIMARY KEY, owner_id bigint REFERENCES users, name text);
      ALTER TABLE users ADD FOREIGN KEY (active_org_id) REFERENCES organizations(id) ON DELETE SET NULL;
      CREATE TABLE transactions (id bigserial PRIMARY KEY, org_id bigint REFERENCES organizations,
        amount numeric, user_id bigint NOT NULL REFERENCES users,
        title text DEFAULT 'Synthetic transaction', description text DEFAULT '', pending boolean DEFAULT false,
        plaid_transaction_id text, quickbooks_entity_type text, quickbooks_external_id text,
        category_id integer, sub_category_id integer);
      CREATE TABLE quickbooks_staged_entities(organization_id bigint, entity_type text, external_id text,payload jsonb);
      CREATE TABLE quickbooks_account_mappings(organization_id bigint,quickbooks_account_id text,
        mapping_kind text,category_id integer,sub_category_id integer);
      CREATE TABLE account_activity_notifications(organization_id bigint,event_type text,title text,
        description text,amount numeric,route text,metadata jsonb);
      CREATE TABLE token_transactions (user_id uuid, amount integer, balance_after integer,
        type text, status text, use_case text, stripe_customer_id text,
        stripe_payment_intent_id text, stripe_price_id text, stripe_product_id text);
      INSERT INTO users(id,auth_id,role,verification_status) VALUES
        (1,'${uuid(1)}','user',null),(2,'${uuid(2)}','user',null),
        (3,'${uuid(3)}','cpa','approved'),(4,'${uuid(4)}','cpa','pending'),
        (5,'${uuid(5)}','admin',null);
      INSERT INTO organizations VALUES (101,1,'A'),(102,2,'B');
      INSERT INTO transactions(id,org_id,amount,user_id) VALUES (11,101,10,1),(22,102,20,2);
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT SELECT(id), UPDATE(role) ON users TO PUBLIC;
      CREATE POLICY legacy_users ON users USING (true) WITH CHECK (true);
      CREATE POLICY legacy_org ON organizations USING (true) WITH CHECK (true);
      CREATE POLICY legacy_tx ON transactions USING (true) WITH CHECK (true);
    `);
    for (const f of exportedFunctions)
      await db.exec(f.definition);
    await db.exec(`CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      GRANT EXECUTE ON FUNCTION apply_token_purchase(uuid,integer,text,text,text,text,text),
        refund_token_purchase(uuid,integer,text,text,text,text,text) TO anon,authenticated;
      CREATE TRIGGER apply_quickbooks_account_mapping_on_insert BEFORE INSERT ON transactions
        FOR EACH ROW EXECUTE FUNCTION apply_quickbooks_account_mapping();
      CREATE TRIGGER transactions_activity_notification AFTER INSERT OR UPDATE OR DELETE ON transactions
        FOR EACH ROW EXECUTE FUNCTION notify_transaction_activity();
      INSERT INTO quickbooks_staged_entities VALUES
        (101,'Purchase','synthetic_qb','{"Line":[{"AccountBasedExpenseLineDetail":{"AccountRef":{"value":"acct-a"}}}]}');
      INSERT INTO quickbooks_account_mappings VALUES (101,'acct-a','category',7,8);
      REVOKE ALL ON quickbooks_staged_entities,quickbooks_account_mappings,account_activity_notifications FROM anon,authenticated;
    `);
    async function as(id, sql, role='authenticated') {
      await db.exec('BEGIN');
      try {
        await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id ? uuid(id) : '']);
        await db.exec(`SET LOCAL ROLE ${role}`);
        return (await db.query(sql)).rows;
      } finally { await db.exec('ROLLBACK'); }
    }
    const denied = p => assert.rejects(p, e => e.code==='42501');
    const ids = rows => rows.map(r=>Number(r.id));
    await t.test('reproduces foreign transactions before repair', async () => {
      assert.deepEqual(ids(await as(1,'SELECT id FROM transactions ORDER BY id')),[11,22]);
    });
    await t.test('preflight detects mismatched ownership without returning financial records',async()=>{
      await db.exec('BEGIN; UPDATE transactions SET user_id=2 WHERE id=11');
      const result=await db.query(audit);
      assert.equal(Number(result.rows[0].inconsistent_transaction_owners),1);
      await db.exec('ROLLBACK');
    });
    await t.test('applies twice without replacing profile/organization read policies', async () => {
      await db.exec(repair); await db.exec(repair);
      assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE policyname IN ('legacy_users','legacy_org')")).rows[0].n,2);
    });
    for (const [owner, own, foreign, org, foreignOrg] of [[1,11,22,101,102],[2,22,11,102,101]]) {
      await t.test(`owner ${owner}: own reads and CRUD work; foreign reads and writes fail`,async()=>{
        assert.deepEqual(ids(await as(owner,'SELECT id FROM transactions ORDER BY id')),[own]);
        assert.deepEqual(ids(await as(owner,`UPDATE transactions SET amount=99 WHERE id=${foreign} RETURNING id`)),[]);
        assert.deepEqual(ids(await as(owner,`DELETE FROM transactions WHERE id=${foreign} RETURNING id`)),[]);
        assert.deepEqual(ids(await as(owner,`INSERT INTO transactions(id,user_id,org_id,amount) VALUES(99,${owner},${org},1) RETURNING id`)),[99]);
        assert.deepEqual(ids(await as(owner,`UPDATE transactions SET amount=2 WHERE id=${own} RETURNING id`)),[own]);
        assert.deepEqual(ids(await as(owner,`DELETE FROM transactions WHERE id=${own} RETURNING id`)),[own]);
        await denied(as(owner,`UPDATE transactions SET org_id=${foreignOrg} WHERE id=${own}`));
        await denied(as(owner,`UPDATE transactions SET user_id=${owner===1?2:1} WHERE id=${own}`));
        await denied(as(owner,`INSERT INTO transactions(id,user_id,org_id) VALUES(99,${owner},${foreignOrg})`));
        await denied(as(owner,`INSERT INTO transactions(id,user_id,org_id) VALUES(${foreign},${owner},${org}) ON CONFLICT(id) DO UPDATE SET amount=7`));
      });
    }
    await t.test('profile edits work; identity, approval, balances and future fields are protected',async()=>{
      assert.deepEqual(ids(await as(1,"UPDATE users SET first_name='Updated' WHERE id=1 RETURNING id")),[1]);
      for(const field of ["role='admin'","verification_status='approved'","token_balance=100","auth_id=NULL","email='other@example.test'","future_security_flag=true","active_org_id=102"])
        await denied(as(1,`UPDATE users SET ${field} WHERE id=1`));
      await denied(as(1,"UPDATE users SET first_name='Attack' WHERE id=2"));
      await denied(as(1,"INSERT INTO users(auth_id) VALUES(NULL)"));
      await denied(as(1,"DELETE FROM users WHERE id=1"));
      assert.deepEqual(ids(await as(1,'UPDATE users SET active_org_id=101 WHERE id=1 RETURNING id')),[1]);
    });
    await t.test('organization theft and foreign CRUD are blocked, normal owner changes work',async()=>{
      await denied(as(1,'UPDATE organizations SET owner_id=1 WHERE id=102'));
      await denied(as(1,"UPDATE organizations SET name='Attack' WHERE id=102"));
      await denied(as(1,'DELETE FROM organizations WHERE id=102'));
      await denied(as(1,'INSERT INTO organizations(id,owner_id) VALUES(999,2)'));
      await denied(as(1,'UPDATE organizations SET id=999 WHERE id=101'));
      assert.deepEqual(ids(await as(1,"UPDATE organizations SET name='Updated' WHERE id=101 RETURNING id")),[101]);
      assert.deepEqual(ids(await as(1,'INSERT INTO organizations(id,owner_id) VALUES(999,1) RETURNING id')),[999]);
    });
    await t.test('anonymous, unbound, CPA and admin tokens cannot read owner transactions',async()=>{
      await denied(as(null,'SELECT id FROM transactions','anon'));
      for(const id of [null,3,4,5,999]) assert.deepEqual(await as(id,'SELECT id FROM transactions'),[]);
      for(const table of ['users','organizations','transactions']) {
        await denied(as(null,`SELECT id FROM ${table}`,'anon'));
        await denied(as(1,`TRUNCATE ${table} CASCADE`));
      }
    });
    await t.test('legacy billing functions are backend-only',async()=>{
      for(const fn of ['apply_token_purchase','refund_token_purchase']) {
        const call=`SELECT ${fn}('${uuid(1)}',1,'a','b','c','d')`;
        await denied(as(null,call,'anon')); await denied(as(1,call)); await denied(as(5,call));
        await as(null,call,'service_role');
      }
    });
    await t.test('backend provisioning and imports retain writes and exported triggers execute',async()=>{
      assert.deepEqual(ids(await as(null,"INSERT INTO users(id,auth_id,role) VALUES(99,NULL,'user') RETURNING id",'service_role')),[99]);
      const rows=await as(null,"INSERT INTO transactions(id,user_id,org_id,quickbooks_entity_type,quickbooks_external_id) VALUES(99,1,101,'Purchase','synthetic_qb') RETURNING category_id,sub_category_id",'service_role');
      assert.equal(rows[0].category_id,7); assert.equal(rows[0].sub_category_id,8);
    });
    await t.test('missing billing prerequisite aborts without replacing policy',async()=>{
      await db.exec('ALTER FUNCTION public.apply_token_purchase(uuid,integer,text,text,text,text,text) RENAME TO hidden_purchase');
      await assert.rejects(db.exec(repair),/Expected billing signatures missing/);
      await db.exec('ROLLBACK');
      assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE policyname='stage1_tx_owner'")).rows[0].n,1);
    });
  } finally { await db.close(); }
});
