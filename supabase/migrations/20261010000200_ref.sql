-- SPEC §7.2 — ref schema (nationwide reference maps)
-- Every geometry column has a GIST index.

create table ref.admin_boundaries (
  id serial primary key,
  level text not null check (level in ('province','district','subdistrict')),
  code text unique not null,
  name_th text,
  name_en text,
  province_code text,
  region text check (region in ('north','northeast','central','east','west','south')),
  geom extensions.geometry(MultiPolygon,4326) not null
);
create index admin_boundaries_geom_gist on ref.admin_boundaries using gist (geom);
create index admin_boundaries_level_idx on ref.admin_boundaries (level, province_code);

-- Which provinces users may analyse + per-source data readiness (editable without deploy)
create table ref.province_coverage (
  province_code text primary key,
  enabled boolean not null default false,
  salinity_origin text check (salinity_origin in ('inland_rock_salt','coastal_intrusion','mixed','none')),
  default_variety text check (default_variety in ('KDML105','RD6','RD15','RD41','RD47','PTT1','SPT1')),
  has_ldd_soil boolean not null default false,     -- LDD placeholder: true once LDD files are loaded
  has_ldd_saline boolean not null default false,
  has_dgr boolean not null default false,
  note text
);

-- LDD placeholder: full schema, may be EMPTY until LDD shapefiles arrive (D-002)
create table ref.soil_units (
  id serial primary key,
  soil_group text, soil_series text, texture text, drainage text,
  ph numeric, ksat_mm_day numeric, awc_mm_m numeric,
  source_id int,
  geom extensions.geometry(MultiPolygon,4326) not null
);
create index soil_units_geom_gist on ref.soil_units using gist (geom);

create table ref.saline_soil_zones (
  id serial primary key,
  salinity_level text check (salinity_level in ('very_high','high','moderate','low','none')),
  salt_crust_pct numeric,
  salinity_origin text check (salinity_origin in ('inland_rock_salt','coastal_intrusion')),
  source_id int,
  geom extensions.geometry(MultiPolygon,4326) not null
);
create index saline_soil_zones_geom_gist on ref.saline_soil_zones using gist (geom);

create table ref.geology_units (
  id serial primary key,
  unit_code text, unit_name text, is_maha_sarakham boolean,
  rock_salt_depth_m numeric,                      -- no source yet → usually null
  source_id int,
  geom extensions.geometry(MultiPolygon,4326) not null
);
create index geology_units_geom_gist on ref.geology_units using gist (geom);

create table ref.groundwater_zones (
  id serial primary key,
  quality_class text, ec_dsm numeric, tds_mgl numeric,
  depth_m numeric, yield_m3_hr numeric,
  province_code text,
  source_id int,
  geom extensions.geometry(MultiPolygon,4326) not null
);
create index groundwater_zones_geom_gist on ref.groundwater_zones using gist (geom);

create table ref.irrigation_zones (
  id serial primary key,
  project_name text,
  source_id int,
  geom extensions.geometry(MultiPolygon,4326)
);
create index irrigation_zones_geom_gist on ref.irrigation_zones using gist (geom);

create table ref.water_bodies (
  id serial primary key,
  name text, kind text, capacity_mcm numeric, thaiwater_id text,
  geom extensions.geometry(Geometry,4326)
);
create index water_bodies_geom_gist on ref.water_bodies using gist (geom);

-- Pre-computed 0.01° grid (raster / climate normals / satellite).
-- id scheme (see supabase/README section in seed.sql header):
--   i = floor((lat_min + 90) * 100), j = floor((lon_min + 180) * 100), id = i * 36000 + j
create table ref.grid_cells (
  id bigint primary key,
  weather_grid_id int,
  elev_m numeric, slope_pct numeric,
  sg_clay_pct numeric, sg_soc_gkg numeric,
  rain_normal_mm numeric, et0_normal_mm numeric,
  plant_doy_wet int, plant_doy_dry int,
  si_dry_season numeric,                          -- Sentinel-2 salinity index, dry season
  coast_dist_km numeric,                          -- distance to coast/estuary (coastal_intrusion)
  province_code text,
  updated_at timestamptz,
  geom extensions.geometry(Polygon,4326) not null
);
create index grid_cells_geom_gist on ref.grid_cells using gist (geom);
create index grid_cells_province_idx on ref.grid_cells (province_code);

-- 0.1° weather grid points. id scheme: i = floor((lat+90)*10), j = floor((lon+180)*10), id = i*3600 + j
create table ref.weather_grid (
  id int primary key,
  lat numeric not null, lon numeric not null,
  geom extensions.geometry(Point,4326) not null
);
create index weather_grid_geom_gist on ref.weather_grid using gist (geom);
