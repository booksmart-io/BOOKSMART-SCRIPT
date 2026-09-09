-- Scope Plaid idempotency keys to the owning item/organization.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run reviewed migration as postgres'; END IF;
 IF EXISTS(SELECT 1 FROM public.transactions WHERE plaid_transaction_id IS NOT NULL
  GROUP BY org_id,plaid_transaction_id HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Duplicate Plaid transaction IDs exist within an organization';
 END IF;
 IF EXISTS(SELECT 1 FROM public.plaid_accounts
  GROUP BY plaid_item_id,plaid_account_id HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Duplicate Plaid account IDs exist within an item';
 END IF;
END $$;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_plaid_transaction_id_key;
DROP INDEX IF EXISTS public.transactions_plaid_transaction_id_key;
CREATE UNIQUE INDEX transactions_org_plaid_transaction_key
 ON public.transactions(org_id,plaid_transaction_id);
ALTER TABLE public.plaid_accounts DROP CONSTRAINT IF EXISTS plaid_accounts_plaid_account_id_key;
DROP INDEX IF EXISTS public.plaid_accounts_plaid_account_id_key;
CREATE UNIQUE INDEX plaid_accounts_item_account_key
 ON public.plaid_accounts(plaid_item_id,plaid_account_id);
COMMIT;
