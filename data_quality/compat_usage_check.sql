-- Read-only discovery of functions/views that consult compatible_categories.
\pset pager off

select
  n.nspname as schema_name,
  p.proname as object_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  'function' as object_type,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and p.prosrc ilike '%compatible_categories%'
order by n.nspname, p.proname, arguments;

select
  schemaname as schema_name,
  viewname as object_name,
  'view' as object_type,
  definition
from pg_views
where schemaname = 'public'
  and definition ilike '%compatible_categories%'
order by schemaname, viewname;
