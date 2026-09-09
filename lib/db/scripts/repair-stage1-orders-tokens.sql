-- DEVELOPMENT REVIEW DRAFT. Apply after repair-stage1-tenant-isolation.sql.
-- No old orders are automatically trusted; clients must explicitly authorize them.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user <> 'postgres' OR to_regprocedure('booksmart_stage1.user_id()') IS NULL THEN
  RAISE EXCEPTION 'Run as postgres after the reviewed stage 1 foundation';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls))
 OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('anon','authenticated')) THEN
  RAISE EXCEPTION 'Unsafe client role privileges';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.orders'::regclass,'public.token_transactions'::regclass)
 AND pg_get_userbyid(relowner)<>'postgres') THEN RAISE EXCEPTION 'Unexpected table owner'; END IF;
END $$;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_authorized boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.feature_unlocks (
 id bigserial PRIMARY KEY,user_id uuid NOT NULL,feature_key text NOT NULL,scope_key text,
 tokens_spent integer NOT NULL DEFAULT 0,expires_at timestamptz,created_at timestamptz DEFAULT now()
);
DO $$ BEGIN
 IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.feature_unlocks'::regclass)<>'postgres'
 THEN RAISE EXCEPTION 'Unexpected feature_unlocks owner'; END IF;
END $$;

DO $$ DECLARE p record; g record; tbl text; seq text; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public'
 AND tablename IN ('orders','token_transactions','feature_unlocks') LOOP
  EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
 END LOOP;
 FOREACH tbl IN ARRAY ARRAY['orders','token_transactions','feature_unlocks'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tbl);
  seq:=pg_get_serial_sequence('public.'||tbl,'id');
  IF seq IS NOT NULL THEN
   EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC,anon,authenticated',seq);
   IF tbl='orders' THEN EXECUTE format('GRANT USAGE ON SEQUENCE %s TO authenticated',seq); END IF;
   EXECUTE format('GRANT USAGE ON SEQUENCE %s TO service_role',seq);
  END IF;
 END LOOP;
 FOR g IN SELECT table_name,column_name,grantee,privilege_type FROM information_schema.column_privileges
 WHERE table_schema='public' AND table_name IN ('orders','token_transactions','feature_unlocks')
 AND grantee IN ('PUBLIC','anon','authenticated') LOOP
  EXECUTE format('REVOKE %s (%I) ON public.%I FROM %s',g.privilege_type,g.column_name,g.table_name,
   CASE WHEN g.grantee='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(g.grantee) END);
 END LOOP;
END $$;
GRANT SELECT ON public.orders,public.token_transactions,public.feature_unlocks TO authenticated;
GRANT INSERT(user_id,cpa_id,title,services,description,status,payment_status,amount) ON public.orders TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.feature_unlocks TO service_role;
CREATE POLICY stage1_order_read ON public.orders FOR SELECT TO authenticated
 USING(user_id=booksmart_stage1.user_id() OR (
   cpa_id=booksmart_stage1.user_id() AND EXISTS(
     SELECT 1 FROM public.users u WHERE u.id=cpa_id AND u.role='cpa'
       AND lower(trim(u.verification_status))='approved'
   )
 ));
CREATE POLICY stage1_order_request ON public.orders FOR INSERT TO authenticated
 WITH CHECK(user_id=booksmart_stage1.user_id() AND status='pending' AND client_authorized);
CREATE POLICY stage1_ledger_read ON public.token_transactions FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY stage1_unlock_read ON public.feature_unlocks FOR SELECT TO authenticated USING(user_id=auth.uid());

CREATE OR REPLACE FUNCTION booksmart_stage1.guard_order_request()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF current_user NOT IN ('postgres','service_role') THEN
  IF NEW.user_id IS DISTINCT FROM booksmart_stage1.user_id() OR auth.uid() IS NULL
   OR NEW.status IS DISTINCT FROM 'pending' OR NEW.payment_status IS DISTINCT FROM 'unpaid'
   OR NEW.amount IS DISTINCT FROM 0::numeric
   OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.user_id AND role='user')
   OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=NEW.cpa_id AND role='cpa'
     AND lower(trim(verification_status))='approved') THEN
   RAISE EXCEPTION 'Only a client can request an approved CPA' USING ERRCODE='42501';
  END IF;
  NEW.client_authorized:=true;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION booksmart_stage1.guard_order_request() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS stage1_guard_order_request ON public.orders;
CREATE TRIGGER stage1_guard_order_request BEFORE INSERT ON public.orders
 FOR EACH ROW EXECUTE FUNCTION booksmart_stage1.guard_order_request();

