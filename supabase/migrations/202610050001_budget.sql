create table public.budget_ledgers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 3000000),
  revision bigint not null check (revision > 0 and revision <= 9007199254740991),
  updated_at timestamptz not null default now()
);
alter table public.budget_ledgers enable row level security;
revoke all on public.budget_ledgers from anon, authenticated;
grant select, insert on public.budget_ledgers to authenticated;
grant update (state, revision) on public.budget_ledgers to authenticated;
create policy ledger_read on public.budget_ledgers for select to authenticated using ((select auth.uid()) = user_id);
create policy ledger_insert on public.budget_ledgers for insert to authenticated with check ((select auth.uid()) = user_id);
create policy ledger_update on public.budget_ledgers for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.guard_budget_update() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then raise exception 'Owner cannot change'; end if;
  if new.revision <> old.revision + 1 then raise exception 'Revision must advance by one'; end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger budget_update before update on public.budget_ledgers for each row execute function public.guard_budget_update();

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.ai_usage (
  scope text not null,
  bucket timestamptz not null,
  attempts integer not null default 0,
  primary key(scope, bucket)
);
create table private.ai_active (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lease uuid not null,
  expires_at timestamptz not null
);
revoke all on private.ai_usage, private.ai_active from public, anon, authenticated;

create function public.acquire_ai_attempt(p_user uuid, p_lease uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  instant timestamptz := clock_timestamp();
  hour_start timestamptz := date_trunc('hour', instant at time zone 'UTC') at time zone 'UTC';
  day_start timestamptz := date_trunc('day', instant at time zone 'Asia/Bishkek') at time zone 'Asia/Bishkek';
  hour_count integer; day_count integer; app_count integer; active_until timestamptz;
begin
  -- One shared lock makes global and per-user checks a single atomic decision.
  perform pg_advisory_xact_lock(817263);
  select expires_at into active_until from private.ai_active where user_id = p_user;
  if active_until > instant then return jsonb_build_object('allowed', false, 'retry_after', greatest(1, ceil(extract(epoch from active_until - instant)))); end if;
  insert into private.ai_usage(scope,bucket) values ('hour:' || p_user, hour_start), ('day:' || p_user, day_start), ('app', day_start) on conflict do nothing;
  select attempts into hour_count from private.ai_usage where scope = 'hour:' || p_user and bucket = hour_start;
  select attempts into day_count from private.ai_usage where scope = 'day:' || p_user and bucket = day_start;
  select attempts into app_count from private.ai_usage where scope = 'app' and bucket = day_start;
  if day_count >= 30 or app_count >= 100 then return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from day_start + interval '1 day' - instant)))); end if;
  if hour_count >= 10 then return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from hour_start + interval '1 hour' - instant)))); end if;
  update private.ai_usage set attempts = attempts + 1 where (scope = 'hour:' || p_user and bucket = hour_start) or (scope = 'day:' || p_user and bucket = day_start) or (scope = 'app' and bucket = day_start);
  insert into private.ai_active values(p_user, p_lease, instant + interval '240 seconds') on conflict(user_id) do update set lease = excluded.lease, expires_at = excluded.expires_at;
  delete from private.ai_usage where bucket < day_start - interval '2 days';
  return jsonb_build_object('allowed', true, 'retry_after', 0);
end;
$$;
create function public.release_ai_attempt(p_user uuid, p_lease uuid)
returns void language sql security definer set search_path = '' as $$
  delete from private.ai_active where user_id = p_user and lease = p_lease;
$$;
revoke all on function public.acquire_ai_attempt(uuid, uuid), public.release_ai_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.acquire_ai_attempt(uuid, uuid), public.release_ai_attempt(uuid, uuid) to service_role;
