-- Labs backend v0, part 2: the owner is recognised without a manual step, and raw usage events are reduced to
-- daily counts after 90 days.

-- ---------------------------------------------------------------------------------------------------------
-- The owner: a signed-in user whose confirmed email hashes to a listed value. No address is stored here, and
-- the check reads the database, never a claim the client can edit. private.admins stays as an explicit list.
-- ---------------------------------------------------------------------------------------------------------
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.admins a where a.user_id = (select auth.uid()))
      or exists (
        select 1 from auth.users u
        where u.id = (select auth.uid())
          and u.email_confirmed_at is not null
          and encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex') = any (array[
            'a1fd9c6a2efdca488506075da86f2ba686743bc6fb91a34d21582963042f0eb6'
          ])
      );
$$;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Daily counts: what remains of usage after 90 days
-- ---------------------------------------------------------------------------------------------------------
create table public.usage_daily (
  day date not null,
  lab text not null,
  type text not null,
  events bigint not null,
  installs bigint not null,
  sessions bigint not null,
  visible_ms bigint not null,
  primary key (day, lab, type)
);
alter table public.usage_daily enable row level security;
revoke all on public.usage_daily from anon, authenticated;
grant select on public.usage_daily to authenticated;
create policy usage_daily_select_admin on public.usage_daily for select to authenticated using ((select private.is_admin()));

-- Whole days older than 90 days are counted once and their raw rows removed in the same transaction. The guard on
-- usage_events refuses events older than 30 days, so no row can arrive later for a day already counted.
create function private.usage_rollup() returns void
language plpgsql set search_path = ''
as $$
declare
  cutoff timestamptz := (date_trunc('day', now() at time zone 'utc') - interval '90 days') at time zone 'utc';
begin
  insert into public.usage_daily as d (day, lab, type, events, installs, sessions, visible_ms)
  select (e.t at time zone 'utc')::date, e.lab, e.type,
         count(*), count(distinct e.install_id), count(distinct e.session),
         coalesce(sum(case when e.type = 'lab.leave' and e.data ->> 'visibleMs' ~ '^[0-9]{1,12}$'
                           then (e.data ->> 'visibleMs')::bigint end), 0)::bigint
  from public.usage_events e
  where e.t < cutoff
  group by 1, 2, 3
  on conflict (day, lab, type) do update set
    events = d.events + excluded.events,
    installs = greatest(d.installs, excluded.installs),
    sessions = greatest(d.sessions, excluded.sessions),
    visible_ms = d.visible_ms + excluded.visible_ms;
  delete from public.usage_events e where e.t < cutoff;
  delete from private.usage_day c where c.day < (now() at time zone 'utc')::date - 30;
end $$;
revoke execute on function private.usage_rollup() from public, anon, authenticated;

-- The dashboard's view now reads both: recent days from the raw events, older days from the daily counts.
-- Replaced in place (same columns and types as before), so it never disappears and keeps its grants.
create or replace view public.usage_by_day with (security_invoker = true) as
select day, lab, type,
       sum(events)::bigint as events,
       sum(installs)::bigint as installs,
       sum(sessions)::bigint as sessions,
       sum(visible_ms) as visible_ms
from (
  select (t at time zone 'utc')::date as day, lab, type,
         count(*) as events,
         count(distinct install_id) as installs,
         count(distinct session) as sessions,
         coalesce(sum(case when type = 'lab.leave' and data ->> 'visibleMs' ~ '^[0-9]{1,12}$'
                           then (data ->> 'visibleMs')::bigint end), 0)::bigint as visible_ms
  from public.usage_events
  group by 1, 2, 3
  union all
  select day, lab, type, events, installs, sessions, visible_ms from public.usage_daily
) s
group by day, lab, type;
revoke all on public.usage_by_day from anon, authenticated;
grant select on public.usage_by_day to authenticated;

-- Every night at 03:17 UTC.
create extension if not exists pg_cron;
select cron.schedule('labs-usage-rollup', '17 3 * * *', 'select private.usage_rollup()');
