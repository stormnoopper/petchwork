-- SPEC §7.2 + §6.1 — obs / meta / app / sim

-- ===================================================================== obs
create table obs.weather_daily (
  weather_grid_id int not null,
  date date not null,
  tmin numeric, tmax numeric, rain_mm numeric, rh numeric,
  wind_ms numeric, srad_mj numeric, et0_mm numeric,
  source text,
  primary key (weather_grid_id, date)
) partition by range (date);

do $$
declare y int;
begin
  for y in 2000..2036 loop
    execute format(
      'create table obs.weather_daily_%s partition of obs.weather_daily for values from (%L) to (%L)',
      y, make_date(y,1,1), make_date(y+1,1,1));
  end loop;
end $$;
create index weather_daily_date_brin on obs.weather_daily using brin (date);

-- CMIP6 projections kept separate so the main table does not bloat (SPEC §7.2)
create table obs.weather_daily_proj (
  weather_grid_id int not null,
  date date not null,
  gcm text not null, ssp text not null,
  tmin numeric, tmax numeric, rain_mm numeric, rh numeric,
  wind_ms numeric, srad_mj numeric, et0_mm numeric,
  primary key (weather_grid_id, gcm, ssp, date)
);
create index weather_daily_proj_date_brin on obs.weather_daily_proj using brin (date);

create table obs.gw_level (
  station_id text not null, observed_on date not null,
  depth_m numeric, ec_dsm numeric, source text,
  geom extensions.geometry(Point,4326),
  primary key (station_id, observed_on)
);
create index gw_level_geom_gist on obs.gw_level using gist (geom);

create table obs.reservoir_storage (
  water_body_id int, thaiwater_id text not null, observed_on date not null,
  storage_mcm numeric, storage_pct numeric, inflow_mcm numeric, outflow_mcm numeric,
  primary key (thaiwater_id, observed_on)
);

create table obs.water_quality (
  station_id text not null, observed_at timestamptz not null,
  ec_dsm numeric, salinity_gl numeric, do_mgl numeric, ph numeric, source text,
  geom extensions.geometry(Point,4326),
  primary key (station_id, observed_at)
);
create index water_quality_geom_gist on obs.water_quality using gist (geom);

-- field_id FK added after app.fields exists (below)
create table obs.sat_indices (
  field_id uuid not null, date date not null,
  ndvi numeric, ndwi numeric, si numeric,
  primary key (field_id, date)
);

-- ===================================================================== meta
create table meta.data_sources (
  id serial primary key,
  code text unique not null,
  name_th text, url text, license text, attribution_th text, scale text,
  target_tables text[],
  refresh_tier text check (refresh_tier in ('daily','quarterly','semiannual','static','manual')),
  status text check (status in ('ok','limited','placeholder','unavailable')),
  last_checksum text, last_success_at timestamptz, next_run_at timestamptz
);

create table meta.data_snapshots (
  id bigserial primary key,
  source_code text not null references meta.data_sources(code),
  version text not null,
  checksum text, row_count int,
  bbox extensions.geometry(Polygon,4326),
  changed_area extensions.geometry(MultiPolygon,4326),   -- used to find fields to recompute
  storage_path text,
  created_at timestamptz not null default now()
);
create index data_snapshots_source_idx on meta.data_snapshots (source_code, created_at desc, id desc);
create index data_snapshots_changed_area_gist on meta.data_snapshots using gist (changed_area);
create index data_snapshots_bbox_gist on meta.data_snapshots using gist (bbox);

create table meta.ingest_jobs (
  id bigserial primary key, source_code text, started_at timestamptz, finished_at timestamptz,
  rows int, status text, log text
);
create table meta.model_versions (version text primary key, components jsonb, released_at timestamptz default now());
create table meta.api_clients (id uuid primary key default gen_random_uuid(), name text, key_hash text, quota_per_day int);

