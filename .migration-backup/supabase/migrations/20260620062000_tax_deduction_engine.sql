create table if not exists public.deduction_rule_groups (
    id bigint generated always as identity primary key,
    state_id bigint null references public.states(id),
    valid_from date not null,
    valid_to date null,
    description text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint deduction_rule_groups_valid_range_check
        check (valid_to is null or valid_to > valid_from)
);

create table if not exists public.deduction_rules (
    id bigint generated always as identity primary key,
    deduction_rule_group_id bigint not null
        references public.deduction_rule_groups(id) on delete cascade,
    sub_category_id bigint not null references public.sub_category(id),
    organization_column_name text null,
    calculation_type text not null,
    value numeric not null,
    is_per_transaction boolean not null default false,
    max_deduction_per_transaction numeric null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint deduction_rules_calculation_type_check
        check (calculation_type in ('percentage', 'fixed')),
    constraint deduction_rules_value_check
        check (value >= 0),
    constraint deduction_rules_org_column_check
        check (
            organization_column_name is null
            or organization_column_name in (
                'business_vehicle_percent',
                'business_utility_percent',
                'business_meal_percent'
            )
        ),
    constraint deduction_rules_max_per_transaction_check
        check (max_deduction_per_transaction is null or is_per_transaction = true),
    constraint deduction_rules_max_value_check
        check (max_deduction_per_transaction is null or max_deduction_per_transaction >= 0),
    unique (deduction_rule_group_id, sub_category_id)
);

create index if not exists deduction_rule_groups_state_validity_idx
    on public.deduction_rule_groups (state_id, valid_from, valid_to);

create index if not exists deduction_rules_group_idx
    on public.deduction_rules (deduction_rule_group_id);

drop function if exists public.get_tax_deductions(bigint, date, date);
drop function if exists public.get_tax_deductions(bigint, timestamptz, timestamptz);
drop function if exists public.calculate_deductions(bigint, bigint, date, date);
drop function if exists public.calculate_deductions(bigint, bigint, timestamptz, timestamptz);

