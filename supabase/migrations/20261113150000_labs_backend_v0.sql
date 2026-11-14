-- Labs backend v0 (project uguiiwmhlqcitxrgqqmh, West EU).
--
-- Two kinds of data, kept apart:
--   1. A signed-in visitor's own record (profiles, progress, events): readable and writable only by that visitor.
--   2. Consented, anonymous usage events (usage_events): any visitor who allowed it may add rows; only the site
--      owner may read them. A visitor can erase the rows of their own install.
--
-- Every table in public has row-level security on, and every policy has a test in supabase/tests/rls_v0.sql.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Supabase's default helper that turns row-level security on for new tables is an event-trigger function; no
-- visitor role needs to call it.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- The site owner
-- ---------------------------------------------------------------------------------------------------------
create table private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table private.admins enable row level security;   -- no policies: unreachable except through is_admin()

create function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.admins a where a.user_id = (select auth.uid()));
$$;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- A signed-in visitor's own record
-- ---------------------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profiles_delete_own on public.profiles for delete to authenticated using ((select auth.uid()) = id);

create table public.progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lab text not null check (lab ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  v integer not null check (v >= 0),
  data jsonb not null check (octet_length(data::text) <= 65536),
  updated_at timestamptz not null default now(),
  primary key (user_id, lab)
);
alter table public.progress enable row level security;
revoke all on public.progress from anon, authenticated;
grant select, insert, update, delete on public.progress to authenticated;
create policy progress_select_own on public.progress for select to authenticated using ((select auth.uid()) = user_id);
create policy progress_insert_own on public.progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy progress_update_own on public.progress for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy progress_delete_own on public.progress for delete to authenticated using ((select auth.uid()) = user_id);

-- the visitor's activity log, synced from the browser; append-only, as it is there
create table public.events (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 8 and 64),
  t timestamptz not null,
  lab text not null check (lab ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  type text not null check (type ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  session text check (char_length(session) <= 64),
  data jsonb check (octet_length(data::text) <= 2048),
  received_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index events_user_t_idx on public.events (user_id, t);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select, insert, delete on public.events to authenticated;
create policy events_select_own on public.events for select to authenticated using ((select auth.uid()) = user_id);
create policy events_insert_own on public.events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy events_delete_own on public.events for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------------------
-- Consented, anonymous usage events
-- ---------------------------------------------------------------------------------------------------------
create table public.usage_events (
  id bigint generated always as identity primary key,
  install_id uuid not null,
  event_id text not null check (char_length(event_id) between 8 and 64),
  t timestamptz not null,
  lab text not null check (lab ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  type text not null check (type ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  session text check (char_length(session) <= 64),
  data jsonb check (octet_length(data::text) <= 2048),
  received_at timestamptz not null default now(),
  unique (install_id, event_id)
);
create index usage_events_t_idx on public.usage_events (t);
create index usage_events_lab_t_idx on public.usage_events (lab, t);
alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;
grant insert, delete on public.usage_events to anon, authenticated;
-- A visitor may see only the two ids of rows from their own install (they already hold both). The API needs that
-- much to filter a delete and to skip an event it already stored.
grant select (install_id, event_id) on public.usage_events to anon;
grant select on public.usage_events to authenticated;

-- The table's check constraints and the guard trigger below decide what a row may hold; the policy only says who.
create policy usage_insert_any on public.usage_events for insert to anon, authenticated with check (true);
create policy usage_select_admin on public.usage_events for select to authenticated using ((select private.is_admin()));

-- A visitor erases the rows of their own install by sending its id in the x-install-id header. The id is random
-- and lives only in that browser, so holding it is the proof of ownership.
create function private.header_install_id() returns uuid
language plpgsql stable set search_path = ''
as $$
declare raw text;
begin
  raw := coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-install-id';
  if raw is null or raw !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  return raw::uuid;
end $$;
revoke execute on function private.header_install_id() from public;
grant usage on schema private to anon;
grant execute on function private.header_install_id() to anon, authenticated;
create policy usage_select_own_install on public.usage_events for select to anon, authenticated
  using (install_id = (select private.header_install_id()));
create policy usage_delete_own_install on public.usage_events for delete to anon, authenticated
  using (install_id = (select private.header_install_id()));

-- The guard: event times must be plausible, and one day cannot take more than 200,000 rows, so a script holding
-- the public key cannot fill the database.
create table private.usage_day (
  day date primary key,
  n bigint not null
);
alter table private.usage_day enable row level security;

create function private.usage_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare total bigint;
begin
  if new.t > now() + interval '1 day' or new.t < now() - interval '30 days' then
    raise exception 'event time out of range' using errcode = '22008';
  end if;
  insert into private.usage_day as d (day, n) values ((now() at time zone 'utc')::date, 1)
    on conflict (day) do update set n = d.n + 1
    returning d.n into total;
  if total > 200000 then
    raise exception 'daily usage allowance reached' using errcode = '54000';
  end if;
  new.received_at := now();
  return new;
end $$;
revoke execute on function private.usage_guard() from public, anon, authenticated;
create trigger usage_events_guard before insert on public.usage_events
  for each row execute function private.usage_guard();

-- What the dashboard reads: daily counts per lab and event type. security_invoker makes the view obey the
-- policies of usage_events, so only the owner gets rows.
create view public.usage_by_day with (security_invoker = true) as
select
  (t at time zone 'utc')::date as day,
  lab,
  type,
  count(*) as events,
  count(distinct install_id) as installs,
  count(distinct session) as sessions,
  coalesce(sum(case when type = 'lab.leave' and data ->> 'visibleMs' ~ '^[0-9]{1,12}$'
                    then (data ->> 'visibleMs')::bigint end), 0) as visible_ms
from public.usage_events
group by 1, 2, 3;
revoke all on public.usage_by_day from anon, authenticated;
grant select on public.usage_by_day to authenticated;
