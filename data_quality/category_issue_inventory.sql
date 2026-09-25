-- Read-only category/canonical inventory.
-- Keep the agreed cutoff in one place. Counts are reported separately for
-- recently processed rows and rows currently eligible for app surfaces.
-- No statement below mutates production data.
with params as (
  select date '2026-08-25' as cutoff_date
), base as (
  select
    id,
    coalesce(nullif(lower(trim(retailer_key)), ''),
             nullif(lower(trim(retailer)), ''), 'unknown') as retailer,
    product_name,
    canonical_product_name,
    category,
    product_price,
    store_id,
    processed_at,
    lower(concat_ws(' ', product_name, canonical_product_name)) as product_text
  from public.flyer_deals
), eligible as (
  select *,
    (product_price > 0 and store_id is not null) as deals_eligible,
    (nullif(trim(canonical_product_name), '') is not null
      and product_price > 0 and store_id is not null) as search_and_deals_eligible
  from base
), patterns as (
  select *,
    case
      when product_text ~ '\m(canned|tinned|in water|in oil|cans?)\M'
        and product_text ~ '\m(chicken|fish|salmon|tuna|sardines?|anchovies?)\M'
        and product_text !~ '\m(cat food|kitten food|dog food|pet food)\M'
        and upper(coalesce(category, '')) <> 'PANTRY'
        then 'canned chicken/fish not in PANTRY'
      when product_text ~ '\m(chicken (breast|thigh|leg|wing)|whole chicken|drumsticks?)\M'
        and product_text !~ '\m(canned|tinned|in water|in oil|cans?)\M'
        and product_text !~ '\m(rotisserie|deli|cooked|grilled|breaded|nuggets?|tenders?|tenderloins?|patties?|skewers?|burgers?|meal|prepared|ready[- ]to[- ]eat|cat food|dog food|pet food)\M'
        and upper(coalesce(category, '')) <> 'MEAT'
        then 'raw chicken not in MEAT'
      when product_text ~ '\m(fillet|salmon|cod|tilapia|trout|halibut|catfish|fresh fish)\M'
        and product_text ~ '\m(raw|fresh|wild[- ]caught|farm[- ]raised|portion|portions)\M'
        and product_text !~ '\m(canned|tinned|in water|in oil|cans?)\M'
        and product_text !~ '\m(smoked|prepared|ready[- ]to[- ]eat|cat food|dog food|baby food|pet food)\M'
        and upper(coalesce(category, '')) <> 'SEAFOOD'
        then 'raw fish not in SEAFOOD'
      when product_text ~ '\m(parmesan[- ]crusted\s+(chicken|fish|salmon)|spinach[- ]and[- ]cheese\s+tortellini|(?:chicken|beef|fish)\s+(enchiladas?|casserole|lasagna|lasagne)|(?:deli|hot|rotisserie)\s+(meal|dish|chicken|pasta))\M'
        and product_text !~ '\mfrozen\M'
        and upper(coalesce(category, '')) in ('PRODUCE', 'DAIRY', 'EGGS', 'MEAT', 'SEAFOOD')
        then 'prepared dish in raw/ingredient department'
      when product_text ~ '\m(fruit bar|granola bar|protein bar|mushroom chocolate|chocolate bar)\M'
        and upper(coalesce(category, '')) = 'PRODUCE'
        then 'packaged snack or baby food in PRODUCE'
      when product_text ~ '\m(baby food|infant food)\M'
        and upper(coalesce(category, '')) = 'PRODUCE'
        then 'baby food in PRODUCE'
      else null
    end as issue
  from eligible
), ranked as (
  select *
  from patterns
  where issue is not null
)
select
  issue,
  retailer,
  count(*) as affected_row_count,
  count(distinct coalesce(nullif(trim(canonical_product_name), ''), product_name))
    as affected_distinct_products,
  count(*) filter (where processed_at >= (select cutoff_date from params))
    as recently_processed_row_count,
  count(*) filter (where deals_eligible) as currently_deals_eligible_count,
  count(*) filter (where search_and_deals_eligible)
    as currently_search_and_deals_eligible_count,
  min(processed_at) as oldest_affected_processed_at,
  max(processed_at) as newest_affected_processed_at
from ranked
group by issue, retailer
order by affected_row_count desc, issue, retailer;

-- Canonical identity collisions: form variants must not share one identity.
select
  lower(trim(canonical_product_name)) as canonical_product_name,
  count(*) as affected_row_count,
  count(distinct case
    when lower(product_name) ~ '\\m(can|canned|tin|tinned|pouch|pouched)\\M'
      then 'packaged'
    else 'fresh_or_other'
  end) as form_count,
  array_agg(distinct product_name order by product_name) as examples
from public.flyer_deals
where canonical_product_name is not null
group by lower(trim(canonical_product_name))
having count(distinct case
  when lower(product_name) ~ '\\m(can|canned|tin|tinned|pouch|pouched)\\M'
    then 'packaged'
  else 'fresh_or_other'
end) > 1
order by affected_row_count desc;
