-- Read-only catalog query. Do not invoke the v2.7 RPC functions.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.provolatile as volatility,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'v27_claim_one_classification_item',
    'v27_claim_one_slow_classification_item',
    'v27_complete_classification_lease',
    'v27_cancel_classification_lease',
    'v27_classify_leased_source_product',
    'v27_finalize_source_product_incremental'
  )
order by p.proname, identity_arguments;
