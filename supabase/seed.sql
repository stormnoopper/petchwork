-- =============================================================================
-- seed.sql — SYNTHETIC dev data (DECISIONS D-005). NOT real data.
-- Real ETL (task 1.9) swaps over these tables. Every snapshot here = version 'seed'.
--
-- Contents
--   * 3 rough provinces: 44 มหาสารคาม (enabled), 40 ขอนแก่น, 72 สุพรรณบุรี (not enabled)
--     + 2 districts / 2 subdistricts inside 44
--   * ref.soil_units / ref.saline_soil_zones intentionally EMPTY (LDD placeholder, D-002)
--   * geology: KTms (lon >= 103.25) | KTpt (lon < 103.25)       → boundary at lon 103.25
--   * groundwater: saline EC 3.2 (lat < 16.05) | fresh EC 0.7 (lat >= 16.05) → boundary at lat 16.05
--     ⇒ any polygon around (103.25, 16.05) straddles both geology and groundwater zones
--   * 1 irrigation zone, 1 reservoir, 1 river line
--   * ref.grid_cells 0.01° over the whole 44 bbox (102.85–103.55 E, 15.60–16.60 N) = 7,000 cells
--   * ref.weather_grid 0.1° points (80) + obs.weather_daily 2016-01-01 … 2025-12-31 (~292k rows)
--   * demo field 00000000-0000-0000-0000-000000000001 (is_demo = true, public read)
--
-- Grid id schemes (also used by ETL):
--   ref.grid_cells   : i = floor((lat_min + 90) * 100), j = floor((lon_min + 180) * 100), id = i * 36000 + j
--   ref.weather_grid : i = floor((lat + 90) * 10),      j = floor((lon + 180) * 10),      id = i * 3600  + j
--                      (point = centre of the 0.1° cell)
--   a grid cell's weather_grid_id = (cell_i / 10) * 3600 + (cell_j / 10)   (integer division)
-- =============================================================================

