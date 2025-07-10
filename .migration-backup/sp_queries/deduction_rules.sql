create table deduction_rule_groups (
    id bigint generated always as identity primary key,
    state_id bigint null,
    valid_from date not null,
    valid_to date null,
    description text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint chk_valid_range check (valid_to is null or valid_to > valid_from)
);

create table deduction_rules (
    id bigint generated always as identity primary key,
    deduction_rule_group_id bigint not null
        references deduction_rule_groups(id),
    sub_category_id bigint not null,

    organization_column_name text null,         -- optional org percent column
    calculation_type text not null,             -- 'fixed' | 'percentage'
    value numeric not null,
    is_per_transaction boolean not null default false,
    max_deduction_per_transaction numeric null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (deduction_rule_group_id, sub_category_id),

    constraint chk_calculation_type check (calculation_type in ('fixed', 'percentage')),
    constraint chk_rule_value check (value >= 0),
    constraint chk_org_column check (
        organization_column_name is null
        or organization_column_name in (
            'business_vehicle_percent',
            'business_utility_percent',
            'business_meal_percent'
        )
    ),

    constraint chk_max_per_transaction check (
        max_deduction_per_transaction is null or is_per_transaction = true
    ),
    constraint chk_max_value check (
        max_deduction_per_transaction is null or max_deduction_per_transaction >= 0
    )
);