-- Disposable fixture dependencies for the saved v27 finalizer definition.
-- The range-upsert helper is a deterministic local stub; classification is
-- not run by this fixture.
\set ON_ERROR_STOP on

create table public.source_products_v2 (
  id bigint primary key,
  canonical_product_id bigint,
  mapping_status text,
  mapping_confidence numeric,
  taxonomy_version text,
  classification_version text,
  source_category_conflict boolean,
  mapping_source text
);

create table public.canonical_offer_shadow_v2 (
  flyer_deal_id bigint primary key,
  source_product_id bigint not null,
  deal_created_at timestamptz not null,
  canonical_product_id_at_link bigint,
  mapping_status_at_link text,
  mapping_confidence_at_link numeric,
  taxonomy_version_at_link text,
  classification_version_at_link text,
  source_category_conflict_at_link boolean,
  link_method text,
  refreshed_at timestamptz
);

create table public.canonical_source_search_shadow_v27 (
  source_product_id bigint primary key,
  mapping_status text,
  canonical_product_id bigint,
  mapping_source text
);

create table public.canonical_offer_search_projection_v27 (
  flyer_deal_id bigint primary key,
  source_product_id bigint,
  canonical_product_id bigint,
  zip_code text,
  retailer_key text,
  deal_created_at timestamptz,
  mapping_source text,
  projected_at timestamptz,
  normalized_product_name text,
  product_price numeric
);

create table public.match_key_aliases_v2 (
  old_match_key text not null,
  new_match_key text not null,
  canonical_product_id bigint,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  evidence_rows bigint,
  unique (old_match_key, new_match_key)
);

create or replace function public.v2_upsert_source_search_shadow_v27_range(
  p_min_source_product_id bigint,
  p_max_source_product_id bigint,
  p_reason text
)
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  v_rows integer;
begin
  insert into public.canonical_source_search_shadow_v27 (
    source_product_id, mapping_status, canonical_product_id, mapping_source
  )
  select sp.id, sp.mapping_status, sp.canonical_product_id,
         coalesce(sp.mapping_source, p_reason)
  from public.source_products_v2 sp
  where sp.id between p_min_source_product_id and p_max_source_product_id
  on conflict (source_product_id) do update set
    mapping_status=excluded.mapping_status,
    canonical_product_id=excluded.canonical_product_id,
    mapping_source=excluded.mapping_source;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$;

