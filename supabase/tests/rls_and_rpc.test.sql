-- RLS on app.* + ownership checks in public RPCs + misc RPCs
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'a@test.local', '', now(), now()),
       ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'b@test.local', '', now(), now());

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

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select array_agg(id) from app.fields), array['00000000-0000-0000-0000-000000000001'::uuid], 'anon sees only the demo field');
select is((select count(*)::int from app.field_practices), 1, 'anon sees demo field practices only');
select is(public.field_results('00000000-0000-0000-0000-000000000001')->'profile'->>'ok', 'true', 'anon can read demo field_results');

-- misc RPCs as anon
select is((select array_agg(province_code) from public.enabled_provinces()), array['44'], 'enabled_provinces = {44}');
select ok((select count(*) > 0 and bool_and(version = 'seed') from public.data_snapshots_latest()), 'data_snapshots_latest returns seed versions');
select is(jsonb_array_length(public.weather_series(3818832, '2024-01-01', '2024-12-31')), 366, 'weather_series: 366 days in 2024');
select throws_ok($$ select public.mvt_tile('bogus', 1, 0, 0) $$, '22023', null, 'mvt_tile rejects non-whitelisted layer');

reset role;
-- A's UPDATEs above must have matched 0 rows
select is((select name from app.fields where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'B field', 'A cannot update B''s field');
select is((select name from app.fields where id = '00000000-0000-0000-0000-000000000001'), 'แปลงตัวอย่าง มหาสารคาม', 'A cannot update demo field');
select * from finish();
rollback;
