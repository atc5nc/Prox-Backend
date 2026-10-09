-- Local fixture schema only. Never run against a shared or production database.
\set ON_ERROR_STOP on

create table public.canonical_products_v2 (
  id bigint primary key,
  canonical_name text not null,
  category text,
  is_active boolean not null default true
);

insert into public.canonical_products_v2 (id, canonical_name, category) values
  (27, 'Canned Tuna', 'PANTRY'),
  (31, 'Chicken Breast', 'MEAT'),
  (102, 'Salmon', 'SEAFOOD'),
  (236, 'Canned Salmon', 'PANTRY'),
  (345, 'Canned Chicken', 'PANTRY');

create table public.flyer_deals (
  id bigint primary key,
  product_name text,
  brand text,
  canonical_product_id bigint,
  canonical_product_name text,
  category text,
  category_source text,
  category_confidence numeric,
  category_flag boolean,
  category_conflicts boolean,
  match_key text,
  product_price numeric,
  store_id bigint,
  retailer text,
  retailer_key text,
  processed_at timestamptz not null default '2026-09-01 00:00:00+00'
);

create or replace function public.prox_forced_pet_valley_category(
  p_product_name text,
  p_brand text
)
returns text language sql immutable set search_path to 'public'
as $function$
  select case
    when lower(btrim(coalesce(p_brand,'')))='valley fresh' then 'PANTRY'
    when lower(btrim(coalesce(p_brand,'')))='pedigree' then 'PET'
    when coalesce(p_product_name,'') ~* '(^|[^[:alnum:]])for[[:space:]]+(dogs|cats|animals|pets)([^[:alnum:]]|$)' then 'PET'
    else null
  end
$function$;

create or replace function public.prox_forced_pet_valley_canonical(
  p_product_name text,
  p_brand text
)
returns text language sql immutable set search_path to 'public'
as $function$
  select case
    when lower(btrim(coalesce(p_brand,'')))='valley fresh' then 'Canned Chicken'
    when lower(btrim(coalesce(p_brand,'')))='pedigree' then 'Dog Food'
    when coalesce(p_product_name,'') ~* '(^|[^[:alnum:]])for[[:space:]]+cats([^[:alnum:]]|$)' then 'Cat Food'
    when coalesce(p_product_name,'') ~* '(^|[^[:alnum:]])for[[:space:]]+dogs([^[:alnum:]]|$)' then 'Dog Food'
    else null
  end
$function$;

create or replace function public.prox_is_canned_chicken(
  p_product_name text,
  p_brand text
)
returns boolean language sql immutable set search_path to 'public'
as $function$
  select lower(coalesce(p_product_name,'')) ~* 'canned[[:space:]]+chicken[[:space:]]+breast'
$function$;

-- Existing helper body copied from the read-only function definition.
create or replace function public.enforce_flyer_deals_product_rules()
returns trigger language plpgsql set search_path to 'public'
as $function$
declare
  v_forced_category text;
  v_forced_canonical text;
  v_cp_id bigint;
  v_existing_cp_category text;
  v_canned_chicken boolean;
begin
  if lower(trim(coalesce(new.brand,'')))='feastables' then
    new.brand:='Feastables';
    new.category:='SNACKS';
  end if;
  if coalesce(new.product_name,'') ~* 'good[[:space:]]*(&|&amp;|and)[[:space:]]*gather' then
    new.brand:='Good & Gather';
  end if;
  v_forced_category := public.prox_forced_pet_valley_category(new.product_name,new.brand);
  v_forced_canonical := public.prox_forced_pet_valley_canonical(new.product_name,new.brand);
  v_canned_chicken := public.prox_is_canned_chicken(new.product_name,new.brand);
  if v_forced_category is not null then
    new.category := v_forced_category;
    new.category_source := 'manual_correction';
    new.category_confidence := 1.0;
    new.category_flag := true;
    new.category_conflicts := false;
  elsif v_canned_chicken then
    new.category := 'PANTRY';
    new.category_source := 'manual_correction';
    new.category_confidence := 1.0;
    new.category_flag := true;
    new.category_conflicts := false;
    v_forced_canonical := 'Canned Chicken';
  end if;
  if v_forced_canonical is not null then
    select cp.id into v_cp_id
    from public.canonical_products_v2 cp
    where cp.canonical_name=v_forced_canonical and cp.is_active=true
    order by cp.id limit 1;
    if v_cp_id is not null then
      new.canonical_product_id := v_cp_id;
      new.canonical_product_name := v_forced_canonical;
    end if;
  elsif v_forced_category='PET' and new.canonical_product_id is not null then
    select cp.category into v_existing_cp_category
    from public.canonical_products_v2 cp where cp.id=new.canonical_product_id;
    if coalesce(v_existing_cp_category,'') <> 'PET' then
      new.canonical_product_id := null;
      new.canonical_product_name := null;
    end if;
  end if;
  return new;
