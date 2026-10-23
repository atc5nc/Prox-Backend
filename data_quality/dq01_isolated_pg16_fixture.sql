-- DQ-01: isolated, local PostgreSQL 16, six-case test fixture
-- NEVER RUN AGAINST PRODUCTION OR SHARED SUPABASE.
-- Run on an EMPTY disposable database with: psql -X -v ON_ERROR_STOP=1 -f data_quality/dq01_isolated_pg16_fixture.sql
-- Scope: focused 8-table schema covering PR #17 tests, not a full production-schema clone.
-- Simplified upstream v2.7 helpers are inherited from PR #17's existing test fixture.
-- Queue enqueue and mapped finalizer control flow reflect production as inspected 2026-10-19.
\set ON_ERROR_STOP on
begin;
create schema if not exists private;
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
  source_product_id bigint,
  match_key_version integer,
  zip_code text,
  created_at timestamptz not null default now(),
  base_amount numeric,
  base_unit text,
  product_size text,
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
before insert or update of brand, product_name, category, canonical_product_id,
  canonical_product_name on public.flyer_deals
for each row execute function public.enforce_flyer_deals_product_rules();


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



create schema if not exists private;
create table private.v27_mapping_propagation_queue (
 source_product_id bigint primary key references public.source_products_v2(id),
 target_canonical_product_id bigint references public.canonical_products_v2(id),
 status text not null default 'pending' check(status in ('pending','processing','completed','failed')),
 last_flyer_deal_id bigint not null default 0,
 worker text, attempts integer not null default 0 check(attempts>=0),
 last_error text, queued_at timestamptz not null default now(),
 started_at timestamptz,completed_at timestamptz,updated_at timestamptz not null default now()
);
create index v27_mapping_propagation_queue_pending_idx on private.v27_mapping_propagation_queue(status,queued_at)
where status='pending';
create or replace function private.v27_enqueue_mapping_propagation(p_source_product_id bigint,p_canonical_product_id bigint)
returns void language sql security definer set search_path to 'public','private','pg_temp'
as $function$
 insert into private.v27_mapping_propagation_queue(
 source_product_id,target_canonical_product_id,status,last_flyer_deal_id,
 attempts,last_error,queued_at,updated_at,completed_at)
 values(p_source_product_id,p_canonical_product_id,'pending',0,0,null,now(),now(),null)
 on conflict(source_product_id) do update set
 target_canonical_product_id=excluded.target_canonical_product_id,
 status='pending',
 last_flyer_deal_id=case when private.v27_mapping_propagation_queue.target_canonical_product_id is distinct from excluded.target_canonical_product_id then 0 else private.v27_mapping_propagation_queue.last_flyer_deal_id end,
 last_error=null,updated_at=now(),completed_at=null;
$function$;

create or replace function public.v27_finalize_source_product_incremental(p_source_product_id bigint)
returns jsonb language plpgsql set search_path to 'public','private','pg_temp'
as $function$
declare v_sp record; v_shadow integer:=0; v_deleted integer:=0;
begin
 select * into v_sp from public.source_products_v2 where id=p_source_product_id;
 if not found then return jsonb_build_object('status','missing_source_product','source_product_id',p_source_product_id); end if;
 v_shadow := public.v2_upsert_source_search_shadow_v27_range(p_source_product_id,p_source_product_id,'v27_incremental_queue');
 if v_sp.mapping_status='mapped' and v_sp.canonical_product_id is not null then
   perform private.v27_enqueue_mapping_propagation(p_source_product_id,v_sp.canonical_product_id);
   return jsonb_build_object('status','queued_for_chunked_propagation','source_product_id',p_source_product_id,'source_shadow_upserts',v_shadow,'canonical_product_id',v_sp.canonical_product_id);
 end if;
 update public.canonical_offer_shadow_v2 o
 set canonical_product_id_at_link=v_sp.canonical_product_id,
     mapping_status_at_link=coalesce(v_sp.mapping_status,'unmapped'),
     mapping_confidence_at_link=v_sp.mapping_confidence,
     taxonomy_version_at_link=v_sp.taxonomy_version,
     classification_version_at_link=v_sp.classification_version,
     source_category_conflict_at_link=coalesce(v_sp.source_category_conflict,false),
     link_method='v27_incremental_queue',refreshed_at=now()
 where o.source_product_id=p_source_product_id and o.deal_created_at>=now()-interval '10 days';
 delete from public.canonical_offer_search_projection_v27 p
 where p.source_product_id=p_source_product_id
 and not exists (select 1 from public.canonical_source_search_shadow_v27 sh
    where sh.source_product_id=p_source_product_id and sh.mapping_status='mapped'
    and sh.canonical_product_id is not null);
 get diagnostics v_deleted=row_count;
 return jsonb_build_object('status','finalized_nonmapped','source_product_id',p_source_product_id,
 'source_shadow_upserts',v_shadow,'projection_deleted',v_deleted);
