-- Phase 1 Stripe reliability: make token Checkout fulfillment atomic and idempotent.
-- This migration intentionally keeps payment fulfillment server-only.

do $$
declare
  v_duplicate_session text;
begin
  select stripe_checkout_session_id
  into v_duplicate_session
  from public.token_transactions
  where stripe_checkout_session_id is not null
  group by stripe_checkout_session_id
  having count(*) > 1
  limit 1;

  if v_duplicate_session is not null then
    raise exception
      'Cannot enforce token Checkout idempotency: duplicate session % exists',
      v_duplicate_session;
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'token_transactions'
      and indexdef ilike 'create unique index%'
      and indexdef ~* '\(stripe_checkout_session_id\)'
  ) then
    create unique index token_transactions_checkout_session_uidx
      on public.token_transactions (stripe_checkout_session_id)
      where stripe_checkout_session_id is not null;
  end if;
end
$$;

create or replace function public.fulfill_token_checkout(
  p_user_id uuid,
  p_amount integer,
  p_stripe_checkout_session_id text,
  p_stripe_customer_id text,
  p_stripe_payment_intent_id text,
  p_stripe_price_id text,
  p_stripe_product_id text,
  p_use_case text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_balance integer;
  v_new_balance integer;
  v_existing_user_id uuid;
begin
  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Token purchase amount must be positive';
  end if;

  if p_stripe_checkout_session_id is null
    or btrim(p_stripe_checkout_session_id) = '' then
    raise exception 'Missing Stripe Checkout Session id';
  end if;

  select user_id
  into v_existing_user_id
  from public.token_transactions
  where stripe_checkout_session_id = p_stripe_checkout_session_id
  limit 1;

  if found then
    if v_existing_user_id is distinct from p_user_id then
      raise exception 'Stripe Checkout Session belongs to another user';
    end if;

    select coalesce(token_balance, 0)
    into v_current_balance
    from public.users
    where auth_id = p_user_id;

    return jsonb_build_object(
      'applied', false,
      'reason', 'already_fulfilled',
      'balance_after', coalesce(v_current_balance, 0),
      'tokens_added', 0
    );
  end if;

  select coalesce(token_balance, 0)
  into v_current_balance
  from public.users
  where auth_id = p_user_id
  for update;

  if not found then
    raise exception 'User profile not found for auth user %', p_user_id;
  end if;

  -- Recheck after taking the per-user lock. This serializes webhook/return races.
  select user_id
  into v_existing_user_id
  from public.token_transactions
  where stripe_checkout_session_id = p_stripe_checkout_session_id
  limit 1;

  if found then
    if v_existing_user_id is distinct from p_user_id then
      raise exception 'Stripe Checkout Session belongs to another user';
    end if;

    return jsonb_build_object(
      'applied', false,
      'reason', 'already_fulfilled',
      'balance_after', v_current_balance,
      'tokens_added', 0
    );
  end if;

  v_new_balance := v_current_balance + p_amount;

  insert into public.token_transactions (
    user_id,
    amount,
    balance_after,
    type,
    status,
    use_case,
    stripe_customer_id,
    stripe_payment_intent_id,
    stripe_checkout_session_id,
    stripe_price_id,
    stripe_product_id
  )
  values (
    p_user_id,
    p_amount,
    v_new_balance,
    'purchase',
    'posted',
    p_use_case,
    p_stripe_customer_id,
    p_stripe_payment_intent_id,
    p_stripe_checkout_session_id,
    p_stripe_price_id,
    p_stripe_product_id
  );

  update public.users
  set token_balance = v_new_balance
  where auth_id = p_user_id;

  return jsonb_build_object(
    'applied', true,
    'balance_after', v_new_balance,
    'tokens_added', p_amount
  );
end;
$$;

revoke all on function public.fulfill_token_checkout(
  uuid, integer, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.fulfill_token_checkout(
  uuid, integer, text, text, text, text, text, text
) to service_role;

notify pgrst, 'reload schema';
