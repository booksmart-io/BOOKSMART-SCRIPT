-- Read-only contractor financial intelligence security audit.
-- Run this in the Supabase SQL Editor. It does not modify data or schema.

with required_tables(table_name) as (
  values
    ('contractor_financial_settings'),
    ('contractor_financial_matches'),
    ('contractor_job_cost_assignments'),
    ('contractor_receipt_extractions'),
    ('contractor_source_links')
),
table_security as (
  select
    required_tables.table_name,
    coalesce(pg_class.relrowsecurity, false) as rls_enabled,
    count(pg_policies.policyname)::int as policy_count
  from required_tables
  left join pg_class
    on pg_class.relname = required_tables.table_name
   and pg_class.relnamespace = (select oid from pg_namespace where nspname = 'public')
  left join pg_policies
    on pg_policies.schemaname = 'public'
   and pg_policies.tablename = required_tables.table_name
  group by required_tables.table_name, pg_class.relrowsecurity
),
unsafe_grants as (
  select count(*)::int as count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (select table_name from required_tables)
    and grantee in ('anon', 'authenticated')
),
cross_org_job_matches as (
  select count(*)::int as count
  from public.contractor_financial_matches match
  join public.jobber_records job
    on job.object_type = 'jobs'
   and job.external_id = match.jobber_job_id
  where match.jobber_job_id is not null
    and job.organization_id <> match.organization_id
),
cross_org_assignment_matches as (
  select count(*)::int as count
  from public.contractor_job_cost_assignments assignment
  join public.contractor_financial_matches match
    on match.id = assignment.match_id
  where assignment.organization_id <> match.organization_id
),
cross_org_assignment_transactions as (
  select count(*)::int as count
  from public.contractor_job_cost_assignments assignment
  join public.transactions canonical_transaction
    on assignment.source_record_type = 'transaction'
   and assignment.source_record_id = canonical_transaction.id::text
  where canonical_transaction.org_id <> assignment.organization_id
),
untraceable_assignments as (
  select count(*)::int as count
  from public.contractor_job_cost_assignments
  where confidence = 'confirmed'
    and match_id is null
),
duplicate_assignments as (
  select count(*)::int as count
  from (
    select
      organization_id,
      source_provider,
      source_record_type,
      source_record_id
    from public.contractor_job_cost_assignments
    group by 1, 2, 3, 4
    having count(*) > 1
  ) duplicates
)
select
  (
    not exists (select 1 from table_security where not rls_enabled)
    and (select count from unsafe_grants) = 0
    and (select count from cross_org_job_matches) = 0
    and (select count from cross_org_assignment_matches) = 0
    and (select count from cross_org_assignment_transactions) = 0
    and (select count from untraceable_assignments) = 0
    and (select count from duplicate_assignments) = 0
  ) as ready,
  coalesce((select string_agg(table_name, ', ' order by table_name) from table_security where not rls_enabled), 'none') as tables_without_rls,
  coalesce((select string_agg(table_name, ', ' order by table_name) from table_security where policy_count = 0), 'none') as tables_without_policies,
  (select count from unsafe_grants) as unsafe_client_grants,
  (select count from cross_org_job_matches) as cross_org_job_matches,
  (select count from cross_org_assignment_matches) as cross_org_assignment_matches,
  (select count from cross_org_assignment_transactions) as cross_org_assignment_transactions,
  (select count from untraceable_assignments) as untraceable_confirmed_assignments,
  (select count from duplicate_assignments) as duplicate_assignments;
