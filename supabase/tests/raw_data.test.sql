-- Raw data browser RPCs (D-031): allow-list, filter validation, geometry summary, anon access
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

set local role anon;

select ok(jsonb_array_length(public.raw_data_catalog() -> 'tables') = 16, 'catalog lists the 16 allow-listed tables');
select ok(not exists (select 1 from jsonb_array_elements(public.raw_data_catalog() -> 'tables') e
                      where e ->> 'table' ~ '^(app|sim|meta)\.' or e ->> 'table' = 'obs.sat_indices'),
          'catalog never lists user-linked or internal tables');
select throws_ok($$ select public.raw_data_rows('app.users') $$, '22023', null, 'user table is rejected');
select throws_ok($$ select public.raw_data_rows('ref.grid_cells', 1, 0, 'geom', '1') $$, '22023', null,
                 'geometry column cannot be filtered');
select throws_ok($$ select public.raw_data_rows('ref.grid_cells', 1, 0, 'id', 'abc') $$, '22023', null,
                 'filter value must cast to the column type');
select is((public.raw_data_rows('ref.admin_boundaries', 1, 0, 'level', 'x''; drop table ref.admin_boundaries;--') ->> 'total')::int,
          0, 'filter value is a literal, not SQL');
select ok((public.raw_data_rows('ref.admin_boundaries', 1) -> 'columns') @> '["lat","lon","area_rai"]'
          and not (public.raw_data_rows('ref.admin_boundaries', 1) -> 'columns') ? 'geom',
          'polygons are summarised as lat/lon/area_rai, raw geom is not returned');
select is((public.raw_data_rows('ref.admin_boundaries', 99999) ->> 'limit')::int, 5000, 'limit is capped at 5000');
select is((public.raw_data_rows('ref.weather_grid', 1) -> 'columns'), '["id","lat","lon"]'::jsonb,
          'no duplicate lat/lon for tables that already carry them');

select * from finish();
rollback;
