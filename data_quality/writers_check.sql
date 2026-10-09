-- Read-only review of public SQL functions that may write category to flyer_deals.
-- Inspect returned definitions and bypass_evidence before treating coverage as complete.
\pset pager off

with candidates as (
  select
    p.oid,
    p.proname,
    pg_get_function_identity_arguments(p.oid) as identity_args,
    p.prosrc
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and (
      p.proname in (
        'commit_pipeline_enrichment_v1',
        'apply_brand_category_ai_batch',
        'cleanup_flyer_deals_batch'
      )
      or (
        p.prosrc ilike '%flyer_deals%'
        and p.prosrc ilike '%category%'
        and p.prosrc ~* '(update|insert)'
      )
    )
)
select
  proname,
  identity_args,
  case
    when proname in (
      'commit_pipeline_enrichment_v1',
      'apply_brand_category_ai_batch',
      'cleanup_flyer_deals_batch'
    ) then 'explicitly requested writer'
    else 'catalog candidate'
  end as review_group,
  pg_get_functiondef(oid) as definition,
  coalesce((
    select string_agg(line, E'\n')
    from regexp_split_to_table(prosrc, E'\n') as lines(line)
    where line ~* '(session_replication_role|disable[[:space:]]+trigger|enable[[:space:]]+trigger)'
  ), '(no matching bypass text in function source)') as bypass_evidence
from candidates
order by review_group, proname, identity_args;

-- Trigger attachment and enabled state. 'O' means enabled for origin sessions.
select
  row_number() over (order by t.tgname) as catalog_display_order,
  t.tgname,
  t.tgenabled,
  t.tgtype,
  case t.tgenabled
    when 'O' then 'enabled: origin'
    when 'A' then 'enabled: always'
    when 'R' then 'enabled: replica only'
    when 'D' then 'disabled'
  end as enabled_state,
  pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_trigger t
join pg_class r on r.oid = t.tgrelid
join pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public'
  and r.relname = 'flyer_deals'
  and not t.tgisinternal
order by t.tgname;