-- Client identity comes from the verified JWT, never a request parameter.
-- Revocation covers every order for the same client/CPA so a second order cannot preserve access.
CREATE OR REPLACE FUNCTION public.set_cpa_order_authorization(p_order_id bigint,p_authorized boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o public.orders%ROWTYPE; caller bigint;
BEGIN
 caller:=booksmart_stage1.user_id();
 IF caller IS NULL OR p_authorized IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND user_id=caller FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_authorized THEN
  IF o.status NOT IN ('pending','active','in_progress','in-progress') OR NOT EXISTS(
   SELECT 1 FROM public.users WHERE id=o.cpa_id AND role='cpa' AND lower(trim(verification_status))='approved') THEN
   RAISE EXCEPTION 'Order is not eligible for access' USING ERRCODE='42501';
  END IF;
  UPDATE public.orders SET client_authorized=true WHERE id=o.id;
 ELSE
  UPDATE public.orders SET client_authorized=false WHERE user_id=caller AND cpa_id=o.cpa_id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_cpa_order_authorization(bigint,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_cpa_order_authorization(bigint,boolean) TO authenticated;

-- Atomic backend-only spend. A user row lock serializes all unlocks for that user.
GRANT USAGE ON SCHEMA booksmart_stage1 TO service_role;
CREATE TABLE IF NOT EXISTS booksmart_stage1.token_spend_requests (
 user_id uuid NOT NULL,request_id uuid NOT NULL,arguments jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(user_id,request_id)
);
REVOKE ALL ON booksmart_stage1.token_spend_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON booksmart_stage1.token_spend_requests TO service_role;
ALTER TABLE booksmart_stage1.token_spend_requests ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.spend_tokens_atomic(
 p_user_id uuid,p_request_id uuid,p_feature_key text,p_scope_key text,p_tokens integer,p_duration_days integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE balance integer; args jsonb; prior record; unlocked jsonb; result jsonb; spend bigint;
BEGIN
 IF current_user NOT IN ('postgres','service_role') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_user_id IS NULL OR p_request_id IS NULL OR p_tokens IS NULL OR p_tokens<=0
 OR p_feature_key IS NULL OR length(p_feature_key)=0
 OR (p_duration_days IS NOT NULL AND p_duration_days<=0) THEN
  RAISE EXCEPTION 'Invalid spend request' USING ERRCODE='22023';
 END IF;
 SELECT token_balance INTO balance FROM public.users WHERE auth_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE='P0002'; END IF;
 args:=jsonb_build_array(p_feature_key,p_scope_key,p_tokens,p_duration_days);
 SELECT * INTO prior FROM booksmart_stage1.token_spend_requests WHERE user_id=p_user_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.arguments IS DISTINCT FROM args THEN RAISE EXCEPTION 'Retry key reused for a different request' USING ERRCODE='22023'; END IF;
  RETURN prior.result;
 END IF;
 IF p_duration_days IS NOT NULL THEN
  SELECT to_jsonb(f) INTO unlocked FROM public.feature_unlocks f WHERE user_id=p_user_id
   AND feature_key=p_feature_key AND scope_key IS NOT DISTINCT FROM p_scope_key AND expires_at>now()
   ORDER BY expires_at DESC LIMIT 1;
 END IF;
 IF unlocked IS NULL THEN
  IF balance<p_tokens THEN
   RETURN jsonb_build_object('status','insufficient_tokens','tokenBalance',balance,'required',p_tokens);
  END IF;
  balance:=balance-p_tokens;
  UPDATE public.users SET token_balance=balance WHERE auth_id=p_user_id;
  INSERT INTO public.token_transactions(user_id,amount,balance_after,type,status,use_case)
   VALUES(p_user_id,-p_tokens,balance,'spend','posted','unlock:'||p_feature_key);
  IF p_duration_days IS NOT NULL THEN
   INSERT INTO public.feature_unlocks(user_id,feature_key,scope_key,tokens_spent,expires_at)
    VALUES(p_user_id,p_feature_key,p_scope_key,p_tokens,now()+make_interval(days=>p_duration_days))
    RETURNING to_jsonb(feature_unlocks.*) INTO unlocked;
  END IF;
  result:=jsonb_build_object('status','unlocked','unlock',unlocked,'tokenBalance',balance);
 ELSE
  result:=jsonb_build_object('status','already_unlocked','unlock',unlocked,'tokenBalance',balance);
 END IF;
 SELECT coalesce(sum(abs(amount)),0) INTO spend FROM public.token_transactions WHERE user_id=p_user_id
  AND type='spend' AND amount<0 AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 result:=result||jsonb_build_object('monthlyTokenSpend',spend);
 INSERT INTO booksmart_stage1.token_spend_requests VALUES(p_user_id,p_request_id,args,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.spend_tokens_atomic(uuid,uuid,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spend_tokens_atomic(uuid,uuid,text,text,integer,integer) TO service_role;
COMMIT;
