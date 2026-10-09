-- Run only against the disposable local replica created for this test.
\set ON_ERROR_STOP on

\ir migration_canned_fish_pantry_rule.sql
\ir guard_review_fixture.sql

do $cutoff_assertions$
begin
  if not (
    select processed_at >= timestamptz '2026-08-25 00:00:00+00'
    from public.flyer_deals where id = 117483543
  ) then
    raise exception 'August 25 UTC midnight must be included in the recent cohort';
  end if;
  if (
    select processed_at >= timestamptz '2026-08-25 00:00:00+00'
    from public.flyer_deals where id = 115826255
  ) then
    raise exception 'a timestamp before August 25 UTC midnight must be excluded from the recent cohort';
  end if;
  if (
    select count(*)
    from public.flyer_deals f
    where f.id in (117483543, 114271165, 115826255, 115826273)
      and f.processed_at >= timestamptz '2026-08-25 00:00:00+00'
      and public.prox_is_misplaced_canned_fish(
        f.canonical_product_id, f.canonical_product_name, f.product_name, f.category
      )
  ) <> 3 then
    raise exception 'recent cutoff sample count should be 3 of the four fixture candidates';
  end if;
end
$cutoff_assertions$;

-- Bounded canary variables are only for the disposable local fixture.
\set canary_min_id 114000000
\set canary_max_id 118000000
\set canary_retailer_key wholefoodsv2

select id, category
from public.flyer_deals
where public.prox_is_misplaced_canned_fish(canonical_product_id, canonical_product_name, product_name, category)
order by id;

\ir backfill_canned_fish_pantry_rule_NOT_APPLIED.sql

do $assertions$
declare
  r record;
  expected_category text;
begin
  for r in select * from dq01_before loop
    select category into expected_category
    from public.flyer_deals where id = r.id;
    if r.id in (117483543, 114271165, 115826255, 115826273) then
      if expected_category <> 'PANTRY' then
        raise exception 'expected real example % to be PANTRY, got %', r.id, expected_category;
      end if;
      if not exists (
        select 1 from public.flyer_deals f
        where f.id = r.id
          and f.category_source = 'manual_correction'
          and f.category_confidence = 1.0
          and f.category_flag is true
          and f.category_conflicts is false
      ) then
        raise exception 'category metadata did not reflect the DQ-01 correction for id %', r.id;
      end if;
    elsif expected_category is distinct from r.category then
      raise exception 'excluded or out-of-scope id % changed category from % to %', r.id, r.category, expected_category;
    end if;

    if exists (
      select 1 from public.flyer_deals f
      where f.id = r.id
        and (f.canonical_product_id, f.canonical_product_name, f.match_key)
            is distinct from
            (r.canonical_product_id, r.canonical_product_name, r.match_key)
    ) then
      raise exception 'identity or match key changed for id %', r.id;
    end if;
  end loop;

  if not public.prox_is_misplaced_canned_fish(27, 'Canned Tuna', 'Fresh Thyme Market Chunk Light Tuna', 'SEAFOOD') then
    raise exception 'store-brand neutralization failed for Fresh Thyme Market';
  end if;
  if not public.prox_is_misplaced_canned_fish(27, 'Canned Tuna', 'Bowl & Basket Solid White Albacore Tuna in Water', 'SEAFOOD') then
    raise exception 'store-brand neutralization failed for Bowl & Basket';
  end if;
  if public.prox_is_misplaced_canned_fish(27, 'Canned Tuna', 'Fresh Yellowfin Tuna Steak', 'SEAFOOD') then
    raise exception 'raw/fresh tuna steak must be excluded';
  end if;
  if public.prox_is_misplaced_canned_fish(27, 'Canned Tuna', 'Spicy Tuna Roll', 'SEAFOOD') then
    raise exception 'sushi roll must be excluded';
  end if;
  if public.prox_is_misplaced_canned_fish(27, 'Canned Tuna', 'Fancy Feast Tuna Cat Food', 'SEAFOOD') then
    raise exception 'pet food must be excluded';
  end if;
  if public.prox_is_misplaced_canned_fish(27, 'Canned Tuna', 'StarKist Tuna, Chunk Light', 'PANTRY') then
    raise exception 'already-correct Pantry row must be left alone';
  end if;
  if public.prox_is_misplaced_canned_fish(27, 'Tuna', 'Fresh Ahi Tuna Steak', 'SEAFOOD') then
    raise exception 'raw Tuna identity must not be changed';
  end if;
  if public.prox_is_misplaced_canned_fish(27, 'Canned Tuna', null, 'SEAFOOD') then
    raise exception 'null product name must be excluded';
  end if;
  if public.prox_is_misplaced_canned_fish(999, 'Canned Tuna', 'Chunk Light Tuna', 'SEAFOOD')
     or public.prox_is_misplaced_canned_fish(27, 'Canned Salmon', 'Pink Salmon', 'SEAFOOD')
     or public.prox_is_misplaced_canned_fish(null, 'Canned Tuna', 'Chunk Light Tuna', 'SEAFOOD') then
    raise exception 'mismatched or missing canonical id/name pair must be excluded';
  end if;
end
$assertions$;

-- Simulate a later writer reasserting a wrong category: the trigger corrects it.
update public.flyer_deals set category = 'SEAFOOD' where id = 117483543;
do $worker_assert$
begin
  if (select category from public.flyer_deals where id = 117483543) <> 'PANTRY' then
    raise exception 'trigger did not reassert PANTRY after category writer update';
  end if;
end
$worker_assert$;

-- Roll back the rule first, then restore a captured category, matching the
-- documented order. This is still an isolated local fixture database.
\ir rollback_canned_fish_pantry_rule.sql
\ir rollback_canned_fish_pantry_data_NOT_APPLIED.sql
do $rollback_assert$
begin
  if (select category from public.flyer_deals where id = 117483543) <> 'SEAFOOD' then
    raise exception 'rollback did not restore the captured category';
  end if;
end
$rollback_assert$;

\echo 'DQ-01 local replica fixture assertions passed.'
