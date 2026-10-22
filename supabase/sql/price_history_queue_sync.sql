-- Queue-based price history sync for flyer_deals.
-- This replaces the old daily sync_price_history_for_date(date) model.
--
-- The production v2.7 claim RPC is maintained in mobile_app migrations. The
-- legacy claim below follows the same hot-path rule: only unclaimed rows are
-- selected. The Edge Function explicitly releases claimed IDs if a write fails,
-- avoiding a large stale-claim OR scan on flyer_deals.

alter table public.flyer_deals
add column if not exists price_history_claimed_at timestamptz,
add column if not exists price_history_processed_at timestamptz;

create index concurrently if not exists idx_flyer_deals_price_history_queue
on public.flyer_deals (processed_at, id)
where price_history_processed_at is null
  and match_key is not null
  and store_id is not null
  and product_price is not null
  and product_price > 0
  and processed_at >= '2026-06-11 00:00:00+00';

create or replace function public.claim_price_history_rows(
  p_batch_size integer default 1000,
  p_stale_after interval default interval '2 hours'
)
returns table (
  id bigint,
  match_key text,
  store_id integer,
  brand text,
  canonical_product_name text,
  product_price numeric,
  base_amount numeric,
  base_unit text,
  processed_at timestamptz
)
language plpgsql
security definer
as $$
begin
  return query
  with claimed as (
    select fd.id
    from public.flyer_deals fd
    where fd.price_history_processed_at is null
      and fd.price_history_claimed_at is null
      and fd.match_key is not null
      and fd.store_id is not null
      and fd.product_price is not null
      and fd.product_price > 0
      and fd.processed_at is not null
      and fd.processed_at >= '2026-06-11 00:00:00+00'::timestamptz
    order by fd.processed_at asc, fd.id asc
    limit p_batch_size
    for update skip locked
  ), updated as (
    update public.flyer_deals fd
    set price_history_claimed_at = now()
    from claimed
    where fd.id = claimed.id
    returning
      fd.id,
      fd.match_key,
      fd.store_id,
      fd.brand,
      fd.canonical_product_name,
      fd.product_price,
      fd.base_amount,
      fd.base_unit,
      fd.processed_at
  )
  select * from updated;
end;
$$;

create or replace function public.release_price_history_rows(
  p_ids bigint[]
)
returns integer
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
as $$
declare
  v_count integer;
begin
  if p_ids is null or array_length(p_ids,1) is null then
    return 0;
  end if;

  update public.flyer_deals
  set price_history_claimed_at = null
  where id = any(p_ids)
    and price_history_processed_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.release_price_history_rows(bigint[])
  from public, anon, authenticated;
grant execute on function public.release_price_history_rows(bigint[])
  to service_role;

create or replace function public.mark_price_history_rows_processed(
  p_ids bigint[]
)
returns integer
language plpgsql
security definer
set statement_timeout = '30s'
as $$
declare
  v_count integer;
begin
  with ids as (
    select unnest(p_ids) as id
  )
  update public.flyer_deals fd
  set
    price_history_processed_at = now(),
    price_history_claimed_at = null
  from ids
  where fd.id = ids.id
    and fd.price_history_processed_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Old daily RPC, if still present, should be removed after this queue sync is live.
drop function if exists public.sync_price_history_for_date(date);

-- Production cron used after deploying supabase/functions/price-history-prod.
-- The legacy job name is retained for compatibility.
-- select cron.schedule(
--   'price-history-sync-15min',
--   '30 seconds',
--   $cron$
--     select net.http_post(
--       url := 'https://yhyaslxqzwqptknmybqa.supabase.co/functions/v1/price-history-prod',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || (
--           select decrypted_secret
--           from vault.decrypted_secrets
--           where name = 'service_role_key'
--         )
--       ),
--       body := '{"batch_size": 1000}'::jsonb,
--       timeout_milliseconds := 120000
--     );
--   $cron$
-- );
