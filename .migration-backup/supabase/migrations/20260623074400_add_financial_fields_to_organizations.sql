alter table public.organizations
    add column if not exists equipment_cost numeric not null default 0,
    add column if not exists debts jsonb null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'organizations_equipment_cost_non_negative_check'
          and conrelid = 'public.organizations'::regclass
    ) then
        alter table public.organizations
            add constraint organizations_equipment_cost_non_negative_check
            check (equipment_cost >= 0);
    end if;
end $$;
