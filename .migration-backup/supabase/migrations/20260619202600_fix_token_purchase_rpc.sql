alter table public.users
add column if not exists token_balance integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_token_balance_non_negative'
  ) then
    alter table public.users
    add constraint users_token_balance_non_negative check (token_balance >= 0);
  end if;
end $$;

drop index if exists public.token_transactions_payment_intent_uidx;
drop index if exists public.token_transactions_payment_intent_type_uidx;

create unique index if not exists token_transactions_purchase_payment_intent_uidx
on public.token_transactions (stripe_payment_intent_id)
where stripe_payment_intent_id is not null
  and type = 'purchase';

create or replace function public.apply_token_purchase(
  p_user_id uuid,
  p_amount integer,
  p_stripe_customer_id text,
  p_stripe_payment_intent_id text,
  p_stripe_price_id text,
  p_stripe_product_id text,
  p_use_case text default 'Token purchase'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_existing public.token_transactions%rowtype;
begin
  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Token purchase amount must be positive';
  end if;

  if p_stripe_payment_intent_id is null or length(p_stripe_payment_intent_id) = 0 then
    raise exception 'Missing Stripe payment intent id';
  end if;

  select *
  into v_existing
  from public.token_transactions
  where stripe_payment_intent_id = p_stripe_payment_intent_id
    and type = 'purchase'
    and status = 'posted'
  limit 1;

  if found then
    return jsonb_build_object(
      'applied', false,
      'reason', 'already_applied',
      'balance_after', v_existing.balance_after
    );
  end if;

  update public.users
  set token_balance = coalesce(token_balance, 0) + p_amount
  where auth_id::text = p_user_id::text
  returning token_balance into v_balance;

  if v_balance is null then
    raise exception 'User profile not found for auth user %', p_user_id;
  end if;

  insert into public.token_transactions (
    user_id,
    amount,
    balance_after,
    type,
    status,
    use_case,
    stripe_customer_id,
    stripe_payment_intent_id,
    stripe_price_id,
    stripe_product_id
  )
  values (
    p_user_id,
    p_amount,
    v_balance,
    'purchase',
    'posted',
    p_use_case,
    p_stripe_customer_id,
    p_stripe_payment_intent_id,
    p_stripe_price_id,
    p_stripe_product_id
  );

  return jsonb_build_object(
    'applied', true,
    'balance_after', v_balance
  );
end;
$$;

create or replace function public.refund_token_purchase(
  p_user_id uuid,
  p_amount integer,
  p_stripe_customer_id text,
  p_stripe_payment_intent_id text,
  p_stripe_price_id text,
  p_stripe_product_id text,
  p_use_case text default 'Token purchase refund'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance_before integer;
  v_balance_after integer;
  v_already_refunded integer;
  v_refund_amount integer;
begin
  if p_user_id is null then
    raise exception 'Missing user id';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Token refund amount must be positive';
  end if;

  if p_stripe_payment_intent_id is null or length(p_stripe_payment_intent_id) = 0 then
    raise exception 'Missing Stripe payment intent id';
  end if;

  select coalesce(sum(abs(amount)), 0)
  into v_already_refunded
  from public.token_transactions
  where stripe_payment_intent_id = p_stripe_payment_intent_id
    and type = 'refund'
    and status = 'refunded';

  v_refund_amount := p_amount - v_already_refunded;

  if v_refund_amount <= 0 then
    return jsonb_build_object(
      'applied', false,
      'reason', 'already_refunded',
      'already_refunded_amount', v_already_refunded
    );
  end if;

  select coalesce(token_balance, 0)
  into v_balance_before
  from public.users
  where auth_id::text = p_user_id::text
  for update;

  if v_balance_before is null then
    raise exception 'User profile not found for auth user %', p_user_id;
  end if;

  v_refund_amount := least(v_balance_before, v_refund_amount);
  v_balance_after := v_balance_before - v_refund_amount;

  update public.users
  set token_balance = v_balance_after
  where auth_id::text = p_user_id::text;

  insert into public.token_transactions (
    user_id,
    amount,
    balance_after,
    type,
    status,
    use_case,
    stripe_customer_id,
    stripe_payment_intent_id,
    stripe_price_id,
    stripe_product_id
  )
  values (
    p_user_id,
    -v_refund_amount,
    v_balance_after,
    'refund',
    'refunded',
    p_use_case,
    p_stripe_customer_id,
    p_stripe_payment_intent_id,
    p_stripe_price_id,
    p_stripe_product_id
  );

  return jsonb_build_object(
    'applied', true,
    'deducted_amount', v_refund_amount,
    'balance_after', v_balance_after
  );
end;
$$;

grant execute on function public.apply_token_purchase(
  uuid,
  integer,
  text,
  text,
  text,
  text,
  text
) to service_role;

grant execute on function public.refund_token_purchase(
  uuid,
  integer,
  text,
  text,
  text,
  text,
  text
) to service_role;

notify pgrst, 'reload schema';