create or replace function public.v2_norm(p_value text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select lower(regexp_replace(btrim(coalesce(p_value, '')), '[[:space:]]+', ' ', 'g'))
$function$;

create or replace function public.build_match_key_v3(
  p_brand text,
  p_canonical_name text,
  p_product_name text,
  p_base_amount numeric,
  p_base_unit text,
  p_product_size text
)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select concat_ws('|',
    public.v2_norm(p_brand),
    public.v2_norm(p_canonical_name),
    public.v2_norm(p_product_name),
    coalesce(p_base_amount::text, ''),
    public.v2_norm(p_base_unit),
    public.v2_norm(p_product_size)
  )
$function$;

-- Exact function body retrieved from data_quality/v27_finalize.txt.
create or replace function public.v27_finalize_source_product_incremental(
  p_source_product_id bigint
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sp record;
  v_shadow integer:=0;
  v_projection integer:=0;
  v_deleted integer:=0;
  v_aliases integer:=0;
  v_updated integer:=0;
begin
  select * into v_sp from public.source_products_v2 where id=p_source_product_id;
  if not found then
    return jsonb_build_object('status','missing_source_product','source_product_id',p_source_product_id);
  end if;

  v_shadow := public.v2_upsert_source_search_shadow_v27_range(p_source_product_id,p_source_product_id,'v27_incremental_queue');

  update public.canonical_offer_shadow_v2 o
  set canonical_product_id_at_link=v_sp.canonical_product_id,
      mapping_status_at_link=coalesce(v_sp.mapping_status,'unmapped'),
      mapping_confidence_at_link=v_sp.mapping_confidence,
      taxonomy_version_at_link=v_sp.taxonomy_version,
      classification_version_at_link=v_sp.classification_version,
      source_category_conflict_at_link=coalesce(v_sp.source_category_conflict,false),
      link_method='v27_incremental_queue',
      refreshed_at=now()
  where o.source_product_id=p_source_product_id
    and o.deal_created_at>=now()-interval '10 days';

  delete from public.canonical_offer_search_projection_v27 p
  where p.source_product_id=p_source_product_id
    and not exists (
      select 1 from public.canonical_source_search_shadow_v27 sh
      where sh.source_product_id=p_source_product_id
        and sh.mapping_status='mapped'
        and sh.canonical_product_id is not null
    );
  get diagnostics v_deleted=row_count;

  insert into public.canonical_offer_search_projection_v27(
    flyer_deal_id,source_product_id,canonical_product_id,zip_code,retailer_key,
    deal_created_at,mapping_source,projected_at,normalized_product_name,product_price
  )
  select o.flyer_deal_id,o.source_product_id,sh.canonical_product_id,f.zip_code,f.retailer_key,
         f.created_at,sh.mapping_source,now(),public.v2_norm(f.product_name),f.product_price
  from public.canonical_offer_shadow_v2 o
  join public.canonical_source_search_shadow_v27 sh on sh.source_product_id=o.source_product_id
  join public.flyer_deals f on f.id=o.flyer_deal_id
  where o.source_product_id=p_source_product_id
    and o.deal_created_at>=now()-interval '10 days'
    and sh.mapping_status='mapped'
    and sh.canonical_product_id is not null
    and coalesce(btrim(f.zip_code),'')<>''
    and coalesce(btrim(f.retailer_key),'')<>''
  on conflict(flyer_deal_id) do update set
    source_product_id=excluded.source_product_id,
    canonical_product_id=excluded.canonical_product_id,
    zip_code=excluded.zip_code,
    retailer_key=excluded.retailer_key,
    deal_created_at=excluded.deal_created_at,
    mapping_source=excluded.mapping_source,
    projected_at=excluded.projected_at,
    normalized_product_name=excluded.normalized_product_name,
    product_price=excluded.product_price;
  get diagnostics v_projection=row_count;

  if v_sp.mapping_status='mapped' and v_sp.canonical_product_id is not null then
    with candidates as materialized (
      select fd.id,fd.match_key old_match_key,p.canonical_product_id,cp.canonical_name,
             public.build_match_key_v3(fd.brand,cp.canonical_name,fd.product_name,fd.base_amount,fd.base_unit,fd.product_size) new_match_key
      from public.canonical_offer_search_projection_v27 p
      join public.flyer_deals fd on fd.id=p.flyer_deal_id
      join public.canonical_products_v2 cp on cp.id=p.canonical_product_id
      where p.source_product_id=p_source_product_id
        and p.deal_created_at>=now()-interval '10 days'
    ), grouped as (
      select old_match_key,new_match_key,canonical_product_id,count(*)::bigint evidence_rows
      from candidates
      where old_match_key is not null and new_match_key is not null and old_match_key<>new_match_key
      group by old_match_key,new_match_key,canonical_product_id
    )
    insert into public.match_key_aliases_v2(
      old_match_key,new_match_key,canonical_product_id,first_seen_at,last_seen_at,evidence_rows
    )
    select old_match_key,new_match_key,canonical_product_id,now(),now(),evidence_rows
    from grouped
    on conflict(old_match_key,new_match_key) do update set
      canonical_product_id=coalesce(excluded.canonical_product_id,public.match_key_aliases_v2.canonical_product_id),
      last_seen_at=now(),
      evidence_rows=greatest(public.match_key_aliases_v2.evidence_rows,excluded.evidence_rows);
    get diagnostics v_aliases=row_count;

    perform set_config('app.bulk_match_key_migration','on',true);

    update public.flyer_deals fd
    set canonical_product_id=p.canonical_product_id,
        source_product_id=p.source_product_id,
        canonical_product_name=cp.canonical_name,
        match_key=public.build_match_key_v3(fd.brand,cp.canonical_name,fd.product_name,fd.base_amount,fd.base_unit,fd.product_size),
        match_key_version=3
    from public.canonical_offer_search_projection_v27 p
    join public.canonical_products_v2 cp on cp.id=p.canonical_product_id
    where fd.id=p.flyer_deal_id
      and p.source_product_id=p_source_product_id
      and p.deal_created_at>=now()-interval '10 days'
      and (
        fd.canonical_product_id is distinct from p.canonical_product_id
        or fd.source_product_id is distinct from p.source_product_id
        or fd.canonical_product_name is distinct from cp.canonical_name
        or fd.match_key_version<>3
        or fd.match_key is distinct from public.build_match_key_v3(fd.brand,cp.canonical_name,fd.product_name,fd.base_amount,fd.base_unit,fd.product_size)
      );
    get diagnostics v_updated=row_count;
  end if;

  return jsonb_build_object(
    'status','finalized','source_product_id',p_source_product_id,
    'source_shadow_upserts',v_shadow,'projection_upserts',v_projection,
    'projection_deleted',v_deleted,'aliases',v_aliases,'identity_updated',v_updated
  );
end;
$function$;

insert into public.source_products_v2 (
  id, canonical_product_id, mapping_status, mapping_confidence,
  taxonomy_version, classification_version, source_category_conflict, mapping_source
) values
  (9001, 27, 'mapped', 0.99, 'v2.7', 'fixture', false, 'fixture'),
  (9002, 27, 'mapped', 0.99, 'v2.7', 'fixture', false, 'fixture');

insert into public.canonical_offer_shadow_v2 (flyer_deal_id, source_product_id, deal_created_at)
values
  (117483543, 9001, now()),
  (120247137, 9002, now());

update public.flyer_deals
set source_product_id = case id
      when 117483543 then 9001
      when 120247137 then 9002
    end,
    match_key_version = 2
where id in (117483543, 120247137);
