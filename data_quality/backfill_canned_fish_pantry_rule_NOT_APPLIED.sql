-- DQ-01 proposed one-retailer canary. NEVER run against production without
-- written review/approval. The script requires explicit psql variables,
-- snapshots before-values, and rejects ranges selecting more than 5,000 rows.
--
-- Example after approval:
-- psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
--   -v canary_min_id=117000000 -v canary_max_id=117010000 \
--   -v canary_retailer_key=wholefoodsv2 \
--   -f backfill_canned_fish_pantry_rule_NOT_APPLIED.sql

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

select set_config('dq01.canary_min_id', :'canary_min_id', true);
select set_config('dq01.canary_max_id', :'canary_max_id', true);
select set_config('dq01.canary_retailer_key', :'canary_retailer_key', true);

do $canary_guard$
declare
  v_min bigint := current_setting('dq01.canary_min_id')::bigint;
  v_max bigint := current_setting('dq01.canary_max_id')::bigint;
  v_retailer text := current_setting('dq01.canary_retailer_key');
  v_rows bigint;
begin
  if v_min > v_max then
    raise exception 'DQ-01 canary rejected: min id exceeds max id';
  end if;
  if btrim(v_retailer) = '' then
    raise exception 'DQ-01 canary rejected: retailer key is empty';
  end if;
  if not exists (
    select 1
    from pg_trigger t
    join pg_class r on r.oid = t.tgrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'flyer_deals'
      and t.tgname = 'zz_enforce_flyer_deals_product_rules'
      and not t.tgisinternal
      and t.tgenabled = 'O'
  ) then
    raise exception 'DQ-01 canary rejected: product-rules trigger is not enabled';
  end if;

  select count(*) into v_rows
  from public.flyer_deals f
  where f.id between v_min and v_max
    and coalesce(nullif(btrim(f.retailer_key), ''), nullif(btrim(f.retailer), '')) = v_retailer
    and public.prox_is_misplaced_canned_fish(
      f.canonical_product_id, f.canonical_product_name, f.product_name, f.category
    );

  if v_rows = 0 or v_rows > 5000 then
    raise exception 'DQ-01 canary rejected: selected candidate row count % must be 1..5000', v_rows;
  end if;
end
$canary_guard$;

create table if not exists public.dq01_canned_fish_category_snapshot (
  id bigint primary key,
  product_name text,
  canonical_product_id bigint,
  canonical_product_name text,
  retailer_key text,
  category text,
  category_source text,
  category_confidence numeric,
  category_flag boolean,
  category_conflicts boolean,
  captured_at timestamptz not null default now()
);

insert into public.dq01_canned_fish_category_snapshot (
  id, product_name, canonical_product_id, canonical_product_name,
  retailer_key, category, category_source, category_confidence,
  category_flag, category_conflicts
)
select f.id, f.product_name, f.canonical_product_id, f.canonical_product_name,
       coalesce(nullif(btrim(f.retailer_key), ''), nullif(btrim(f.retailer), '')),
       f.category, f.category_source, f.category_confidence,
       f.category_flag, f.category_conflicts
from public.flyer_deals f
where f.id between current_setting('dq01.canary_min_id')::bigint
               and current_setting('dq01.canary_max_id')::bigint
  and coalesce(nullif(btrim(f.retailer_key), ''), nullif(btrim(f.retailer), ''))
      = current_setting('dq01.canary_retailer_key')
  and public.prox_is_misplaced_canned_fish(
    f.canonical_product_id, f.canonical_product_name, f.product_name, f.category
  )
on conflict (id) do nothing;

with changed as (
  update public.flyer_deals f
  set category = f.category
  where f.id between current_setting('dq01.canary_min_id')::bigint
                 and current_setting('dq01.canary_max_id')::bigint
    and coalesce(nullif(btrim(f.retailer_key), ''), nullif(btrim(f.retailer), ''))
        = current_setting('dq01.canary_retailer_key')
    and public.prox_is_misplaced_canned_fish(
      f.canonical_product_id, f.canonical_product_name, f.product_name, f.category
    )
  returning f.id
)
select count(*) as trigger_corrected_rows from changed;

commit;
