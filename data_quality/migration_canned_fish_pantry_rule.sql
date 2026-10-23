-- DQ-01 draft migration. REVIEW ONLY: do not apply to production.
-- Category-only correction for approved Canned Tuna / Canned Salmon identities.
-- Does not change canonical identity, canonical_product_id, or match_key.

begin;

do $preflight$
begin
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
      and (t.tgtype & 1) = 1
      and (t.tgtype & 2) = 2
      and (t.tgtype & 4) = 4
      and (t.tgtype & 16) = 16
      and position(
        'prox_is_canned_chicken' in pg_get_functiondef(t.tgfoid)
      ) > 0
  ) then
    raise exception 'DQ-01 precondition failed: expected enabled BEFORE INSERT OR UPDATE trigger zz_enforce_flyer_deals_product_rules on public.flyer_deals using the reviewed product-rules function';
  end if;

  if not exists (
    select 1 from public.canonical_products_v2
    where id = 27 and canonical_name = 'Canned Tuna' and is_active
  ) or not exists (
    select 1 from public.canonical_products_v2
    where id = 236 and canonical_name = 'Canned Salmon' and is_active
  ) then
    raise exception 'DQ-01 precondition failed: approved active canonical identities do not match ids 27 and 236';
  end if;
end
$preflight$;

create or replace function public.prox_is_misplaced_canned_fish(
  p_canonical_product_id bigint,
  p_canonical_product_name text,
  p_product_name text,
  p_category text
)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select
    (
      (p_canonical_product_id = 27 and btrim(coalesce(p_canonical_product_name, '')) = 'Canned Tuna')
      or (p_canonical_product_id = 236 and btrim(coalesce(p_canonical_product_name, '')) = 'Canned Salmon')
    )
    and p_product_name is not null
    and upper(btrim(coalesce(p_category, ''))) in ('SEAFOOD', 'BEVERAGES', 'DESSERT')
    and lower(
      regexp_replace(
        regexp_replace(
          p_product_name,
          'fresh[[:space:]]+thyme[[:space:]]+market',
          ' ',
          'gi'
        ),
        'bowl[[:space:]]*&[[:space:]]*basket',
        ' ',
        'gi'
      )
    ) !~ '(^|[^[:alnum:]])(rolls?|nigiri|sushi|poke|salads?|sandwiches?|croissants?|baguettes?|bowls?|steaks?|frozen|fresh|raw|cats?|dogs?|pets?|kittens?)([^[:alnum:]]|$)';
$function$;

create or replace function public.enforce_flyer_deals_product_rules()
returns trigger
language plpgsql
set search_path to 'public'
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

  -- Pet / Valley Fresh hard rules take highest precedence.
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
  elsif public.prox_is_misplaced_canned_fish(
    new.canonical_product_id,
    new.canonical_product_name,
    new.product_name,
    new.category
  ) then
    new.category := 'PANTRY';
    new.category_source := 'manual_correction';
    new.category_confidence := 1.0;
    new.category_flag := true;
    new.category_conflicts := false;
  end if;

  if v_forced_canonical is not null then
    select cp.id into v_cp_id
    from public.canonical_products_v2 cp
    where cp.canonical_name=v_forced_canonical
      and cp.is_active=true
    order by cp.id
    limit 1;

    if v_cp_id is not null then
      new.canonical_product_id := v_cp_id;
      new.canonical_product_name := v_forced_canonical;
    end if;
  elsif v_forced_category='PET' and new.canonical_product_id is not null then
    select cp.category into v_existing_cp_category
    from public.canonical_products_v2 cp
    where cp.id=new.canonical_product_id;

    if coalesce(v_existing_cp_category,'') <> 'PET' then
      new.canonical_product_id := null;
      new.canonical_product_name := null;
    end if;
  end if;

  return new;
end;
$function$;

commit;
