create table if not exists public.deduction_rule_groups (
    id bigint generated always as identity primary key,
    state_id bigint null,
    valid_from date not null,
    valid_to date null,
    description text null,
    created_at timestamptz not null default now()
);

create table if not exists public.deduction_rules (
    id bigint generated always as identity primary key,
    deduction_rule_group_id bigint null,
    sub_category_id bigint null,
    organization_column_name text null,
    calculation_type text null,
    value numeric null,
    is_per_transaction boolean not null default false,
    max_deduction_per_transaction numeric null,
    created_at timestamptz not null default now()
);

alter table public.deduction_rule_groups
    add column if not exists updated_at timestamptz not null default now();

alter table public.deduction_rules
    add column if not exists deduction_rule_group_id bigint null,
    add column if not exists sub_category_id bigint null,
    add column if not exists organization_column_name text null,
    add column if not exists calculation_type text null,
    add column if not exists value numeric null,
    add column if not exists is_per_transaction boolean not null default false,
    add column if not exists max_deduction_per_transaction numeric null,
    add column if not exists updated_at timestamptz not null default now();

alter table public.deduction_rule_groups
    drop constraint if exists chk_valid_range,
    drop constraint if exists deduction_rule_groups_valid_range_check;

alter table public.deduction_rule_groups
    add constraint deduction_rule_groups_valid_range_check
    check (valid_to is null or valid_to > valid_from);

alter table public.deduction_rules
    drop constraint if exists chk_rule_fields,
    drop constraint if exists chk_calculation_type,
    drop constraint if exists chk_rule_value,
    drop constraint if exists chk_org_column,
    drop constraint if exists chk_max_per_transaction,
    drop constraint if exists chk_max_value,
    drop constraint if exists deduction_rules_calculation_type_check,
    drop constraint if exists deduction_rules_value_check,
    drop constraint if exists deduction_rules_org_column_check,
    drop constraint if exists deduction_rules_max_per_transaction_check,
    drop constraint if exists deduction_rules_max_value_check;

alter table public.deduction_rules
    add constraint deduction_rules_calculation_type_check
    check (calculation_type is null or calculation_type in ('percentage', 'fixed')),
    add constraint deduction_rules_value_check
    check (value is null or value >= 0),
    add constraint deduction_rules_org_column_check
    check (
        organization_column_name is null
        or organization_column_name in (
            'business_vehicle_percent',
            'business_utility_percent',
            'business_meal_percent'
        )
    ),
    add constraint deduction_rules_max_per_transaction_check
    check (max_deduction_per_transaction is null or is_per_transaction = true),
    add constraint deduction_rules_max_value_check
    check (max_deduction_per_transaction is null or max_deduction_per_transaction >= 0);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'deduction_rules_group_fk'
          and conrelid = 'public.deduction_rules'::regclass
    ) then
        alter table public.deduction_rules
            add constraint deduction_rules_group_fk
            foreign key (deduction_rule_group_id)
            references public.deduction_rule_groups(id)
            on delete cascade
            not valid;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'deduction_rules_sub_category_fk'
          and conrelid = 'public.deduction_rules'::regclass
    ) then
        alter table public.deduction_rules
            add constraint deduction_rules_sub_category_fk
            foreign key (sub_category_id)
            references public.sub_category(id)
            not valid;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'deduction_rules_group_sub_category_key'
          and conrelid = 'public.deduction_rules'::regclass
    ) then
        alter table public.deduction_rules
            add constraint deduction_rules_group_sub_category_key
            unique (deduction_rule_group_id, sub_category_id);
    end if;
end $$;

grant select, insert, update, delete on public.deduction_rule_groups to authenticated;
grant select, insert, update, delete on public.deduction_rules to authenticated;
grant usage, select on all sequences in schema public to authenticated;

notify pgrst, 'reload schema';