-- ----------------------------------------------------------------------------- meta.data_sources
insert into meta.data_sources (code, name_th, url, license, attribution_th, scale, target_tables, refresh_tier, status) values
  ('dmr_rock_250k',  'หน่วยหิน 1:250,000 กรมทรัพยากรธรณี', 'https://gisportal.dmr.go.th/arcgis/rest/services/GEOL/ROCK_UNIT_250K/MapServer/0', 'Government open', 'กรมทรัพยากรธรณี', '1:250,000', '{ref.geology_units}', 'semiannual', 'ok'),
  ('ldd_soil',       'กลุ่มชุดดิน 1:25,000 กรมพัฒนาที่ดิน', 'https://dinonline.ldd.go.th/', 'by request', 'กรมพัฒนาที่ดิน', '1:25,000', '{ref.soil_units}', 'manual', 'placeholder'),
  ('ldd_saline',     'แผนที่ดินเค็ม กรมพัฒนาที่ดิน', 'https://dinonline.ldd.go.th/', 'by request', 'กรมพัฒนาที่ดิน', '1:25,000', '{ref.saline_soil_zones}', 'manual', 'placeholder'),
  ('dgr_groundwater','แผนที่น้ำบาดาล 1:100,000 กรมทรัพยากรน้ำบาดาล', 'https://dgr.gdcatalog.go.th/dataset/e1472db9-e7b9-442a-88a1-cb25fe813c70', 'Open Data Common', 'กรมทรัพยากรน้ำบาดาล', '1:100,000', '{ref.groundwater_zones}', 'semiannual', 'limited'),
  ('thaiwater',      'คลังข้อมูลน้ำแห่งชาติ', 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/', 'unclear', 'คลังข้อมูลน้ำแห่งชาติ (สสน.)', null, '{obs.reservoir_storage,obs.water_quality,ref.water_bodies}', 'daily', 'ok'),
  ('tmd',            'กรมอุตุนิยมวิทยา', 'https://data.tmd.go.th/api/WeatherToday/V2/', 'key required', 'กรมอุตุนิยมวิทยา', 'station', '{}', 'daily', 'limited'),
  ('gistda_irrigation','เขตชลประทาน GISTDA', 'https://gistdaportal.gistda.or.th/data/rest/services/L09_rice', 'Government open', 'GISTDA', null, '{ref.irrigation_zones}', 'semiannual', 'ok'),
  ('gistda_admin',   'ขอบเขตจังหวัด/อำเภอ GISTDA 1:50,000', 'https://gistdaportal.gistda.or.th/data/rest/services/L05_AdminBoundary', 'Government open', 'GISTDA', '1:50,000', '{ref.admin_boundaries}', 'semiannual', 'ok'),
  ('hdx_codab',      'ขอบเขตตำบล HDX COD-AB', 'https://data.humdata.org/dataset/cod-ab-tha', 'CC BY-IGO', 'OCHA HDX', null, '{ref.admin_boundaries}', 'semiannual', 'ok'),
  ('era5_land',      'ERA5-Land reanalysis', 'https://openmeteo.s3.amazonaws.com/?list-type=2&prefix=data/copernicus_era5_land/', 'Copernicus licence', 'Copernicus Climate Change Service', '0.1°', '{obs.weather_daily}', 'static', 'ok'),
  ('open_meteo',     'Open-Meteo API', 'https://archive-api.open-meteo.com/v1/archive', 'CC BY 4.0', 'Open-Meteo.com', null, '{obs.weather_daily}', 'daily', 'ok'),
  ('nasa_power',     'NASA POWER', 'https://power.larc.nasa.gov/api/temporal/daily/point', 'public domain', 'NASA POWER', null, '{}', 'static', 'ok'),
  ('soilgrids',      'SoilGrids 250m', 'https://files.isric.org/soilgrids/latest/data/', 'CC BY 4.0', 'ISRIC SoilGrids', '250 m', '{ref.grid_cells}', 'semiannual', 'ok'),
  ('chirps',         'CHIRPS 2.0', 'https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_daily/tifs/p05/', 'public domain', 'UCSB CHC', '0.05°', '{ref.grid_cells}', 'quarterly', 'ok'),
  ('jrc_gsw',        'JRC Global Surface Water', 'https://storage.googleapis.com/global-surface-water/downloads2021/', 'CC BY 4.0', 'EC JRC / Google', '30 m', '{ref.water_bodies}', 'semiannual', 'ok'),
  ('cop_dem',        'Copernicus DEM GLO-30', 'https://copernicus-dem-30m.s3.amazonaws.com/', 'Copernicus licence', 'Copernicus DEM', '30 m', '{ref.grid_cells}', 'static', 'ok'),
  ('nex_gddp_cmip6', 'NEX-GDDP-CMIP6', 'https://nex-gddp-cmip6.s3.us-west-2.amazonaws.com/', 'CC BY-SA 4.0', 'NASA NEX', '0.25°', '{obs.weather_daily_proj}', 'static', 'ok'),
  ('gistda_rice_calendar','พื้นที่ปลูกข้าวรายครึ่งเดือน GISTDA 2015–2018', 'https://gistdaportal.gistda.or.th/data/rest/services/L09_rice', 'Government open', 'GISTDA', null, '{ref.grid_cells}', 'static', 'ok'),
  ('sentinel2',      'Sentinel-2 salinity index / NDVI', 'https://earthengine.google.com/', 'Copernicus licence', 'Copernicus Sentinel-2', '10 m', '{ref.grid_cells,obs.sat_indices}', 'quarterly', 'ok')
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------- ref.admin_boundaries
insert into ref.admin_boundaries (level, code, name_th, name_en, province_code, region, geom) values
  ('province', '44', 'มหาสารคาม', 'Maha Sarakham', '44', 'northeast', ST_Multi(ST_MakeEnvelope(102.85, 15.60, 103.55, 16.60, 4326))),
  ('province', '40', 'ขอนแก่น',   'Khon Kaen',     '40', 'northeast', ST_Multi(ST_MakeEnvelope(102.00, 15.60, 102.85, 17.00, 4326))),
  ('province', '72', 'สุพรรณบุรี', 'Suphan Buri',   '72', 'central',   ST_Multi(ST_MakeEnvelope(99.30, 14.10, 100.30, 15.10, 4326))),
  ('district', '4401', 'เมืองมหาสารคาม', 'Mueang Maha Sarakham', '44', 'northeast', ST_Multi(ST_MakeEnvelope(103.15, 15.95, 103.55, 16.35, 4326))),
  ('district', '4406', 'บรบือ', 'Borabue', '44', 'northeast', ST_Multi(ST_MakeEnvelope(102.85, 15.85, 103.15, 16.25, 4326))),
  ('subdistrict', '440101', 'ตลาด', 'Talat', '44', 'northeast', ST_Multi(ST_MakeEnvelope(103.15, 15.95, 103.30, 16.15, 4326))),
  ('subdistrict', '440102', 'เขวา', 'Khwao', '44', 'northeast', ST_Multi(ST_MakeEnvelope(103.30, 15.95, 103.45, 16.15, 4326)));

-- ----------------------------------------------------------------------------- ref.province_coverage
insert into ref.province_coverage (province_code, enabled, salinity_origin, default_variety, has_ldd_soil, has_ldd_saline, has_dgr, note) values
  ('44', true,  'inland_rock_salt',  'KDML105', false, false, true,  'Phase 1 pilot · LDD placeholder'),
  ('40', false, 'inland_rock_salt',  'KDML105', false, false, true,  'seed'),
  ('72', false, 'coastal_intrusion', 'PTT1',    false, false, true,  'seed — waits for coastal_intrusion model');

-- ----------------------------------------------------------------------------- ref.soil_units / ref.saline_soil_zones
-- INTENTIONALLY EMPTY (LDD placeholder). analyze_polygon must return [] + confidence low.

-- ----------------------------------------------------------------------------- ref.geology_units
insert into ref.geology_units (unit_code, unit_name, is_maha_sarakham, rock_salt_depth_m, geom) values
  ('KTms', 'หมวดหินมหาสารคาม (สมมติ)', true,  null, ST_Multi(ST_MakeEnvelope(103.25, 15.60, 103.55, 16.60, 4326))),
  ('KTpt', 'หมวดหินภูทอก (สมมติ)',     false, null, ST_Multi(ST_MakeEnvelope(102.85, 15.60, 103.25, 16.60, 4326)));

-- ----------------------------------------------------------------------------- ref.groundwater_zones
insert into ref.groundwater_zones (quality_class, ec_dsm, tds_mgl, depth_m, yield_m3_hr, province_code, geom) values
  ('saline', 3.2, 2050, 25, 2.0, '44', ST_Multi(ST_MakeEnvelope(102.85, 15.60, 103.55, 16.05, 4326))),
  ('fresh',  0.7,  450, 40, 5.0, '44', ST_Multi(ST_MakeEnvelope(102.85, 16.05, 103.55, 16.60, 4326)));

-- ----------------------------------------------------------------------------- ref.irrigation_zones / ref.water_bodies
insert into ref.irrigation_zones (project_name, geom) values
  ('โครงการชลประทานมหาสารคาม (สมมติ)', ST_Multi(ST_MakeEnvelope(103.30, 16.15, 103.40, 16.25, 4326)));

insert into ref.water_bodies (name, kind, capacity_mcm, thaiwater_id, geom) values
  ('อ่างเก็บน้ำแก่งเลิงจาน (สมมติ)', 'reservoir', 4.5, 'seed-1', ST_MakeEnvelope(103.36, 16.19, 103.39, 16.21, 4326)),
  ('ลำน้ำชี (สมมติ)', 'river', null, 'seed-2',
     ST_GeomFromText('LINESTRING(102.85 15.95, 103.10 15.88, 103.30 15.82, 103.55 15.75)', 4326));

-- ----------------------------------------------------------------------------- ref.weather_grid (0.1°, 80 points)
insert into ref.weather_grid (id, lat, lon, geom)
select wi * 3600 + wj,
       round(wi / 10.0 - 90 + 0.05, 2),
       round(wj / 10.0 - 180 + 0.05, 2),
       ST_SetSRID(ST_MakePoint(wj / 10.0 - 180 + 0.05, wi / 10.0 - 90 + 0.05), 4326)
from generate_series(1056, 1065) wi, generate_series(2828, 2835) wj;

-- ----------------------------------------------------------------------------- ref.grid_cells (0.01°, 7,000 cells)
insert into ref.grid_cells (id, weather_grid_id, elev_m, slope_pct, sg_clay_pct, sg_soc_gkg,
                            rain_normal_mm, et0_normal_mm, plant_doy_wet, plant_doy_dry,
                            si_dry_season, coast_dist_km, province_code, updated_at, geom)
select i::bigint * 36000 + j,
       (i / 10) * 3600 + (j / 10),
       round((150 + 30 * sin(j / 9.0) * cos(i / 13.0) - (i - 10560) * 0.2)::numeric, 1),
       round((0.5 + 0.4 * abs(sin(i / 5.0 + j / 7.0)))::numeric, 2),
       round((22 + 7 * sin(i / 7.0) * cos(j / 9.0))::numeric, 1),
       round((20 + 9 * cos(i / 11.0) * sin(j / 6.0))::numeric, 1),
       round((1150 + (i - 10560) * 1.0 + 25 * sin(j / 10.0))::numeric, 0),
       round((1760 - (i - 10560) * 0.5)::numeric, 0),
       190 + ((i + j) % 4) * 7,
       15 + ((i * j) % 3) * 10,
       round(case when j >= 28325                       -- lon >= 103.25 → KTms side, saltier
                  then 0.28 + 0.08 * sin(i / 4.0) * cos(j / 3.0)
                  else 0.12 + 0.05 * sin(i / 4.0) * cos(j / 3.0) end::numeric, 4),
       round((470 + (i - 10560) * 0.6 + (j - 28285) * 0.4)::numeric, 1),
       '44',
       now(),
       ST_MakeEnvelope(j / 100.0 - 180, i / 100.0 - 90, (j + 1) / 100.0 - 180, (i + 1) / 100.0 - 90, 4326)
from generate_series(10560, 10659) i, generate_series(28285, 28354) j;

-- ----------------------------------------------------------------------------- obs.weather_daily (2016–2025)
-- Deterministic pseudo-random via hashtext(); monsoon rain May–Oct, ET0 clamped 3–6 mm.
insert into obs.weather_daily (weather_grid_id, date, tmin, tmax, rain_mm, rh, wind_ms, srad_mj, et0_mm, source)
select w.id, d.d,
       round((21.5 - 4.5 * cos(2 * pi() * (t.doy - 10) / 365.0) + (r.u3 - 0.5) * 2)::numeric, 1)              as tmin,
       round((33.0 + 3.0 * cos(2 * pi() * (t.doy - 105) / 365.0) - case when x.wet then 2.0 else 0 end
              + (r.u4 - 0.5) * 2)::numeric, 1)                                                                  as tmax,
       case when x.wet then round((-x.mean_mm * ln(1 - r.u2 * 0.999) * f.grid_f * f.year_f)::numeric, 1) else 0 end as rain_mm,
       round((72 - 13 * cos(2 * pi() * (t.doy - 230) / 365.0) + case when x.wet then 6 else 0 end)::numeric, 0) as rh,
       round((2.2 + 0.6 * cos(2 * pi() * (t.doy - 15) / 365.0) + (r.u3 - 0.5))::numeric, 1)                  as wind_ms,
       round((18 + 3 * cos(2 * pi() * (t.doy - 100) / 365.0) - case when x.wet then 4 else 0 end)::numeric, 1) as srad_mj,
       round(greatest(3, least(6, 4.5 + 1.2 * cos(2 * pi() * (t.doy - 100) / 365.0)
                                 - case when x.wet then 1.0 else 0 end + (r.u4 - 0.5) * 0.4))::numeric, 2) as et0_mm,
       'seed'
from ref.weather_grid w
cross join lateral (select gs::date as d from generate_series('2016-01-01'::date, '2025-12-31'::date, interval '1 day') gs) d
cross join lateral (select extract(doy from d.d)::int as doy, extract(month from d.d)::int as m, extract(year from d.d)::int as yr) t
cross join lateral (select
    (hashtext(w.id || ':' || d.d || ':a')::bigint + 2147483648) / 4294967296.0 as u1,
    (hashtext(w.id || ':' || d.d || ':b')::bigint + 2147483648) / 4294967296.0 as u2,
    (hashtext(w.id || ':' || d.d || ':c')::bigint + 2147483648) / 4294967296.0 as u3,
    (hashtext(w.id || ':' || d.d || ':d')::bigint + 2147483648) / 4294967296.0 as u4) r
cross join lateral (select
    0.9 + 0.2 * (hashtext('g' || w.id)::bigint + 2147483648) / 4294967296.0 as grid_f,
    0.8 + 0.4 * (hashtext('y' || t.yr)::bigint + 2147483648) / 4294967296.0 as year_f) f
cross join lateral (select
    r.u1 < case t.m when 5 then 0.35 when 6 then 0.45 when 7 then 0.50 when 8 then 0.60
                    when 9 then 0.60 when 10 then 0.35 when 4 then 0.15 when 3 then 0.10
                    when 11 then 0.08 else 0.03 end as wet,
    case when t.m between 5 and 10 then 13.0 else 6.0 end as mean_mm) x;

-- ----------------------------------------------------------------------------- meta.data_snapshots (version 'seed')
insert into meta.data_snapshots (source_code, version, checksum, row_count, bbox, storage_path)
select s.code, 'seed', null, s.n, ST_MakeEnvelope(102.0, 14.1, 103.55, 17.0, 4326), null
from (values
  ('gistda_admin',        (select count(*)::int from ref.admin_boundaries where level <> 'subdistrict')),
  ('hdx_codab',           (select count(*)::int from ref.admin_boundaries where level = 'subdistrict')),
  ('dmr_rock_250k',       (select count(*)::int from ref.geology_units)),
  ('dgr_groundwater',     (select count(*)::int from ref.groundwater_zones)),
  ('gistda_irrigation',   (select count(*)::int from ref.irrigation_zones)),
  ('thaiwater',           (select count(*)::int from ref.water_bodies)),
  ('era5_land',           (select count(*)::int from obs.weather_daily)),
  ('soilgrids',           (select count(*)::int from ref.grid_cells)),
  ('cop_dem',             (select count(*)::int from ref.grid_cells)),
  ('chirps',              (select count(*)::int from ref.grid_cells)),
  ('sentinel2',           (select count(*)::int from ref.grid_cells)),
  ('gistda_rice_calendar',(select count(*)::int from ref.grid_cells))
) as s(code, n);

update meta.data_sources d set last_success_at = now()
 where exists (select 1 from meta.data_snapshots s where s.source_code = d.code);

-- ----------------------------------------------------------------------------- demo owner + demo field
-- Fixed-uuid system user that owns the public demo field. It has no usable password.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000de',
        'authenticated', 'authenticated', 'demo@petchwork.local', '', now(),
        '{"provider":"email","providers":["email"]}', '{"name":"demo"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

-- ~178 rai field straddling the KTms/KTpt and saline/fresh groundwater boundaries
insert into app.fields (id, user_id, name, geom, vertices, is_demo) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000de',
   'แปลงตัวอย่าง มหาสารคาม',
   ST_GeomFromText('POLYGON((103.2470 16.0480, 103.2530 16.0480, 103.2530 16.0520, 103.2470 16.0520, 103.2470 16.0480))', 4326),
   '[{"lat":16.0480,"lng":103.2470},{"lat":16.0480,"lng":103.2530},{"lat":16.0520,"lng":103.2530},{"lat":16.0520,"lng":103.2470}]',
   true);

insert into app.field_practices (field_id, season_year, season, variety, plant_date, establishment,
                                 water_source, water_regime, n_kg_rai, organic_t_rai, straw_burn) values
  ('00000000-0000-0000-0000-000000000001', 2025, 'wet', 'KDML105', null, 'broadcast',
   'rainfed', 'rainfed', 10, 0, false);