create or replace function public.get_tax_deductions(
    p_org_id bigint,
    p_start_date date,
    p_end_date date
)
returns table (
    out_sub_category_id bigint,
    out_total_amount numeric,
    out_transaction_count bigint,
    out_federal_deduction numeric,
    out_federal_deduction_rate text,
    out_state_deduction numeric,
    out_state_deduction_rate text,
    out_deduction_rate numeric
)
language plpgsql
stable
as $$
begin
    return query
    with org_details as (
        select
            o.state as org_state_id,
            coalesce(o.business_vehicle_percent, 0)::numeric as business_vehicle_percent,
            coalesce(o.business_utility_percent, 0)::numeric as business_utility_percent,
            coalesce(o.business_meal_percent, 0)::numeric as business_meal_percent
        from public.organizations o
        where o.id = p_org_id
        limit 1
    ),
    selected_groups as (
        select g.id, g.state_id
        from org_details od
        join lateral (
            select federal_group.id, federal_group.state_id
            from public.deduction_rule_groups federal_group
            where federal_group.state_id is null
              and federal_group.valid_from <= p_end_date
              and (federal_group.valid_to is null or federal_group.valid_to >= p_start_date)
            order by federal_group.valid_from desc
            limit 1
        ) g on true

        union all

        select g.id, g.state_id
        from org_details od
        join lateral (
            select state_group.id, state_group.state_id
            from public.deduction_rule_groups state_group
            where state_group.state_id = od.org_state_id
              and state_group.valid_from <= p_end_date
              and (state_group.valid_to is null or state_group.valid_to >= p_start_date)
            order by state_group.valid_from desc
            limit 1
        ) g on true
    ),
    tx as (
        select
            t.id,
            t.sub_category_id,
            abs(t.amount)::numeric as amount
        from public.transactions t
        where t.org_id = p_org_id
          and t.deductible = true
          and t.sub_category_id is not null
          and t.date_time >= p_start_date::timestamptz
          and t.date_time < (p_end_date + 1)::timestamptz
    ),
    tx_totals as (
        select
            tx.sub_category_id,
            sum(tx.amount)::numeric as total_amount,
            count(*)::bigint as transaction_count
        from tx
        group by tx.sub_category_id
    ),
    rules as (
        select
            r.id,
            r.sub_category_id,
            sg.state_id,
            r.organization_column_name,
            r.calculation_type,
            r.value,
            r.is_per_transaction,
            r.max_deduction_per_transaction,
            case r.organization_column_name
                when 'business_vehicle_percent' then od.business_vehicle_percent
                when 'business_utility_percent' then od.business_utility_percent
                when 'business_meal_percent' then od.business_meal_percent
                else null
            end as org_percent
        from selected_groups sg
        join public.deduction_rules r
          on r.deduction_rule_group_id = sg.id
        cross join org_details od
    ),
    calculated_rules as (
        select
            tt.sub_category_id,
            rules.state_id,
            case
                when rules.id is null then 0::numeric
                when rules.is_per_transaction then coalesce(per_tx.deduction, 0)
                else
                    case rules.calculation_type
                        when 'percentage' then bulk.base_amount * (rules.value / 100)
                        when 'fixed' then least(bulk.base_amount, rules.value)
                        else 0::numeric
                    end
            end as deduction_amount,
            case
                when rules.id is null then null
                else concat_ws(
                    ', ',
                    case
                        when rules.organization_column_name is null then null
                        else rules.organization_column_name || ' -> ' || trim(to_char(coalesce(rules.org_percent, 0), 'FM999999990.##')) || '%'
                    end,
                    case
                        when rules.calculation_type = 'percentage' then
                            case
                                when rules.is_per_transaction then '@' || trim(to_char(rules.value, 'FM999999990.##')) || '% per transaction'
                                else trim(to_char(rules.value, 'FM999999990.##')) || '%'
                            end
                        when rules.calculation_type = 'fixed' then
                            case
                                when rules.is_per_transaction then '$' || trim(to_char(rules.value, 'FM999999990.##')) || ' fixed per transaction'
                                else '$' || trim(to_char(rules.value, 'FM999999990.##')) || ' fixed'
                            end
                        else null
                    end,
                    case
                        when rules.max_deduction_per_transaction is null then null
                        else 'max $' || trim(to_char(rules.max_deduction_per_transaction, 'FM999999990.##')) || '/transaction'
                    end
                )
            end as deduction_rate,
            case
                when rules.calculation_type = 'percentage' and rules.organization_column_name is null then rules.value
                else null::numeric
            end as numeric_rate
        from tx_totals tt
        left join rules
          on rules.sub_category_id = tt.sub_category_id
        left join lateral (
            select
                tt.total_amount
                * case
                    when rules.organization_column_name is null then 1::numeric
                    else coalesce(rules.org_percent, 0) / 100
                  end as base_amount
        ) bulk on true
        left join lateral (
            select sum(
                case rules.calculation_type
                    when 'percentage' then least(
                        case
                            when rules.max_deduction_per_transaction is null then tx.amount
                            else rules.max_deduction_per_transaction
                        end,
                        tx.amount
                        * case
                            when rules.organization_column_name is null then 1::numeric
                            else coalesce(rules.org_percent, 0) / 100
                          end
                        * (rules.value / 100)
                    )
                    when 'fixed' then least(
                        tx.amount
                        * case
                            when rules.organization_column_name is null then 1::numeric
                            else coalesce(rules.org_percent, 0) / 100
                          end,
                        rules.value,
                        coalesce(rules.max_deduction_per_transaction, rules.value)
                    )
                    else 0::numeric
                end
            ) as deduction
            from tx
            where tx.sub_category_id = tt.sub_category_id
              and rules.id is not null
        ) per_tx on true
    )
    select
        tt.sub_category_id as out_sub_category_id,
        tt.total_amount as out_total_amount,
        tt.transaction_count as out_transaction_count,
        coalesce(sum(cr.deduction_amount) filter (where cr.state_id is null), 0)::numeric as out_federal_deduction,
        max(cr.deduction_rate) filter (where cr.state_id is null) as out_federal_deduction_rate,
        coalesce(sum(cr.deduction_amount) filter (where cr.state_id is not null), 0)::numeric as out_state_deduction,
        max(cr.deduction_rate) filter (where cr.state_id is not null) as out_state_deduction_rate,
        max(cr.numeric_rate) filter (where cr.state_id is null) as out_deduction_rate
    from tx_totals tt
    left join calculated_rules cr
      on cr.sub_category_id = tt.sub_category_id
    group by tt.sub_category_id, tt.total_amount, tt.transaction_count
    order by tt.total_amount desc;
end;
$$;

create or replace function public.calculate_deductions(
    p_org_id bigint,
    p_state_id bigint,
    p_start_date date,
    p_end_date date
)
returns table (
    sub_category_id bigint,
    total_amount numeric,
    transaction_count bigint,
    state_deduction numeric,
    federal_deduction numeric,
    deduction_rate numeric
)
language sql
stable
as $$
    select
        g.out_sub_category_id as sub_category_id,
        g.out_total_amount as total_amount,
        g.out_transaction_count as transaction_count,
        g.out_state_deduction as state_deduction,
        g.out_federal_deduction as federal_deduction,
        g.out_deduction_rate as deduction_rate
    from public.get_tax_deductions(p_org_id, p_start_date, p_end_date) g;
$$;
