-- Labs backend v0, part 3: two corrections found while building the client (2026-11-13).
--
-- 1. Visible time was over-counted. A page reports lab.leave more than once per session, each time with the
--    session's running total (visibleMs), so a session's visible time is its largest report, and a day's is the sum
--    of those over its sessions. The view and the roll-up summed every report.
-- 2. The daily cap counted retries that stored nothing. The count now happens after a row is stored.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Visible time: the largest report per session, summed over sessions
-- ---------------------------------------------------------------------------------------------------------
create or replace view public.usage_by_day with (security_invoker = true) as
select day, lab, type,
       sum(events)::bigint as events,
       sum(installs)::bigint as installs,
       sum(sessions)::bigint as sessions,
       sum(visible_ms) as visible_ms
from (
  select c.day, c.lab, c.type, c.events, c.installs, c.sessions, coalesce(v.visible_ms, 0)::bigint as visible_ms
  from (
    select (t at time zone 'utc')::date as day, lab, type,
           count(*) as events,
           count(distinct install_id) as installs,
           count(distinct session) as sessions
    from public.usage_events
    group by 1, 2, 3
  ) c
  left join (
    select s.day, s.lab, sum(s.ms)::bigint as visible_ms
    from (
      select (t at time zone 'utc')::date as day, lab, install_id, session,
             max((data ->> 'visibleMs')::bigint) as ms
      from public.usage_events
      where type = 'lab.leave' and data ->> 'visibleMs' ~ '^[0-9]{1,12}$'
      group by 1, 2, 3, 4
    ) s
    group by 1, 2
  ) v on v.day = c.day and v.lab = c.lab and c.type = 'lab.leave'
  union all
  select day, lab, type, events, installs, sessions, visible_ms from public.usage_daily
) u
group by day, lab, type;

create or replace function private.usage_rollup() returns void
language plpgsql set search_path = ''
as $$
declare
  cutoff timestamptz := (date_trunc('day', now() at time zone 'utc') - interval '90 days') at time zone 'utc';
begin
  insert into public.usage_daily as d (day, lab, type, events, installs, sessions, visible_ms)
  select c.day, c.lab, c.type, c.events, c.installs, c.sessions, coalesce(v.visible_ms, 0)::bigint
  from (
    select (e.t at time zone 'utc')::date as day, e.lab, e.type,
           count(*) as events,
           count(distinct e.install_id) as installs,
           count(distinct e.session) as sessions
    from public.usage_events e
    where e.t < cutoff
    group by 1, 2, 3
  ) c
  left join (
    select s.day, s.lab, sum(s.ms)::bigint as visible_ms
    from (
      select (e.t at time zone 'utc')::date as day, e.lab, e.install_id, e.session,
             max((e.data ->> 'visibleMs')::bigint) as ms
      from public.usage_events e
      where e.t < cutoff and e.type = 'lab.leave' and e.data ->> 'visibleMs' ~ '^[0-9]{1,12}$'
      group by 1, 2, 3, 4
    ) s
    group by 1, 2
  ) v on v.day = c.day and v.lab = c.lab and c.type = 'lab.leave'
  on conflict (day, lab, type) do update set
    events = d.events + excluded.events,
    installs = greatest(d.installs, excluded.installs),
    sessions = greatest(d.sessions, excluded.sessions),
    visible_ms = d.visible_ms + excluded.visible_ms;
  delete from public.usage_events e where e.t < cutoff;
  delete from private.usage_day c where c.day < (now() at time zone 'utc')::date - 30;
end $$;
revoke execute on function private.usage_rollup() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. The daily cap counts stored rows only
-- ---------------------------------------------------------------------------------------------------------
-- before insert: the time must be plausible (unchanged), and the receive time is the server's
create or replace function private.usage_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.t > now() + interval '1 day' or new.t < now() - interval '30 days' then
    raise exception 'event time out of range' using errcode = '22008';
  end if;
  new.received_at := now();
  return new;
end $$;
revoke execute on function private.usage_guard() from public, anon, authenticated;

-- after insert: a row that was really stored counts toward the day; past 200,000 the insert is refused
create function private.usage_count() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare total bigint;
begin
  insert into private.usage_day as d (day, n) values ((now() at time zone 'utc')::date, 1)
    on conflict (day) do update set n = d.n + 1
    returning d.n into total;
  if total > 200000 then
    raise exception 'daily usage allowance reached' using errcode = '54000';
  end if;
  return null;
end $$;
revoke execute on function private.usage_count() from public, anon, authenticated;
create trigger usage_events_count after insert on public.usage_events
  for each row execute function private.usage_count();
