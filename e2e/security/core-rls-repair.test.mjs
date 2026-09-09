import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(new URL('../../.tmp/transaction-policy-validation/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const repair = readFileSync(new URL('../../lib/db/scripts/repair-core-tenant-isolation.sql', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../../lib/db/scripts/audit-core-tenant-isolation.sql', import.meta.url), 'utf8');
const exportedFunctions = JSON.parse(readFileSync(new URL('./fixtures/exported-core-functions.json', import.meta.url),'utf8'));
const uuid = id => `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;

test('coordinated repair: disposable PostgreSQL only, no network', async t => {
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
    await t.test('reproduces disabled-RLS exposure', async () => {
      assert.deepEqual(ids(await as(null,'SELECT id FROM transactions ORDER BY id','anon')),[11,22]);
    });
    const billingCall = (fn, amount) => `SELECT ${fn}('${uuid(1)}',${amount},'synthetic_customer','synthetic_payment','synthetic_price','synthetic_product') AS result`;
    await t.test('reproduces anonymous legacy billing flaw with synthetic data before repair', async () => {
      assert.equal((await as(null,billingCall('apply_token_purchase',10),'anon'))[0].result.balance_after,10);
      await db.exec('UPDATE users SET token_balance=20 WHERE id=1');
      assert.equal((await as(null,billingCall('refund_token_purchase',5),'anon'))[0].result.balance_after,15);
      await db.exec('UPDATE users SET token_balance=0 WHERE id=1');
    });
    await t.test('applies twice, removes legacy policies and enables all three tables', async () => {
      await db.exec(repair); await db.exec(repair);
      assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE policyname LIKE 'legacy_%'")).rows[0].n,0);
      assert.equal((await db.query("SELECT count(*)::int n FROM pg_class WHERE relname IN ('users','organizations','transactions') AND relrowsecurity")).rows[0].n,3);
    });
    await t.test('single-result metadata audit executes read-only', async () => {
      const results = await db.exec(audit);
      const row = results.flatMap(r => r.rows).find(r => r.security_metadata);
      const metadata = JSON.parse(row.security_metadata);
      assert.equal(metadata.public_tables.length,7);
      assert.equal(metadata.policies.length,10);
    });
    for (const table of ['users','organizations','transactions']) {
      await t.test(`${table}: anonymous reads, writes and truncation denied`, async () => {
        for (const sql of [`SELECT id FROM ${table}`,`DELETE FROM ${table}`,`TRUNCATE ${table}`])
          await denied(as(null,sql,'anon'));
        await denied(as(1,`TRUNCATE ${table}`));
      });
    }
    for (const [user,org,tx] of [[1,101,11],[2,102,22]]) {
      await t.test(`company ${user}: only own profile, organization and transactions visible`, async () => {
        for (const [table,id] of [['users',user],['organizations',org],['transactions',tx]])
          assert.deepEqual(ids(await as(user,`SELECT id FROM ${table}`)),[id]);
      });
    }
    await t.test('missing identity cannot read protected tables', async () => {
      for (const table of ['users','organizations','transactions'])
        assert.deepEqual(await as(null,`SELECT id FROM ${table}`),[]);
    });
    await t.test('own profile edits work; all sensitive fields are immutable', async () => {
      assert.deepEqual(ids(await as(1,"UPDATE users SET first_name='Test' WHERE id=1 RETURNING id")),[1]);
      for (const change of ["role='admin'","verification_status='approved'",`auth_id='${uuid(2)}'`,
        'id=99','token_balance=99999','future_security_flag=true'])
        await denied(as(1,`UPDATE users SET ${change} WHERE id=1`));
      assert.deepEqual(await as(1,"UPDATE users SET first_name='No' WHERE id=2 RETURNING id"),[]);
      await denied(as(1,`INSERT INTO users(auth_id,role) VALUES ('${uuid(1)}','admin')`));
      await denied(as(1,'DELETE FROM users WHERE id=1'));
    });
    await t.test('organization creation and edits work; ownership swaps fail', async () => {
      assert.equal((await as(1,"INSERT INTO organizations(owner_id,name) VALUES (1,'New') RETURNING id")).length,1);
      assert.equal((await as(1,"UPDATE organizations SET name='Changed' WHERE id=101 RETURNING id")).length,1);
      await denied(as(1,"INSERT INTO organizations(owner_id) VALUES (2)"));
      await denied(as(1,'UPDATE organizations SET owner_id=2 WHERE id=101'));
      await denied(as(1,'UPDATE organizations SET id=201 WHERE id=101'));
      assert.deepEqual(await as(1,"UPDATE organizations SET name='No' WHERE id=102 RETURNING id"),[]);
      assert.deepEqual(await as(1,'DELETE FROM organizations WHERE id=102 RETURNING id'),[]);
    });
    await t.test('active organization can be saved or cleared, not pointed to another owner', async () => {
      assert.equal((await as(1,'UPDATE users SET active_org_id=101 WHERE id=1 RETURNING id')).length,1);
      await db.exec('UPDATE users SET active_org_id=101 WHERE id=1');
      assert.equal((await as(1,'UPDATE users SET active_org_id=null WHERE id=1 RETURNING id')).length,1);
      await denied(as(1,'UPDATE users SET active_org_id=102 WHERE id=1'));
      await denied(as(1,'UPDATE users SET active_org_id=99999 WHERE id=1'));
      assert.deepEqual(await as(1,'UPDATE users SET active_org_id=101 WHERE id=2 RETURNING id'),[]);
    });
    await t.test('transaction owner CRUD works; foreign CRUD and org transfers fail', async () => {
      assert.equal((await as(1,'INSERT INTO transactions(org_id,amount,user_id) VALUES (101,1,1) RETURNING id')).length,1);
      assert.equal((await as(1,'UPDATE transactions SET amount=1 WHERE id=11 RETURNING id')).length,1);
      assert.equal((await as(1,'DELETE FROM transactions WHERE id=11 RETURNING id')).length,1);
      await denied(as(1,'INSERT INTO transactions(org_id,user_id) VALUES (102,1)'));
      await denied(as(1,'INSERT INTO transactions(org_id,user_id) VALUES (null,1)'));
      await denied(as(1,'INSERT INTO transactions(org_id,user_id) VALUES (101,2)'));
      await denied(as(1,'UPDATE transactions SET user_id=2 WHERE id=11'));
      await denied(as(1,'UPDATE transactions SET org_id=102 WHERE id=11'));
      assert.deepEqual(await as(1,'UPDATE transactions SET amount=1 WHERE id=22 RETURNING id'),[]);
      assert.deepEqual(await as(1,'DELETE FROM transactions WHERE id=22 RETURNING id'),[]);
    });
    await t.test('upsert cannot overwrite a foreign row', async () => {
      await denied(as(1,'INSERT INTO transactions(id,org_id,amount,user_id) VALUES (22,101,1,1) ON CONFLICT(id) DO UPDATE SET amount=1'));
    });
    await t.test('exported QuickBooks mapping trigger remains compatible with owner insert', async () => {
      const row = await as(1,`INSERT INTO transactions(org_id,user_id,amount,quickbooks_entity_type,quickbooks_external_id)
        VALUES (101,1,5,'Purchase','synthetic_qb') RETURNING category_id,sub_category_id`);
      assert.deepEqual(row,[{category_id:7,sub_category_id:8}]);
    });
    await t.test('exported notification trigger writes owner-scoped events inside the transaction', async () => {
      await db.exec('BEGIN');
      try {
        await db.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${uuid(1)}',true)`);
        await db.exec('INSERT INTO transactions(org_id,user_id,amount) VALUES (101,1,5)');
        await db.exec('RESET ROLE');
        const events = (await db.query('SELECT organization_id,event_type FROM account_activity_notifications')).rows;
        assert.deepEqual(events,[{organization_id:101,event_type:'transaction_insert'}]);
      } finally { await db.exec('ROLLBACK'); }
    });
    await t.test('CPA access is denied by default; cannot self-grant or self-approve', async () => {
      assert.deepEqual(await as(3,'SELECT id FROM transactions'),[]);
      await denied(as(3,'INSERT INTO booksmart_security.cpa_org_reads VALUES (3,101,1)'));
      await denied(as(4,"UPDATE users SET verification_status='approved' WHERE id=4"));
    });
    await t.test('reviewed private CPA grants give scoped reads, not writes or client profiles', async () => {
      await db.exec('INSERT INTO booksmart_security.cpa_org_reads VALUES (3,101,1),(4,101,1)');
      assert.deepEqual(ids(await as(3,'SELECT id FROM organizations')),[101]);
      assert.deepEqual(ids(await as(3,'SELECT id FROM transactions')),[11]);
      assert.deepEqual(ids(await as(3,'SELECT id FROM users')),[3]);
      assert.deepEqual(await as(4,'SELECT id FROM transactions'),[]);
      await denied(as(3,'INSERT INTO transactions(org_id,user_id) VALUES (101,3)'));
      assert.equal((await as(3,'UPDATE users SET active_org_id=101 WHERE id=3 RETURNING id')).length,1);
      assert.deepEqual(await as(3,'DELETE FROM transactions RETURNING id'),[]);
      assert.deepEqual(await as(3,"UPDATE organizations SET name='No' WHERE id=101 RETURNING id"),[]);
    });
    await t.test('revocation and client/owner mismatch immediately remove CPA access', async () => {
      await db.exec('UPDATE booksmart_security.cpa_org_reads SET client_id=2 WHERE cpa_id=3');
      assert.deepEqual(await as(3,'SELECT id FROM transactions'),[]);
      await db.exec('DELETE FROM booksmart_security.cpa_org_reads WHERE cpa_id=3');
      assert.deepEqual(await as(3,'SELECT id FROM transactions'),[]);
    });
    await t.test('admin reads; privileged profile edits still require backend', async () => {
      assert.deepEqual(ids(await as(5,'SELECT id FROM transactions ORDER BY id')),[11,22]);
      assert.equal((await as(5,'SELECT id FROM users')).length,5);
      assert.deepEqual(await as(5,'DELETE FROM transactions RETURNING id'),[]);
      assert.deepEqual(await as(5,"UPDATE users SET role='admin' WHERE id=1 RETURNING id"),[]);
    });
    await t.test('backend role still reads, provisions profiles and performs processing', async () => {
      assert.deepEqual(ids(await as(null,'SELECT id FROM transactions ORDER BY id','service_role')),[11,22]);
      assert.equal((await as(null,"UPDATE users SET token_balance=50 WHERE id=1 RETURNING id",'service_role')).length,1);
      assert.equal((await as(null,`INSERT INTO users(id,auth_id,role) VALUES (77,'${uuid(77)}','user') RETURNING id`,'service_role')).length,1);
    });
    await t.test('client cannot reset sequences, replace helpers or call helpers anonymously', async () => {
      await denied(as(1,"SELECT setval('organizations_id_seq',1000)"));
      await denied(as(1,'CREATE TABLE booksmart_security.attack(id int)'));
      await denied(as(null,'SELECT booksmart_security.user_id()','anon'));
    });
    await t.test('both exported billing functions deny anonymous and authenticated execution', async () => {
      for (const fn of ['apply_token_purchase','refund_token_purchase']) {
        await denied(as(null,billingCall(fn,10),'anon'));
        await denied(as(1,billingCall(fn,10)));
        await denied(as(5,billingCall(fn,10)));
        const signature = `${fn}(uuid,integer,text,text,text,text,text)`;
        const privileges = (await db.query(`SELECT has_function_privilege('anon',$1,'EXECUTE') a,
          has_function_privilege('authenticated',$1,'EXECUTE') b,
          has_function_privilege('service_role',$1,'EXECUTE') s`,[signature])).rows[0];
        assert.deepEqual(privileges,{a:false,b:false,s:true});
      }
    });
    await t.test('service-role billing succeeds with actual exported bodies and profile trigger', async () => {
      const purchase = await as(null,billingCall('apply_token_purchase',10),'service_role');
      assert.equal(purchase[0].result.balance_after,10);
      await db.exec('UPDATE users SET token_balance=20 WHERE id=1');
      const refund = await as(null,billingCall('refund_token_purchase',5),'service_role');
      assert.equal(refund[0].result.balance_after,15);
    });
    await t.test('missing billing function aborts atomically', async () => {
      await db.exec('ALTER FUNCTION apply_token_purchase(uuid,integer,text,text,text,text,text) RENAME TO renamed_purchase');
      await assert.rejects(db.exec(repair),/Expected billing signatures missing/);
      await db.exec('ROLLBACK');
      await db.exec('ALTER FUNCTION renamed_purchase(uuid,integer,text,text,text,text,text) RENAME TO apply_token_purchase');
      assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE policyname LIKE 'core_%'")).rows[0].n,10);
    });
    await t.test('duplicate identity aborts before policy replacement', async () => {
      await db.exec('DROP INDEX core_users_auth_identity_unique');
      await db.exec(`INSERT INTO users(id,auth_id,role) VALUES (99,'${uuid(1)}','admin')`);
      await assert.rejects(db.exec(repair),/Duplicate auth identities/);
      await db.exec('ROLLBACK');
      assert.equal((await db.query("SELECT count(*)::int n FROM pg_policies WHERE policyname LIKE 'core_%'")).rows[0].n,10);
    });
  } finally { await db.close(); }
});