end; $function$;

-- Sanitized six-case fixture. Names and stable keys are retained to test actual regex behavior.
-- Other identifying commercial fields are synthetic, not faithful copies of production.
insert into public.source_products_v2(id,canonical_product_id,mapping_status,mapping_confidence,taxonomy_version,classification_version,source_category_conflict,mapping_source)
values (31887778,27,'mapped',0.99,'v2.7','fixture',false,'fixture'),
 (20076,236,'mapped',0.99,'v2.7','fixture',false,'fixture'),
 (26568969,27,'mapped',0.99,'v2.7','fixture',false,'fixture'),
 (38204,27,'mapped',0.99,'v2.7','fixture',false,'fixture'),
 (32041543,27,'mapped',0.99,'v2.7','fixture',false,'fixture'),
 (9900000001,236,'mapped',0.99,'v2.7','synthetic',true,'synthetic');
insert into public.flyer_deals(
id,source_product_id,product_name,brand,canonical_product_id,canonical_product_name,category,
category_source,category_confidence,category_flag,category_conflicts,match_key,match_key_version,
product_price,store_id,retailer,retailer_key,zip_code,base_amount,base_unit,product_size,created_at,processed_at)
values
(153563862,31887778,'Safe Catch Wild Albacore Tuna, Mercury Tested','Safe Catch',27,'Canned Tuna','SEAFOOD','fixture',0.7,false,true,'fixture-tuna',2,2.99,101,'Fixture Market','fixture_market','90000',5,'oz','5 oz',now(),now()),
(153213924,20076,'Northern Catch Pink Salmon','Northern Catch',236,'Canned Salmon','SEAFOOD','fixture',0.7,false,true,'fixture-salmon',2,2.99,101,'Fixture Market','fixture_market','90000',5,'oz','5 oz',now(),now()),
(153204558,26568969,'Genova Mediterranean Bean Salad Tuna Bowl','Genova',27,'Canned Tuna','SEAFOOD','fixture',0.7,false,true,'fixture-salad',2,2.99,101,'Fixture Market','fixture_market','90000',5,'oz','5 oz',now(),now()),
(152956469,38204,'Safe Catch Ahi Wild Yellowfin Tuna Steaks, 5 oz, 6-count','Safe Catch',27,'Canned Tuna','SEAFOOD','fixture',0.7,false,true,'fixture-steaks',2,2.99,101,'Fixture Market','fixture_market','90000',5,'oz','5 oz',now(),now()),
(133655391,32041543,'Wegmans Yellowfin Solid Light Tuna in Extra Virgin Olive Oil with Sea Salt','Wegmans',27,'Canned Tuna','PANTRY','fixture',0.7,false,false,'fixture-pantry',2,2.99,101,'Fixture Market','fixture_market','90000',5,'oz','5 oz',now(),now()),
(9900000001,9900000001,'Northern Catch Pink Salmon','Northern Catch',27,'Canned Salmon','SEAFOOD','fixture',0.7,false,true,'fixture-mismatch',2,2.99,101,'Fixture Market','fixture_market','90000',5,'oz','5 oz',now(),now());
insert into public.canonical_offer_shadow_v2(flyer_deal_id,source_product_id,deal_created_at,canonical_product_id_at_link,mapping_status_at_link,link_method,refreshed_at)
select f.id,f.source_product_id,f.created_at,s.canonical_product_id,'mapped','fixture',now()
from public.flyer_deals f join public.source_products_v2 s on s.id=f.source_product_id;
insert into public.canonical_source_search_shadow_v27(source_product_id,mapping_status,canonical_product_id,mapping_source)
select id,'mapped',canonical_product_id,'fixture' from public.source_products_v2;
insert into public.canonical_offer_search_projection_v27(flyer_deal_id,source_product_id,canonical_product_id,zip_code,retailer_key,deal_created_at,mapping_source,projected_at,normalized_product_name,product_price)
select f.id,f.source_product_id,s.canonical_product_id,f.zip_code,f.retailer_key,f.created_at,'fixture',now(),public.v2_norm(f.product_name),f.product_price from public.flyer_deals f join public.source_products_v2 s on s.id=f.source_product_id;
create index flyer_deals_category_id_dq01_idx on public.flyer_deals(category,id);
create index flyer_deals_source_product_id_dq01_idx on public.flyer_deals(source_product_id);
create index offer_shadow_source_id_dq01_idx on public.canonical_offer_shadow_v2(source_product_id,deal_created_at);
create index projection_source_id_dq01_idx on public.canonical_offer_search_projection_v27(source_product_id,deal_created_at);
alter table public.canonical_offer_shadow_v2 add constraint dq01_offer_source_fk foreign key(source_product_id) references public.source_products_v2(id);
alter table public.canonical_offer_search_projection_v27 add constraint dq01_projection_source_fk foreign key(source_product_id) references public.source_products_v2(id);