end;
$function$;

create trigger zz_enforce_flyer_deals_product_rules
before insert or update on public.flyer_deals
for each row execute function public.enforce_flyer_deals_product_rules();

insert into public.flyer_deals (
  id, product_name, brand, canonical_product_id, canonical_product_name,
  category, category_source, category_confidence, category_flag,
  category_conflicts, match_key, product_price, store_id, retailer, retailer_key
) values
  (117483543, 'StarKist Tuna, Chunk Light', 'StarKist', 27, 'Canned Tuna',
   'SEAFOOD', 'ai', 0.78, false, true, 'match-tuna-1', 1.99, 1, 'Whole Foods', 'wholefoodsv2'),
  (114271165, 'Chicken Of The Sea Wild Caught Alaskan Pink Salmon Pouch', 'Chicken of the Sea', 236, 'Canned Salmon',
   'SEAFOOD', 'ai', 0.80, false, true, 'match-salmon-1', 2.99, 1, 'Whole Foods', 'wholefoodsv2'),
  (115826255, 'Yellowfin Tuna Fillets in Spring Water', 'Brand', 27, 'Canned Tuna',
   'BEVERAGES', 'ai', 0.75, false, true, 'match-tuna-2', 3.99, 1, 'Whole Foods', 'wholefoodsv2'),
  (115826273, 'Yellowfin Tuna in Truffle Infused Olive Oil', 'Brand', 27, 'Canned Tuna',
   'DESSERT', 'ai', 0.75, false, true, 'match-tuna-3', 5.99, 1, 'Whole Foods', 'wholefoodsv2'),
  (120247137, 'Zenshi Private Selection Rainbow Roll - Salmon Tuna', 'Brand', 27, 'Canned Tuna',
   'SEAFOOD', 'ai', 0.75, false, true, 'match-sushi', 8.99, 1, 'Whole Foods', 'wholefoodsv2'),
  (114206707, 'Fancy Feast Tuna Cat Food', 'Fancy Feast', 27, 'Canned Tuna',
   'SEAFOOD', 'ai', 0.75, false, true, 'match-catfood', 1.29, 1, 'Whole Foods', 'wholefoodsv2'),
  (114226422, 'Swanson Canned Chicken Breast In Water', 'Swanson', 345, 'Canned Chicken',
   'PANTRY', 'manual_correction', 1, true, false, 'match-chicken', 2.99, 1, 'Whole Foods', 'wholefoodsv2'),
  (114266783, 'Kroger Farm Raised Atlantic Salmon with Spinach and Feta', 'Kroger', 102, 'Salmon',
   'PANTRY', 'ai', 0.7, false, true, 'match-raw-salmon', 9.99, 1, 'Kroger', 'kroger');

update public.flyer_deals
set processed_at = '2026-08-24 23:59:59+00'
where id = 115826255;

update public.flyer_deals
set processed_at = '2026-08-25 00:00:00+00'
where id = 117483543;

create temporary table dq01_before as
select id, category, category_source, category_confidence, category_flag,
       category_conflicts, canonical_product_id, canonical_product_name, match_key
from public.flyer_deals;
