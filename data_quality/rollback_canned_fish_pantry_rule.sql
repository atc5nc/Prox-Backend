-- DQ-01 draft rollback. REVIEW ONLY: do not apply to production.
-- Restore the captured pre-DQ-01 trigger function before restoring row values.

begin;

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

drop function if exists public.prox_is_misplaced_canned_fish(bigint, text, text, text);

commit;
