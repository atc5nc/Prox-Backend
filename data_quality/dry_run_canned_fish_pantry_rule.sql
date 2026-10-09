-- DQ-01 read-only dry run. Run BEFORE considering any migration/backfill.
-- No writes, temp tables, or function dependencies. Use the same brand
-- neutralization and exclusions as migration_canned_fish_pantry_rule.sql.
\pset pager off

-- 1a. Candidate counts by approved identity, current category, and retailer.
with source_rows as (
  select
    id,
    canonical_product_id,
    canonical_product_name,
    product_name,
    upper(btrim(coalesce(category, ''))) as stored_category,
    coalesce(nullif(btrim(retailer_key), ''), nullif(btrim(retailer), ''), '(unknown)') as retailer,
    product_price,
    store_id,
    lower(
      regexp_replace(
        regexp_replace(product_name, 'fresh[[:space:]]+thyme[[:space:]]+market', ' ', 'gi'),
        'bowl[[:space:]]*&[[:space:]]*basket',
        ' ',
        'gi'
      )
    ) as normalized_name
  from public.flyer_deals
  where (canonical_product_id, canonical_product_name) in ((27, 'Canned Tuna'), (236, 'Canned Salmon'))
    and product_price is not null
), classified as (
  select *,
    stored_category in ('SEAFOOD', 'BEVERAGES', 'DESSERT') as category_in_scope,
    normalized_name ~ '(^|[^[:alnum:]])(rolls?|nigiri|sushi|poke|salads?|sandwiches?|croissants?|baguettes?|bowls?|steaks?|frozen|fresh|raw|cats?|dogs?|pets?|kittens?)([^[:alnum:]]|$)' as excluded_by_name_guard
  from source_rows
)
select
  canonical_product_name,
  stored_category,
  retailer,
  count(*) as priced_rows,
  count(*) filter (where category_in_scope and not excluded_by_name_guard) as would_move,
  count(*) filter (
    where category_in_scope and not excluded_by_name_guard
      and product_price > 0 and store_id is not null
  ) as would_move_app_eligible,
  count(distinct product_name) filter (
    where category_in_scope and not excluded_by_name_guard
  ) as distinct_exact_product_names,
  count(*) filter (where category_in_scope and excluded_by_name_guard) as excluded_by_name_guard
from classified
group by canonical_product_name, stored_category, retailer
order by would_move desc, canonical_product_name, stored_category, retailer;

-- 1b. Exact overall totals. Do not sum per-retailer distinct-name counts.
with source_rows as (
  select
    id,
    canonical_product_name,
    product_name,
    upper(btrim(coalesce(category, ''))) as stored_category,
    coalesce(nullif(btrim(retailer_key), ''), nullif(btrim(retailer), ''), '(unknown)') as retailer,
    product_price,
    store_id,
    lower(
      regexp_replace(
        regexp_replace(product_name, 'fresh[[:space:]]+thyme[[:space:]]+market', ' ', 'gi'),
        'bowl[[:space:]]*&[[:space:]]*basket',
        ' ',
        'gi'
      )
    ) as normalized_name
  from public.flyer_deals
  where (canonical_product_id, canonical_product_name) in ((27, 'Canned Tuna'), (236, 'Canned Salmon'))
    and product_price is not null
), classified as (
  select *,
    stored_category in ('SEAFOOD', 'BEVERAGES', 'DESSERT') as category_in_scope,
    normalized_name ~ '(^|[^[:alnum:]])(rolls?|nigiri|sushi|poke|salads?|sandwiches?|croissants?|baguettes?|bowls?|steaks?|frozen|fresh|raw|cats?|dogs?|pets?|kittens?)([^[:alnum:]]|$)' as excluded_by_name_guard
  from source_rows
)
select
  count(*) filter (where category_in_scope) as candidates_before_name_guard,
  count(*) filter (where category_in_scope and not excluded_by_name_guard) as would_move,
  count(*) filter (
    where category_in_scope and not excluded_by_name_guard
      and product_price > 0 and store_id is not null
  ) as app_eligible,
  count(distinct product_name) filter (
    where category_in_scope and not excluded_by_name_guard
  ) as distinct_exact_product_names,
  count(distinct retailer) filter (
    where category_in_scope and not excluded_by_name_guard
  ) as retailers,
  count(*) filter (where category_in_scope and excluded_by_name_guard) as excluded_by_name_guard,
  count(*) filter (
    where not category_in_scope and stored_category <> 'PANTRY'
  ) as left_alone_other_categories,
  count(*) filter (where stored_category = 'PANTRY') as already_in_pantry
from classified;

-- 1c. Stable real IDs/names for isolated-copy replay; first 100 eligible rows.
with source_rows as (
  select
    id,
    canonical_product_id,
    canonical_product_name,
    product_name,
    upper(btrim(coalesce(category, ''))) as stored_category,
    coalesce(nullif(btrim(retailer_key), ''), nullif(btrim(retailer), ''), '(unknown)') as retailer,
    product_price,
    store_id,
    lower(
      regexp_replace(
        regexp_replace(product_name, 'fresh[[:space:]]+thyme[[:space:]]+market', ' ', 'gi'),
        'bowl[[:space:]]*&[[:space:]]*basket',
        ' ',
        'gi'
      )
    ) as normalized_name
  from public.flyer_deals
  where (canonical_product_id, canonical_product_name) in ((27, 'Canned Tuna'), (236, 'Canned Salmon'))
    and product_price is not null
), classified as (
  select *,
    stored_category in ('SEAFOOD', 'BEVERAGES', 'DESSERT') as category_in_scope,
    normalized_name ~ '(^|[^[:alnum:]])(rolls?|nigiri|sushi|poke|salads?|sandwiches?|croissants?|baguettes?|bowls?|steaks?|frozen|fresh|raw|cats?|dogs?|pets?|kittens?)([^[:alnum:]]|$)' as excluded_by_name_guard
  from source_rows
)
select id, canonical_product_id, canonical_product_name, stored_category,
       product_name, retailer, product_price, store_id
from classified
where category_in_scope and not excluded_by_name_guard
order by id
limit 100;

-- 2. Excluded name-guard examples for reviewer spot-check.
with source_rows as (
  select
    id, canonical_product_id, canonical_product_name, product_name,
    upper(btrim(coalesce(category, ''))) as stored_category,
    coalesce(nullif(btrim(retailer_key), ''), nullif(btrim(retailer), ''), '(unknown)') as retailer,
    product_price,
    store_id,
    lower(
      regexp_replace(
        regexp_replace(product_name, 'fresh[[:space:]]+thyme[[:space:]]+market', ' ', 'gi'),
        'bowl[[:space:]]*&[[:space:]]*basket',
        ' ',
        'gi'
      )
    ) as normalized_name
  from public.flyer_deals
  where (canonical_product_id, canonical_product_name) in ((27, 'Canned Tuna'), (236, 'Canned Salmon'))
    and product_price is not null
    and upper(btrim(coalesce(category, ''))) in ('SEAFOOD', 'BEVERAGES', 'DESSERT')
)
select id, canonical_product_id, canonical_product_name, stored_category,
       product_name, retailer, product_price, store_id
from source_rows
where normalized_name ~ '(^|[^[:alnum:]])(rolls?|nigiri|sushi|poke|salads?|sandwiches?|croissants?|baguettes?|bowls?|steaks?|frozen|fresh|raw|cats?|dogs?|pets?|kittens?)([^[:alnum:]]|$)'
order by id
limit 100;
