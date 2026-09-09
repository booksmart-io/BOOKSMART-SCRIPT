import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(new URL('../../.tmp/transaction-policy-validation/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const repair = readFileSync(new URL('../../lib/db/scripts/repair-stage1-tenant-isolation.sql', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../../lib/db/scripts/audit-stage1-tenant-isolation.sql', import.meta.url), 'utf8');
const roleRepair = readFileSync(new URL('../../lib/db/scripts/repair-stage2-role-profile-isolation.sql', import.meta.url), 'utf8');
const exportedFunctions = JSON.parse(readFileSync(new URL('./fixtures/exported-core-functions.json', import.meta.url),'utf8'));
const uuid = id => `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;

test('orders and token repair: exported policy attacks and atomic spending', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz,deleted_at timestamptz);
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
      INSERT INTO auth.users(id) VALUES ('${uuid(1)}'),('${uuid(2)}'),('${uuid(3)}'),('${uuid(4)}'),('${uuid(5)}');
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
    const extension=readFileSync(new URL('../../lib/db/scripts/repair-stage1-orders-tokens.sql',import.meta.url),'utf8');
    await db.exec(`
      ALTER TABLE token_transactions ADD COLUMN id bigserial PRIMARY KEY;
      ALTER TABLE token_transactions ADD COLUMN created_at timestamptz DEFAULT now();
      CREATE TABLE orders(id bigserial PRIMARY KEY,user_id bigint REFERENCES users,cpa_id bigint REFERENCES users,
       title text,services text[],description text,status text,payment_status text,amount numeric);
      GRANT ALL ON orders TO anon,authenticated,service_role;
      GRANT ALL ON SEQUENCE orders_id_seq TO anon,authenticated,service_role;
      GRANT UPDATE(user_id),SELECT(id) ON orders TO PUBLIC;
      ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
      CREATE POLICY legacy_insert ON orders FOR INSERT WITH CHECK(
       auth.uid() IN(SELECT auth_id FROM users WHERE id=orders.user_id) OR auth.uid() IN(SELECT auth_id FROM users WHERE id=orders.cpa_id));
      CREATE POLICY legacy_select ON orders FOR SELECT USING(
       auth.uid() IN(SELECT auth_id FROM users WHERE id=orders.user_id) OR auth.uid() IN(SELECT auth_id FROM users WHERE id=orders.cpa_id));
      CREATE POLICY legacy_update ON orders FOR UPDATE USING(
       auth.uid() IN(SELECT auth_id FROM users WHERE id=orders.user_id) OR auth.uid() IN(SELECT auth_id FROM users WHERE id=orders.cpa_id));
      INSERT INTO orders(id,user_id,cpa_id,status,payment_status,amount) VALUES
       (1,1,3,'active','unpaid',0),(2,2,3,'active','unpaid',0),(3,1,4,'pending','unpaid',0);
      SELECT setval('orders_id_seq',3);
    `);
    await t.test('reproduces CPA self-grant under exported order-policy expressions',async()=>{
      assert.deepEqual(ids(await as(3,"INSERT INTO orders(id,user_id,cpa_id,status) VALUES(99,2,3,'active') RETURNING id")),[99]);
      assert.deepEqual(ids(await as(3,'UPDATE orders SET user_id=2 WHERE id=1 RETURNING id')),[1]);
    });
    await db.exec(repair);
    await t.test('extension applies twice; legacy orders are not silently authorized',async()=>{
      await db.exec(extension); await db.exec(extension);
      assert.equal((await db.query('SELECT count(*)::int n FROM orders WHERE client_authorized')).rows[0].n,0);
    });
    await t.test('role/profile repair applies twice and closes profile and organization enumeration',async()=>{
      await db.exec(roleRepair); await db.exec(roleRepair);
      assert.deepEqual(ids(await as(1,'SELECT id FROM users ORDER BY id')),[1,3]);
      assert.deepEqual(ids(await as(1,'SELECT id FROM organizations ORDER BY id')),[101]);
      assert.deepEqual(ids(await as(2,'SELECT id FROM users ORDER BY id')),[2,3]);
      assert.deepEqual(ids(await as(2,'SELECT id FROM organizations ORDER BY id')),[102]);
    });
    await t.test('disabled and removed identities immediately lose direct database access',async()=>{
      await db.exec(`UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='${uuid(1)}'`);
      assert.deepEqual(await as(1,'SELECT id FROM users'),[]);
      assert.deepEqual(await as(1,'SELECT id FROM organizations'),[]);
      assert.deepEqual(await as(1,'SELECT id FROM transactions'),[]);
      await db.exec(`UPDATE auth.users SET banned_until=NULL,deleted_at=now() WHERE id='${uuid(2)}'`);
      assert.deepEqual(await as(2,'SELECT id FROM users'),[]);
      assert.deepEqual(await as(2,'SELECT id FROM organizations'),[]);
      assert.deepEqual(await as(2,'SELECT id FROM transactions'),[]);
      await db.exec(`UPDATE auth.users SET banned_until=NULL WHERE id='${uuid(1)}'; UPDATE auth.users SET deleted_at=NULL WHERE id='${uuid(2)}'`);
    });
    await t.test('client requests work but CPA forgery, paid status and assignment edits fail',async()=>{
      const insert="INSERT INTO orders(user_id,cpa_id,title,status,payment_status,amount) VALUES(1,3,'Help','pending','unpaid',0) RETURNING client_authorized";
      assert.equal((await as(1,insert))[0].client_authorized,true);
      await denied(as(3,insert));
      await denied(as(2,insert));
      await denied(as(1,insert.replace("'pending'","'active'")));
      await denied(as(1,insert.replace("'unpaid'","'paid'")));
      await denied(as(1,"UPDATE orders SET user_id=2 WHERE id=1"));
      await denied(as(3,"UPDATE orders SET status='active' WHERE id=1"));
      await denied(as(1,"UPDATE orders SET client_authorized=true WHERE id=1"));
    });
    await t.test('only the client can authorize or revoke; unrelated client and CPA cannot',async()=>{
      await denied(as(3,'SELECT set_cpa_order_authorization(1,true)'));
      await denied(as(2,'SELECT set_cpa_order_authorization(1,true)'));
      await denied(as(null,'SELECT set_cpa_order_authorization(1,true)','anon'));
      assert.equal((await as(1,'SELECT set_cpa_order_authorization(1,true)')).length,1);
      await db.exec('UPDATE orders SET client_authorized=true WHERE id=1');
      await as(1,'SELECT set_cpa_order_authorization(1,false)');
      // as() rolls back; inspect committed behavior with an explicit authenticated transaction.
      await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${uuid(1)}',true); SELECT set_cpa_order_authorization(1,false); COMMIT`);
      assert.equal((await db.query('SELECT client_authorized FROM orders WHERE id=1')).rows[0].client_authorized,false);
      assert.deepEqual(ids(await as(3,'SELECT id FROM orders ORDER BY id')),[1,2]);
      assert.deepEqual(ids(await as(4,'SELECT id FROM orders ORDER BY id')),[]);
    });
    await t.test('ledger history is owner-only; all client ledger/unlock mutations and truncation fail',async()=>{
      await db.exec(`INSERT INTO token_transactions(user_id,amount,type) VALUES('${uuid(1)}',20,'purchase'),('${uuid(2)}',30,'purchase')`);
      assert.equal((await as(1,'SELECT amount FROM token_transactions')).length,1);
      assert.equal((await as(2,'SELECT amount FROM token_transactions'))[0].amount,30);
      for(const table of ['orders','token_transactions','feature_unlocks']) {
        await denied(as(null,`SELECT * FROM ${table}`,'anon'));
        await denied(as(1,`TRUNCATE ${table}`));
        await denied(as(1,`DELETE FROM ${table}`));
      }
      await denied(as(1,"INSERT INTO token_transactions(amount) VALUES(99)"));
      await denied(as(1,"UPDATE token_transactions SET amount=99"));
      await denied(as(1,`INSERT INTO feature_unlocks(user_id,feature_key) VALUES('${uuid(1)}','free')`));
    });
    const spendSql=(id,key,feature='test',tokens=10,days='NULL')=>`SELECT spend_tokens_atomic('${uuid(id)}','${uuid(key)}','${feature}',NULL,${tokens},${days}) AS result`;
    async function committedSpend(id,key,feature='test',tokens=10,days='NULL') {
      await db.exec('SET ROLE service_role');
      try { return (await db.query(spendSql(id,key,feature,tokens,days))).rows[0].result; }
      finally { await db.exec('RESET ROLE'); }
    }
    await t.test('client cannot invoke backend spending even for own balance',async()=>{
      await denied(as(1,spendSql(1,10)));
      await denied(as(null,spendSql(1,10),'anon'));
    });
    await t.test('spend retries return same result and never charge twice; conflicting reuse fails',async()=>{
      await db.exec('UPDATE users SET token_balance=100 WHERE id=1');
      const first=await committedSpend(1,100);
      assert.equal(first.tokenBalance,90);
      assert.deepEqual(await committedSpend(1,100),first);
      await assert.rejects(committedSpend(1,100,'different'),e=>e.code==='22023');
      assert.equal((await db.query('SELECT token_balance FROM users WHERE id=1')).rows[0].token_balance,90);
      assert.equal((await db.query("SELECT count(*)::int n FROM token_transactions WHERE type='spend'")).rows[0].n,1);
    });
    await t.test('duration unlock deduplicates across different requests; insufficient balance creates nothing',async()=>{
      assert.equal((await committedSpend(1,101,'duration',10,7)).status,'unlocked');
      assert.equal((await committedSpend(1,102,'duration',10,7)).status,'already_unlocked');
      assert.equal((await committedSpend(1,103,'expensive',1000)).status,'insufficient_tokens');
      assert.equal((await db.query('SELECT token_balance FROM users WHERE id=1')).rows[0].token_balance,80);
      assert.equal((await db.query('SELECT count(*)::int n FROM feature_unlocks')).rows[0].n,1);
    });
    await t.test('ledger and unlock failures roll back balance and retry record',async()=>{
      await db.exec("ALTER TABLE token_transactions ADD CONSTRAINT reject_test CHECK(use_case IS DISTINCT FROM 'unlock:fail-ledger')");
      await assert.rejects(committedSpend(1,104,'fail-ledger'));
      await db.exec("ALTER TABLE feature_unlocks ADD CONSTRAINT reject_test CHECK(feature_key <> 'fail-unlock')");
      await assert.rejects(committedSpend(1,105,'fail-unlock',10,7));
      assert.equal((await db.query('SELECT token_balance FROM users WHERE id=1')).rows[0].token_balance,80);
      assert.equal((await db.query(`SELECT count(*)::int n FROM booksmart_stage1.token_spend_requests WHERE request_id IN ('${uuid(104)}','${uuid(105)}')`)).rows[0].n,0);
      assert.equal((await db.query("SELECT count(*)::int n FROM token_transactions WHERE use_case='unlock:fail-unlock'")).rows[0].n,0);
    });
    await t.test('queued independent spends cannot overdraw a balance',async()=>{
      await db.exec('UPDATE users SET token_balance=15 WHERE id=2; SET ROLE service_role');
      try {
        const results=await Promise.all([db.query(spendSql(2,106)),db.query(spendSql(2,107))]);
        assert.deepEqual(results.map(r=>r.rows[0].result.status),['unlocked','insufficient_tokens']);
      } finally { await db.exec('RESET ROLE'); }
      assert.equal((await db.query('SELECT token_balance FROM users WHERE id=2')).rows[0].token_balance,5);
    });
    await t.test('trusted purchase and refund functions retain ledger writes after RLS',async()=>{
      for(const fn of ['apply_token_purchase','refund_token_purchase'])
        await as(null,`SELECT ${fn}('${uuid(1)}',5,'customer','payment','price','product')`,'service_role');
    });
  } finally { await db.close(); }
});
