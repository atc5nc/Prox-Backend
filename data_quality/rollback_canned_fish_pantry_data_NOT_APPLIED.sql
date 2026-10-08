-- DQ-01 proposed canary-data rollback. NEVER run against production without
-- written review/approval. First restore the pre-DQ-01 trigger function using
-- rollback_canned_fish_pantry_rule.sql, then run this script with the exact
-- approved retailer/id range. It only restores rows still matching the
-- DQ-01-set fields and original product identity.

\set ON_ERROR_STOP on
\if :{?canary_min_id}
\else
  \echo 'Refusing: set canary_min_id explicitly.'
  \quit 2
\endif
\if :{?canary_max_id}
\else
  \echo 'Refusing: set canary_max_id explicitly.'
  \quit 2
\endif
\if :{?canary_retailer_key}
\else
  \echo 'Refusing: set canary_retailer_key explicitly.'
  \quit 2
\endif

begin;

with restored as (
  update public.flyer_deals f
  set category = s.category,
      category_source = s.category_source,
      category_confidence = s.category_confidence,
      category_flag = s.category_flag,
      category_conflicts = s.category_conflicts
  from public.dq01_canned_fish_category_snapshot s
  where f.id = s.id
    and f.id between :'canary_min_id'::bigint and :'canary_max_id'::bigint
    and coalesce(nullif(btrim(f.retailer_key), ''), nullif(btrim(f.retailer), ''))
        = :'canary_retailer_key'
    and f.category = 'PANTRY'
    and f.category_source = 'manual_correction'
    and f.category_confidence = 1.0
    and f.category_flag is true
    and f.category_conflicts is false
    and f.product_name is not distinct from s.product_name
    and f.canonical_product_id is not distinct from s.canonical_product_id
    and f.canonical_product_name is not distinct from s.canonical_product_name
  returning f.id
)
select count(*) as restored_rows from restored;

commit;
