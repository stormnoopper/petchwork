-- public.analyze_polygon — contract AnalyzeRpcResult (packages/contracts)
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ~474 rai square straddling geology (lon 103.25) and groundwater (lat 16.05) seed boundaries
create temp table t_straddle as
select public.analyze_polygon('{"type":"Polygon","coordinates":[[[103.246,16.046],[103.254,16.046],[103.254,16.054],[103.246,16.054],[103.246,16.046]]]}') as r;

select is((select r->>'ok' from t_straddle), 'true', 'Maha Sarakham polygon → ok');
select ok((select (r->>'area_rai')::numeric between 400 and 500 from t_straddle), 'area_rai ≈ 474 (≤ 500 rai)');
select is((select r->'admin'->>'province_code' from t_straddle), '44', 'admin.province_code = 44');
select is((select r->'admin'->>'province_name_th' from t_straddle), 'มหาสารคาม', 'admin.province_name_th');
select is((select r->'admin'->>'subdistrict_code' from t_straddle), '440101', 'admin.subdistrict_code');
select is((select r->'admin'->>'district_name_th' from t_straddle), 'เมืองมหาสารคาม', 'admin.district_name_th');

select is((select jsonb_array_length(r->'groundwater'->'parts') from t_straddle), 2, 'groundwater: straddles 2 zones');
select ok((select abs(sum((p->>'w')::numeric) - 1) <= 0.01
             from t_straddle, jsonb_array_elements(r->'groundwater'->'parts') p), 'groundwater weights sum to 1.0 ±0.01');
select ok((select (r->'groundwater'->>'ec_dsm_weighted')::numeric between 0.7 and 3.2 from t_straddle),
          'ec_dsm_weighted lies between the two zone ECs');
select is((select jsonb_array_length(r->'geology') from t_straddle), 2, 'geology: straddles KTms + KTpt');
select ok((select abs(sum((p->>'w')::numeric) - 1) <= 0.01
             from t_straddle, jsonb_array_elements(r->'geology') p), 'geology weights sum to 1.0 ±0.01');

-- LDD placeholder (tables empty in seed)
select is((select r->'soil' from t_straddle), '[]'::jsonb, 'soil = [] (not null) when LDD empty');
select is((select r->'saline' from t_straddle), '[]'::jsonb, 'saline = [] (not null) when LDD empty');
select is((select r->'confidence'->'soil' from t_straddle), '{"level":"low","source":"SoilGrids 250m"}'::jsonb, 'soil confidence low / SoilGrids');
select is((select r->'confidence'->'salinity' from t_straddle), '{"level":"low","source":"Sentinel-2 SI"}'::jsonb, 'salinity confidence low / Sentinel-2 SI');
select is((select r->'confidence'->'groundwater'->>'level' from t_straddle), 'medium', 'groundwater confidence medium (DGR present)');
select is((select r->'confidence'->'geology' from t_straddle), '{"level":"low","source":"DMR 1:250k"}'::jsonb, 'geology confidence low / DMR');

select ok((select r->'grid'->>'weather_grid_id' is not null and r->'grid' ? 'clay_pct' and r->'grid' ? 'soc_gkg'
                  and r->'grid' ? 'coast_dist_km' from t_straddle), 'grid uses contract field names + weather_grid_id');
select is((select r->'coverage'->>'salinity_origin' from t_straddle), 'inland_rock_salt', 'coverage.salinity_origin');
select is((select r->'data_versions'->>'dgr_groundwater' from t_straddle), 'seed', 'data_versions from latest snapshot');

-- error paths
select is(public.analyze_polygon('{"type":"Polygon","coordinates":[[[105.8,17.5],[105.81,17.5],[105.81,17.51],[105.8,17.5]]]}'),
          '{"ok":false,"error":"OUTSIDE_THAILAND"}'::jsonb, 'outside Thailand → OUTSIDE_THAILAND');
select is(public.analyze_polygon('{"type":"Polygon","coordinates":[[[99.80,14.50],[99.81,14.50],[99.81,14.51],[99.80,14.51],[99.80,14.50]]]}'),
          '{"ok":false,"error":"PROVINCE_NOT_ENABLED","province_code":"72","province_name_th":"สุพรรณบุรี"}'::jsonb,
          'Suphan Buri → PROVINCE_NOT_ENABLED with province_code + name');
select is(public.analyze_polygon('{"type":"Point","coordinates":[103.25,16.05]}')->>'error', 'INVALID_POLYGON', 'point → INVALID_POLYGON');

-- performance: < 300 ms on a ≤ 500 rai polygon (seed data)
create temp table t_perf as select clock_timestamp() as t0;
select public.analyze_polygon('{"type":"Polygon","coordinates":[[[103.300,16.100],[103.308,16.100],[103.308,16.108],[103.300,16.108],[103.300,16.100]]]}');
select ok((select clock_timestamp() - t0 < interval '300 milliseconds' from t_perf), 'analyze_polygon < 300 ms');

-- LDD loaded path: one soil + one saline polygon covering half the field → high confidence, weights ≈ 0.5
insert into ref.soil_units (soil_group, texture, ksat_mm_day, awc_mm_m, geom)
values ('17', 'loamy sand', 120, 110, ST_Multi(ST_MakeEnvelope(103.20, 16.00, 103.25, 16.10, 4326)));
insert into ref.saline_soil_zones (salinity_level, salinity_origin, geom)
values ('moderate', 'inland_rock_salt', ST_Multi(ST_MakeEnvelope(103.20, 16.00, 103.25, 16.10, 4326)));
create temp table t_ldd as
select public.analyze_polygon('{"type":"Polygon","coordinates":[[[103.246,16.046],[103.254,16.046],[103.254,16.054],[103.246,16.054],[103.246,16.046]]]}') as r;
select is((select r->'confidence'->'soil' from t_ldd), '{"level":"high","source":"LDD 1:25k"}'::jsonb, 'LDD present → soil high');
select ok((select abs((r->'soil'->0->>'w')::numeric - 0.5) < 0.01 from t_ldd), 'soil part weight ≈ 0.5');
select is((select r->'saline'->0->>'salinity_level' from t_ldd), 'moderate', 'saline part returned');

select * from finish();
rollback;
