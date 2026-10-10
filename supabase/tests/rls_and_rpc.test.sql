-- RLS on app.* + ownership checks in public RPCs + misc RPCs
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into app.users (id, email, name, provider, provider_account_id)
values ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'A', 'google', 'sub-a'),
       ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'B', 'google', 'sub-b');

insert into app.fields (id, user_id, name, geom, vertices) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A field',
   ST_GeomFromText('POLYGON((103.30 16.10,103.302 16.10,103.302 16.102,103.30 16.102,103.30 16.10))', 4326), '[]'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B field',
   ST_GeomFromText('POLYGON((103.31 16.10,103.312 16.10,103.312 16.102,103.31 16.102,103.31 16.10))', 4326), '[]');
insert into app.field_practices (field_id, season_year, season, variety) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 2025, 'wet', 'RD6');

-- trigger side effects
select is((select province_code || '/' || subdistrict_code from app.fields where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
          '44/440102', 'admin codes filled by trigger');
select is((select profile->>'ok' from sim.field_profile where field_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
          'true', 'sim.field_profile snapshot created by trigger');

-- ---------------------------------------------------------------- user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from app.fields where user_id = '22222222-2222-2222-2222-222222222222'), 0, 'A cannot see B''s field');
select is((select count(*)::int from app.fields where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1, 'A sees own field');
select is((select count(*)::int from app.fields where id = '00000000-0000-0000-0000-000000000001'), 1, 'A can read demo field');
select is((select count(*)::int from app.field_practices where field_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 0, 'A cannot see B''s practices');

-- app.users (D-026)
select is((select array_agg(id) from app.users), array['11111111-1111-1111-1111-111111111111'::uuid], 'A sees only own app.users row');
select is((public.ensure_app_user('a2@test.local', 'A2', null, null)).email, 'a2@test.local', 'ensure_app_user updates own row');
select is((select provider_account_id from app.users where id = '11111111-1111-1111-1111-111111111111'), 'sub-a', 'ensure_app_user keeps provider_account_id when null passed');
select throws_ok($$ update app.users set email = 'x@evil' where id = '11111111-1111-1111-1111-111111111111' $$,
                 '42501', null, 'A cannot change own email directly');
update app.users set name = 'hacked' where id = '22222222-2222-2222-2222-222222222222';

update app.fields set name = 'hacked' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
update app.fields set name = 'hacked' where id = '00000000-0000-0000-0000-000000000001';
select throws_ok($$ insert into app.fields (user_id, name, geom, vertices)
                    values ('22222222-2222-2222-2222-222222222222', 'x',
                            ST_GeomFromText('POLYGON((103.3 16.1,103.301 16.1,103.301 16.101,103.3 16.1))', 4326), '[]') $$,
                 '42501', null, 'A cannot insert a field owned by B');
select throws_ok($$ insert into app.fields (user_id, name, geom, vertices, is_demo)
                    values ('11111111-1111-1111-1111-111111111111', 'x',
                            ST_GeomFromText('POLYGON((103.3 16.1,103.301 16.1,103.301 16.101,103.3 16.1))', 4326), '[]', true) $$,
                 '42501', null, 'A cannot create a demo field');
select throws_ok($$ insert into app.field_practices (field_id, season) values ('bbbbbbbb-0000-0000-0000-000000000001', 'wet') $$,
                 '42501', null, 'A cannot add practices to B''s field');
select lives_ok($$ insert into app.field_practices (field_id, season_year, season, variety)
                   values ('aaaaaaaa-0000-0000-0000-000000000001', 2025, 'wet', 'KDML105') $$, 'A can add practices to own field');

select throws_ok($$ select public.field_results('bbbbbbbb-0000-0000-0000-000000000001') $$, '42501', null, 'field_results: A blocked on B''s field');
select throws_ok($$ select public.enqueue_twin_run('bbbbbbbb-0000-0000-0000-000000000001', 'awd') $$, '42501', null, 'enqueue_twin_run: A blocked on B''s field');
select throws_ok($$ select public.enqueue_twin_run('aaaaaaaa-0000-0000-0000-000000000001', 'nope') $$, '22023', null, 'enqueue_twin_run: unknown scenario');

create temp table t_run as select public.enqueue_twin_run('aaaaaaaa-0000-0000-0000-000000000001', 'awd') as id;
select is(public.enqueue_twin_run('aaaaaaaa-0000-0000-0000-000000000001', 'awd'), (select id from t_run), 'enqueue_twin_run idempotent on same input_hash');
select is(jsonb_array_length(public.field_results('aaaaaaaa-0000-0000-0000-000000000001')->'runs'), 1, 'field_results lists own run');

-- ---------------------------------------------------------------- new user C (first sign-in)
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((public.ensure_app_user('c@test.local', 'C', null, 'sub-c')).id, '33333333-3333-3333-3333-333333333333'::uuid, 'ensure_app_user creates row for auth.uid()');
select lives_ok($$ insert into app.fields (user_id, name, geom, vertices)
                   values ('33333333-3333-3333-3333-333333333333', 'C field',
                           ST_GeomFromText('POLYGON((103.32 16.10,103.322 16.10,103.322 16.102,103.32 16.102,103.32 16.10))', 4326), '[]') $$,
                'C can insert a field after ensure_app_user (FK app.users)');

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select array_agg(id) from app.fields), array['00000000-0000-0000-0000-000000000001'::uuid], 'anon sees only the demo field');
select is((select count(*)::int from app.field_practices), 1, 'anon sees demo field practices only');
select is(public.field_results('00000000-0000-0000-0000-000000000001')->'profile'->>'ok', 'true', 'anon can read demo field_results');
select throws_ok($$ select public.ensure_app_user('x@test.local', null, null, null) $$, '42501', null, 'anon cannot call ensure_app_user');
select throws_ok($$ select count(*) from app.users $$, '42501', null, 'anon has no privilege on app.users');

-- misc RPCs as anon
select ok((select count(*) = 77 and bool_or(province_code = '44') from public.enabled_provinces()), 'enabled_provinces = all 77 provinces (D-029)');
select ok((select count(*) > 0 and bool_and(version = 'seed') from public.data_snapshots_latest()), 'data_snapshots_latest returns seed versions');
select is(jsonb_array_length(public.weather_series(3818832, '2024-01-01', '2024-12-31')), 366, 'weather_series: 366 days in 2024');
select throws_ok($$ select public.mvt_tile('bogus', 1, 0, 0) $$, '22023', null, 'mvt_tile rejects non-whitelisted layer');

reset role;
-- A's UPDATEs above must have matched 0 rows
select is((select name from app.fields where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'B field', 'A cannot update B''s field');
select is((select name from app.fields where id = '00000000-0000-0000-0000-000000000001'), 'แปลงตัวอย่าง มหาสารคาม', 'A cannot update demo field');
select is((select name from app.users where id = '22222222-2222-2222-2222-222222222222'), 'B', 'A cannot update B''s app.users row');
select is((select count(*)::int from app.fields where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'precondition: A owns one field');
delete from app.users where id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from app.fields where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'deleting app.users cascades to fields');
select * from finish();
rollback;
