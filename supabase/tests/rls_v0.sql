-- Access tests for labs backend v0, as one DO block so they run in a single transaction and leave nothing behind.
-- It creates two visitors and an owner, then acts as each role the way the Data API does (the role, plus the
-- request.jwt.claims and request.headers settings that auth.uid() and the install policies read).
-- A failed expectation raises 'FAILED: <name>'. Success ends with the exception 'RLS_TESTS_PASSED: <n> checks',
-- which is how the result is reported and how everything the test wrote is rolled back.

do $test$
declare
  n int := 0;
  got text;
  item text[];
  ua constant text := '00000000-0000-4000-8000-0000000000a1';
  ub constant text := '00000000-0000-4000-8000-0000000000b2';
  uo constant text := '00000000-0000-4000-8000-0000000000c3';
  i1 constant text := '11111111-1111-4111-8111-111111111111';
  i2 constant text := '22222222-2222-4222-8222-222222222222';
  i3 constant text := '33333333-3333-4333-8333-333333333333';
  refused text[];
  expect text[];
begin
  insert into auth.users (id, instance_id, aud, role, email) values
    (ua::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.invalid'),
    (ub::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.invalid'),
    (uo::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.invalid');
  insert into private.admins (user_id) values (uo::uuid);

  -- ================= visitor A writes their own record =================
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', ua), true);
  perform set_config('request.headers', '{}', true);
  insert into public.profiles (id, display_name) values (ua::uuid, 'A');
  insert into public.progress (user_id, lab, v, data) values (ua::uuid, 'heptapod', 1, '{"step":4}');
  insert into public.events (user_id, id, t, lab, type, session) values (ua::uuid, 'evt-a-0001', now(), 'heptapod', 'lab.open', 's1');
  expect := array[
    ['select count(*) from public.progress', '1', 'A reads their own progress'],
    ['select count(*) from public.events', '1', 'A reads their own events'],
    ['select private.is_admin()', 'false', 'A is not an admin'],
    ['select count(*) from public.usage_events', '0', 'a signed-in visitor reads no usage events'],
    ['select count(*) from public.usage_by_day', '0', 'a signed-in visitor reads no usage view rows']
  ];
  foreach item slice 1 in array expect loop
    execute item[1] into got;
    if got is distinct from item[2] then raise exception 'FAILED: % (got %)', item[3], got; end if;
    n := n + 1;
  end loop;
  refused := array[
    [format($q$insert into public.progress (user_id, lab, v, data) values ('%s', 'heptapod', 1, '{}')$q$, ub), 'A cannot write progress as B'],
    [format($q$insert into public.events (user_id, id, t, lab, type) values ('%s', 'evt-x-0001', now(), 'heptapod', 'lab.open')$q$, ub), 'A cannot write events as B'],
    [format($q$insert into public.profiles (id) values ('%s')$q$, ub), 'A cannot create a profile for B'],
    [format($q$update public.progress set user_id = '%s' where lab = 'heptapod'$q$, ub), 'A cannot hand their progress row to B'],
    [$q$update public.events set type = 'lab.leave' where id = 'evt-a-0001'$q$, 'events are append-only: no update'],
    [format($q$insert into public.progress (user_id, lab, v, data) values ('%s', 'Bad Lab!', 1, '{}')$q$, ua), 'a malformed lab id is refused'],
    [format($q$insert into public.progress (user_id, lab, v, data) values ('%s', 'big', 1, jsonb_build_object('x', repeat('y', 70000)))$q$, ua), 'an oversized progress payload is refused'],
    [$q$select * from private.admins$q$, 'a visitor cannot read the admin list'],
    [$q$select * from private.usage_day$q$, 'a visitor cannot read the daily counter'],
    [$q$insert into private.admins (user_id) select auth.uid()$q$, 'a visitor cannot make themselves an admin']
  ];
  foreach item slice 1 in array refused loop
    begin
      execute item[1];
    exception when others then
      n := n + 1; continue;
    end;
    raise exception 'FAILED (was allowed): %', item[2];
  end loop;
  reset role;

  -- ================= visitor B sees nothing of A's and cannot change it =================
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', ub), true);
  expect := array[
    ['select count(*) from public.profiles', '0', 'B cannot read A profile'],
    ['select count(*) from public.progress', '0', 'B cannot read A progress'],
    ['select count(*) from public.events', '0', 'B cannot read A events']
  ];
  foreach item slice 1 in array expect loop
    execute item[1] into got;
    if got is distinct from item[2] then raise exception 'FAILED: % (got %)', item[3], got; end if;
    n := n + 1;
  end loop;
  update public.progress set data = '{"hacked":true}' where lab = 'heptapod';
  delete from public.progress where lab = 'heptapod';
  delete from public.events where lab = 'heptapod';
  delete from public.profiles where display_name = 'A';
  reset role;
  if (select data ->> 'step' from public.progress where user_id = ua::uuid) is distinct from '4' then raise exception 'FAILED: B changed or removed A progress'; end if;
  if (select count(*) from public.events where user_id = ua::uuid) <> 1 then raise exception 'FAILED: B removed A events'; end if;
  if (select count(*) from public.profiles where id = ua::uuid) <> 1 then raise exception 'FAILED: B removed A profile'; end if;
  n := n + 3;

  -- ================= an anonymous visitor: may add usage rows, reads nothing =================
  set local role anon;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.headers', '{}', true);
  insert into public.usage_events (install_id, event_id, t, lab, type, session, data) values
    (i1::uuid, 'evt-u-0001', now(), 'hub', 'lab.open', 's9', null),
    (i1::uuid, 'evt-u-0002', now(), 'hub', 'lab.leave', 's9', '{"visibleMs": 4000, "totalMs": 9000, "final": true}'),
    (i2::uuid, 'evt-v-0001', now(), 'heptapod', 'lab.open', 's7', null);
  -- A retry of an event already stored is skipped, not an error (what the API sends with ignore-duplicates).
  -- Skipping compares against stored rows, which a visitor may only do for their own install: without the
  -- install header the retry is refused, with it the duplicate is skipped.
  begin
    insert into public.usage_events (install_id, event_id, t, lab, type) values (i1::uuid, 'evt-u-0001', now(), 'hub', 'lab.open')
      on conflict (install_id, event_id) do nothing;
    raise exception 'FAILED (was allowed): a retry without the install header';
  exception when insufficient_privilege then
    n := n + 1;
  end;
  perform set_config('request.headers', format('{"x-install-id":"%s"}', i1), true);
  insert into public.usage_events (install_id, event_id, t, lab, type) values (i1::uuid, 'evt-u-0001', now(), 'hub', 'lab.open')
    on conflict (install_id, event_id) do nothing;
  perform set_config('request.headers', '{}', true);
  n := n + 1;
  expect := array[
    ['select count(*) from public.usage_events', '0', 'anon without an install header sees no usage rows']
  ];
  foreach item slice 1 in array expect loop
    execute item[1] into got;
    if got is distinct from item[2] then raise exception 'FAILED: % (got %)', item[3], got; end if;
    n := n + 1;
  end loop;
  refused := array[
    [$q$select lab from public.usage_events$q$, 'anon cannot read usage event contents'],
    [$q$select count(*) from public.usage_by_day$q$, 'anon cannot read the usage view'],
    [$q$select count(*) from public.progress$q$, 'anon cannot read progress'],
    [$q$select count(*) from public.events$q$, 'anon cannot read events'],
    [$q$select count(*) from public.profiles$q$, 'anon cannot read profiles'],
    [format($q$insert into public.progress (user_id, lab, v, data) values ('%s', 'hub', 1, '{}')$q$, ua), 'anon cannot write progress'],
    [format($q$insert into public.usage_events (install_id, event_id, t, lab, type) values ('%s', 'evt-u-0003', now() + interval '3 days', 'hub', 'lab.open')$q$, i1), 'a usage event from the future is refused'],
    [format($q$insert into public.usage_events (install_id, event_id, t, lab, type) values ('%s', 'evt-u-0004', now() - interval '60 days', 'hub', 'lab.open')$q$, i1), 'a usage event older than 30 days is refused'],
    [format($q$insert into public.usage_events (install_id, event_id, t, lab, type, data) values ('%s', 'evt-u-0005', now(), 'hub', 'lab.open', jsonb_build_object('x', repeat('y', 3000)))$q$, i1), 'an oversized usage payload is refused'],
    [format($q$insert into public.usage_events (install_id, event_id, t, lab, type) values ('%s', 'evt-u-0001', now(), 'hub', 'lab.open')$q$, i1), 'the same event twice without ignore-duplicates is refused'],
    [format($q$insert into public.usage_events (install_id, event_id, t, lab, type) values ('%s', 'evt-u-0006', now(), 'hub', 'DROP TABLE')$q$, i1), 'a malformed event type is refused'],
    [format($q$update public.usage_events set lab = 'x' where install_id = '%s'$q$, i1), 'usage events cannot be updated'],
    [$q$select private.is_admin()$q$, 'anon cannot call is_admin'],
    [$q$select public.rls_auto_enable()$q$, 'anon cannot call the platform helper']
  ];
  foreach item slice 1 in array refused loop
    begin
      execute item[1];
    exception when others then
      n := n + 1; continue;
    end;
    raise exception 'FAILED (was allowed): %', item[2];
  end loop;
  -- erasing without the header removes nothing
  delete from public.usage_events where install_id = i1::uuid;
  reset role;
  if (select count(*) from public.usage_events) <> 3 then raise exception 'FAILED: a delete without the install header removed rows'; end if;
  n := n + 1;

  -- erasing with the header removes that install's rows only, even when the filter names another install
  set local role anon;
  perform set_config('request.headers', format('{"x-install-id":"%s"}', i1), true);
  execute 'select count(*) from public.usage_events' into got;
  if got is distinct from '2' then raise exception 'FAILED: a visitor counts their own install rows (got %)', got; end if;
  delete from public.usage_events where install_id = i2::uuid;
  delete from public.usage_events where install_id = i1::uuid;
  reset role;
  if (select count(*) from public.usage_events where install_id = i1::uuid) <> 0 then raise exception 'FAILED: a visitor could not erase their own install'; end if;
  if (select count(*) from public.usage_events where install_id = i2::uuid) <> 1 then raise exception 'FAILED: another install was erased'; end if;
  n := n + 3;
  set local role anon;
  perform set_config('request.headers', '{"x-install-id":"not-a-uuid"}', true);
  delete from public.usage_events where install_id = i2::uuid;
  reset role;
  if (select count(*) from public.usage_events) <> 1 then raise exception 'FAILED: a malformed install header removed rows'; end if;
  n := n + 1;

  -- ================= the owner reads usage, and still only their own personal record =================
  set local role anon;
  perform set_config('request.headers', '{}', true);
  insert into public.usage_events (install_id, event_id, t, lab, type, session, data) values
    (i3::uuid, 'evt-w-0001', now(), 'hub', 'lab.leave', 's3', '{"visibleMs": 6000, "totalMs": 7000, "final": true}'),
    (i3::uuid, 'evt-w-0002', now(), 'hub', 'lab.leave', 's4', '{"visibleMs": "junk"}');
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', uo), true);
  expect := array[
    ['select private.is_admin()', 'true', 'the owner is an admin'],
    ['select count(*) from public.usage_events', '3', 'the owner reads every usage event'],
    [$q$select visible_ms from public.usage_by_day where lab = 'hub' and type = 'lab.leave'$q$, '6000', 'the view sums visible time and ignores junk'],
    [$q$select sessions from public.usage_by_day where lab = 'hub' and type = 'lab.leave'$q$, '2', 'the view counts sessions'],
    [$q$select installs from public.usage_by_day where lab = 'heptapod' and type = 'lab.open'$q$, '1', 'the view counts installs'],
    ['select count(*) from public.progress', '0', 'the owner does not read visitors progress'],
    ['select count(*) from public.events', '0', 'the owner does not read visitors events'],
    ['select count(*) from public.profiles', '0', 'the owner does not read visitors profiles']
  ];
  foreach item slice 1 in array expect loop
    execute item[1] into got;
    if got is distinct from item[2] then raise exception 'FAILED: % (got %)', item[3], got; end if;
    n := n + 1;
  end loop;
  reset role;

  if (select d.n from private.usage_day d where d.day = (now() at time zone 'utc')::date) < 5 then raise exception 'FAILED: the daily counter did not count the inserts'; end if;
  n := n + 1;

  raise exception 'RLS_TESTS_PASSED: % checks', n;
end $test$;