-- Migration must be applied *after* inserts so the before/after mutation is testable.
-- In psql: \i migration_canned_fish_pantry_rule.sql 
-- Or run this bundle's next section, already embedded below.
create temporary table dq01_before as select id,category,canonical_product_id,canonical_product_name,match_key from public.flyer_deals;

commit;
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


-- Trigger a category write without changing identity. The one-row update fires the PR's real trigger.
update public.flyer_deals set category=category where id in (153563862,153213924,153204558,152956469,133655391,9900000001);
do $verify$
declare v_bad bigint[];
begin
 select array_agg(id order by id) into v_bad from public.flyer_deals where
  (id in (153563862,153213924,133655391) and category<>'PANTRY')
  or (id in (153204558,152956469,9900000001) and category<>'SEAFOOD');
 if v_bad is not null then raise exception 'DQ-01 category expectations failed for %',v_bad; end if;
 if exists(select 1 from public.flyer_deals a join dq01_before b using(id)
   where a.canonical_product_id is distinct from b.canonical_product_id
   or a.canonical_product_name is distinct from b.canonical_product_name
   or a.match_key is distinct from b.match_key) then
   raise exception 'DQ-01 changed an identity or match key'; end if;
end $verify$;
-- Verify mapping-finalizer queue semantics on one mapped source, *not* queue-consumption effects.
select public.v27_finalize_source_product_incremental(31887778) as finalized_status;
do $verify$ begin
 if not exists (select 1 from private.v27_mapping_propagation_queue where source_product_id=31887778 and target_canonical_product_id=27 and status='pending') then
   raise exception 'Queue enqueue assertion failed'; end if;
end $verify$;
select f.id,f.product_name,b.category as category_before,f.category as category_after,
 f.canonical_product_id,f.match_key from public.flyer_deals f join dq01_before b using(id) order by f.id;