-- ===================================================================== app
create table app.fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  geom extensions.geometry(Polygon,4326) not null,          -- the 4 points the user pinned
  vertices jsonb not null,                                  -- [{lat,lng}] in sorted order
  area_rai numeric generated always as (extensions.st_area(geom::extensions.geography) / 1600.0) stored,
  centroid extensions.geometry(Point,4326) generated always as (extensions.st_centroid(geom)) stored,
  province_code text, district_code text, subdistrict_code text,
  is_demo boolean not null default false,                   -- public read-only demo field (landing page)
  created_at timestamptz not null default now()
);
create index fields_geom_gist on app.fields using gist (geom);
create index fields_centroid_gist on app.fields using gist (centroid);
create index fields_user_idx on app.fields (user_id);
create index fields_demo_idx on app.fields (is_demo) where is_demo;

create table app.field_practices (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references app.fields(id) on delete cascade,
  season_year int,
  season text check (season in ('wet','dry1','dry2')),
  variety text, plant_date date, establishment text, water_source text,
  water_regime text check (water_regime in ('continuous','awd','rainfed')),
  n_kg_rai numeric, organic_t_rai numeric, straw_burn boolean,
  created_at timestamptz not null default now()
);
create index field_practices_field_idx on app.field_practices (field_id);

create table app.field_observations (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references app.fields(id) on delete cascade,
  observed_on date,
  kind text check (kind in ('yield','ec_soil','ec_water')),
  value numeric, unit text,
  created_at timestamptz not null default now()
);
create index field_observations_field_idx on app.field_observations (field_id);

alter table obs.sat_indices
  add constraint sat_indices_field_fk foreign key (field_id) references app.fields(id) on delete cascade;

-- ===================================================================== sim
create table sim.field_profile (
  field_id uuid primary key references app.fields(id) on delete cascade,
  profile jsonb not null,
  data_versions jsonb,
  computed_at timestamptz not null default now()
);
create table sim.scenarios (id text primary key, label_th text, ssp text, management jsonb);
create table sim.model_runs (
  id uuid primary key default gen_random_uuid(),
  field_id uuid references app.fields(id) on delete cascade,
  scenario_id text references sim.scenarios(id),
  model_version text not null,
  input_hash text not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  is_stale boolean not null default false,
  run_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  unique (field_id, scenario_id, input_hash)
);
create index model_runs_field_idx on sim.model_runs (field_id);
create table sim.results_season (
  run_id uuid references sim.model_runs(id) on delete cascade,
  year int, season text,
  water_avail_mm numeric, irrigation_need_mm numeric, deficit_days int,
  yield_p10 numeric, yield_p50 numeric, yield_p90 numeric,
  ch4_kg_ha numeric, n2o_kg_ha numeric, co2e_t_ha numeric,
  ece_p10 numeric, ece_p50 numeric, ece_p90 numeric, salinity_class text,
  primary key (run_id, year, season)
);
create table sim.results_daily (
  run_id uuid references sim.model_runs(id) on delete cascade,
  date date, w_mm numeric, ece_dsm numeric, lai numeric,
  primary key (run_id, date)
);

-- Scenario catalogue (reference config, lives in migration so every env has it)
insert into sim.scenarios (id, label_th, ssp, management) values
  ('baseline',      'แบบเดิม (ขังน้ำต่อเนื่อง)',      null, '{"water_regime":"continuous"}'),
  ('awd',           'เปียกสลับแห้ง (AWD)',           null, '{"water_regime":"awd"}'),
  ('salt_tolerant', 'พันธุ์ทนเค็ม',                    null, '{"variety":"RD47"}'),
  ('farm_pond',     'ขุดสระในไร่นา',                  null, '{"farm_pond":{"area_pct":0.05,"depth_m":3}}'),
  ('bund_trees',    'ปลูกไม้ยืนต้นบนคันนา/พื้นที่รับน้ำ', null, '{"bund_trees":true}')
on conflict (id) do nothing;

insert into meta.model_versions (version, components) values
  ('0.1.0', '{"water":"bucket-fao56","yield":"maas-hoffman","ghg":"ipcc2019-tier1","salinity":"rule-based"}')
on conflict do nothing;

-- Grants: app is exposed through PostgREST (RLS decides rows). Others: none.
grant select on app.fields, app.field_practices, app.field_observations to anon;
grant select, insert, update, delete on app.fields, app.field_practices, app.field_observations to authenticated;
revoke all on all tables in schema ref, obs, sim, meta, staging, archive from anon, authenticated;
