-- SPEC §7.4 — public RPCs (security definer, fixed search_path).
-- Result shapes follow packages/contracts (contracts win over SPEC SQL):
--   analyze_polygon      -> AnalyzeRpcResult (FieldProfile | AnalyzeRpcError)
--   weather_series       -> WeatherDay[]   (returned as ONE jsonb array → not cut by PostgREST max_rows)
--   enabled_provinces    -> { province_code, name_th }[]
--   data_snapshots_latest-> { source_code, version, created_at }[]
--   mvt_tile             -> bytea (Mapbox Vector Tile), layer whitelist = MVT_LAYERS.
--                           Return type is a bytea DOMAIN named "application/vnd.mapbox-vector-tile"
--                           = PostgREST media-type handler: request with that Accept header to get raw
--                           bytes; Accept: application/json still returns the hex string.
--   enqueue_twin_run     -> uuid run_id   (Phase 2 stub: ownership + sim.model_runs + pgmq if present)
--   field_results        -> jsonb         (Phase 2 stub: ownership/demo check + runs + seasons)

-- ===================================================================== helpers (meta, not exposed)

-- Latest snapshot version per source, as { source_code: version }
create or replace function meta.latest_data_versions()
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.source_code, s.version), '{}'::jsonb)
  from (
    select distinct on (d.source_code) d.source_code, d.version
    from meta.data_snapshots d
    order by d.source_code, d.created_at desc, d.id desc
  ) s;
$$;

-- Hargreaves ET0 (mm/day) — only used when obs.weather_daily.et0_mm is null (FAO-56 eq. 52)
create or replace function meta.et0_hargreaves(p_lat numeric, p_date date, p_tmin numeric, p_tmax numeric)
returns numeric
language plpgsql immutable
set search_path = ''
as $$
declare
  j float8; dr float8; sdec float8; phi float8; ws float8; ra float8;
begin
  if p_lat is null or p_tmin is null or p_tmax is null or p_tmax < p_tmin then
    return null;
  end if;
  j   := extract(doy from p_date);
  dr  := 1 + 0.033 * cos(2 * pi() * j / 365);
  sdec := 0.409 * sin(2 * pi() * j / 365 - 1.39);
  phi := radians(p_lat::float8);
  ws  := acos(greatest(-1, least(1, -tan(phi) * tan(sdec))));
  ra  := 24 * 60 / pi() * 0.0820 * dr * (ws * sin(phi) * sin(sdec) + cos(phi) * cos(sdec) * sin(ws));
  return round((0.0023 * ((p_tmin + p_tmax) / 2 + 17.8) * sqrt(p_tmax - p_tmin) * ra * 0.408)::numeric, 2);
end $$;

-- ===================================================================== analyze_polygon

create or replace function public.analyze_polygon(p_geojson jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_json   jsonb := p_geojson;
  g        geometry;
  v_pt     geometry;
  v_area   float8;
  prov     record;
  result   jsonb;
begin
  -- accept a GeoJSON Feature as well as a bare geometry
  if v_json ? 'geometry' then
    v_json := v_json -> 'geometry';
  end if;

  begin
    g := ST_SetSRID(ST_GeomFromGeoJSON(v_json::text), 4326);
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'INVALID_POLYGON');
  end;

  if g is null or GeometryType(g) not in ('POLYGON', 'MULTIPOLYGON') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_POLYGON');
  end if;
  if ST_XMin(g) < -180 or ST_XMax(g) > 180 or ST_YMin(g) < -90 or ST_YMax(g) > 90 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_POLYGON');
  end if;

  g := ST_CollectionExtract(ST_MakeValid(g), 3);
  if g is null or ST_IsEmpty(g) then
    return jsonb_build_object('ok', false, 'error', 'INVALID_POLYGON');
  end if;

  v_area := ST_Area(g::geography);
  -- guard: > 50 km² (31,250 rai) is not a paddy field and would be expensive
  if v_area <= 0 or v_area > 50e6 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_POLYGON');
  end if;

  v_pt := ST_PointOnSurface(g);

  select b.code, b.name_th, coalesce(c.enabled, false) as enabled
    into prov
    from ref.admin_boundaries b
    left join ref.province_coverage c on c.province_code = b.code
   where b.level = 'province' and ST_Intersects(b.geom, v_pt)
   order by b.code
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'OUTSIDE_THAILAND');
  end if;
  if not prov.enabled then
    return jsonb_build_object('ok', false, 'error', 'PROVINCE_NOT_ENABLED',
                              'province_code', prov.code, 'province_name_th', prov.name_th);
  end if;

  with
  sub as (
    select b.code, b.name_th from ref.admin_boundaries b
     where b.level = 'subdistrict' and ST_Intersects(b.geom, v_pt) order by b.code limit 1
  ),
  dist as (
    select b.code, b.name_th from ref.admin_boundaries b
     where b.level = 'district' and ST_Intersects(b.geom, v_pt) order by b.code limit 1
  ),
  soil as (
    select s.soil_group, s.texture, s.ksat_mm_day, s.awc_mm_m,
           least(1.0, ST_Area(ST_Intersection(s.geom, g)::geography) / v_area) as w
      from ref.soil_units s where ST_Intersects(s.geom, g)
  ),
  saline as (
    select z.salinity_level,
           least(1.0, ST_Area(ST_Intersection(z.geom, g)::geography) / v_area) as w
      from ref.saline_soil_zones z where ST_Intersects(z.geom, g)
  ),
  gw as (
    select z.ec_dsm, z.depth_m, z.quality_class,
           least(1.0, ST_Area(ST_Intersection(z.geom, g)::geography) / v_area) as w
      from ref.groundwater_zones z where ST_Intersects(z.geom, g)
  ),
  geo as (
    select u.unit_code, u.is_maha_sarakham, u.rock_salt_depth_m,
           least(1.0, ST_Area(ST_Intersection(u.geom, g)::geography) / v_area) as w
      from ref.geology_units u where ST_Intersects(u.geom, g)
  ),
  cells as (
    -- planar area is fine for relative weights inside a ≤ 50 km² polygon
    select c.*, ST_Area(ST_Intersection(c.geom, g)) as a
      from ref.grid_cells c where ST_Intersects(c.geom, g)
  ),
  grid as (
    select
      count(*) as n,
      sum(elev_m * a)         / nullif(sum(a) filter (where elev_m is not null), 0)         as elev_m,
      sum(sg_clay_pct * a)    / nullif(sum(a) filter (where sg_clay_pct is not null), 0)    as clay_pct,
      sum(sg_soc_gkg * a)     / nullif(sum(a) filter (where sg_soc_gkg is not null), 0)     as soc_gkg,
      sum(rain_normal_mm * a) / nullif(sum(a) filter (where rain_normal_mm is not null), 0) as rain_normal_mm,
      sum(et0_normal_mm * a)  / nullif(sum(a) filter (where et0_normal_mm is not null), 0)  as et0_normal_mm,
      sum(si_dry_season * a)  / nullif(sum(a) filter (where si_dry_season is not null), 0)  as si_dry_season,
      sum(coast_dist_km * a)  / nullif(sum(a) filter (where coast_dist_km is not null), 0)  as coast_dist_km
    from cells
  ),
  dom as (  -- dominant (largest-overlap) cell for categorical / integer values
    select plant_doy_wet, plant_doy_dry, weather_grid_id from cells order by a desc, id limit 1
  ),
  nearest as (
    select w.name, w.kind, ST_Distance(w.geom::geography, g::geography) as distance_m
      from (select * from ref.water_bodies where geom is not null order by geom <-> g limit 5) w
     order by 3 limit 1
  )
  select jsonb_build_object(
    'ok', true,
    'area_m2', round(v_area::numeric, 2),
    'area_rai', round((v_area / 1600.0)::numeric, 4),
    'admin', jsonb_build_object(
        'subdistrict_code',    (select code from sub),
        'subdistrict_name_th', (select name_th from sub),
        'district_name_th',    (select name_th from dist),
        'province_code',       prov.code,
        'province_name_th',    prov.name_th),
    'soil', coalesce((select jsonb_agg(jsonb_build_object(
        'soil_group', soil_group, 'texture', texture, 'ksat_mm_day', ksat_mm_day, 'awc_mm_m', awc_mm_m,
        'w', round(w::numeric, 6)) order by w desc) from soil), '[]'::jsonb),
    'saline', coalesce((select jsonb_agg(jsonb_build_object(
        'salinity_level', salinity_level, 'w', round(w::numeric, 6)) order by w desc) from saline), '[]'::jsonb),
    'groundwater', jsonb_build_object(
        'ec_dsm_weighted',  (select round((sum(ec_dsm * w) / nullif(sum(w) filter (where ec_dsm is not null), 0))::numeric, 3) from gw),
        'depth_m_weighted', (select round((sum(depth_m * w) / nullif(sum(w) filter (where depth_m is not null), 0))::numeric, 2) from gw),
        'parts', coalesce((select jsonb_agg(jsonb_build_object(
            'ec_dsm', ec_dsm, 'depth_m', depth_m, 'quality_class', quality_class,
            'w', round(w::numeric, 6)) order by w desc) from gw), '[]'::jsonb)),
    'geology', coalesce((select jsonb_agg(jsonb_build_object(
        'unit_code', unit_code, 'is_maha_sarakham', is_maha_sarakham, 'rock_salt_depth_m', rock_salt_depth_m,
        'w', round(w::numeric, 6)) order by w desc) from geo), '[]'::jsonb),
    'in_irrigation_zone', exists (select 1 from ref.irrigation_zones i where ST_Intersects(i.geom, g)),
    'nearest_water_body', (select jsonb_build_object('name', name, 'kind', kind,
        'distance_m', round(distance_m::numeric, 1)) from nearest),
    'grid', (select case when grid.n = 0 then null else jsonb_build_object(
        'elev_m',          round(grid.elev_m::numeric, 1),
        'clay_pct',        round(grid.clay_pct::numeric, 2),
        'soc_gkg',         round(grid.soc_gkg::numeric, 2),
        'rain_normal_mm',  round(grid.rain_normal_mm::numeric, 1),
        'et0_normal_mm',   round(grid.et0_normal_mm::numeric, 1),
        'plant_doy_wet',   (select plant_doy_wet from dom),
        'plant_doy_dry',   (select plant_doy_dry from dom),
        'si_dry_season',   round(grid.si_dry_season::numeric, 4),
        'coast_dist_km',   round(grid.coast_dist_km::numeric, 1),
        'weather_grid_id', (select weather_grid_id from dom)) end from grid),
    'coverage', (select jsonb_build_object(
        'province_code', c.province_code, 'enabled', c.enabled, 'salinity_origin', c.salinity_origin,
        'default_variety', c.default_variety, 'has_ldd_soil', c.has_ldd_soil,
        'has_ldd_saline', c.has_ldd_saline, 'has_dgr', c.has_dgr)
        from ref.province_coverage c where c.province_code = prov.code),
    -- LDD placeholder: no soil/saline rows → SoilGrids / Sentinel-2 fallback, level low
    'confidence', jsonb_build_object(
        'geology', jsonb_build_object('level', 'low', 'source', 'DMR 1:250k'),
        'groundwater', case when exists (select 1 from gw)
            then jsonb_build_object('level', 'medium', 'source', 'DGR 1:100k')
            else jsonb_build_object('level', 'low', 'source', 'fallback') end,
        'soil', case when exists (select 1 from soil)
            then jsonb_build_object('level', 'high', 'source', 'LDD 1:25k')
            else jsonb_build_object('level', 'low', 'source', 'SoilGrids 250m') end,
        'salinity', case when exists (select 1 from saline)
            then jsonb_build_object('level', 'high', 'source', 'LDD 1:25k')
            else jsonb_build_object('level', 'low', 'source', 'Sentinel-2 SI') end),
    'data_versions', meta.latest_data_versions()
  ) into result;

  return result;
end $$;

-- ===================================================================== weather_series

create or replace function public.weather_series(p_grid_id int, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_lat numeric;
begin
  if p_grid_id is null or p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_to - p_from > 7400 then   -- ~20 years max per call
    raise exception 'range too large (max 7400 days)' using errcode = '22023';
  end if;

  select lat into v_lat from ref.weather_grid where id = p_grid_id;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'date',    w.date,
             'tmin',    w.tmin,
             'tmax',    w.tmax,
             'rain_mm', coalesce(w.rain_mm, 0),
             'rh',      w.rh,
             'wind_ms', w.wind_ms,
             'srad_mj', w.srad_mj,
             'et0_mm',  coalesce(w.et0_mm, meta.et0_hargreaves(v_lat, w.date, w.tmin, w.tmax), 0)
           ) order by w.date)
      from obs.weather_daily w
     where w.weather_grid_id = p_grid_id and w.date between p_from and p_to
  ), '[]'::jsonb);
end $$;

-- ===================================================================== enabled_provinces / data_snapshots_latest

create or replace function public.enabled_provinces()
returns table (province_code text, name_th text)
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select c.province_code, b.name_th
    from ref.province_coverage c
    left join ref.admin_boundaries b on b.level = 'province' and b.code = c.province_code
   where c.enabled
   order by c.province_code;
$$;

create or replace function public.data_snapshots_latest()
returns table (source_code text, version text, created_at timestamptz)
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  select distinct on (d.source_code) d.source_code, d.version, d.created_at
    from meta.data_snapshots d
   order by d.source_code, d.created_at desc, d.id desc;
$$;

-- ===================================================================== mvt_tile

create domain public."application/vnd.mapbox-vector-tile" as bytea;

create or replace function public.mvt_tile(p_layer text, z int, x int, y int)
returns public."application/vnd.mapbox-vector-tile"
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tbl   text;
  v_props text;
  v_env   geometry;
  v_bbox  geometry;
  v_tol   float8;
  v_tile  bytea;
begin
  if z is null or x is null or y is null or z < 0 or z > 22
     or x < 0 or y < 0 or x >= (1::bigint << z) or y >= (1::bigint << z) then
    raise exception 'invalid tile %/%/%', z, x, y using errcode = '22023';
  end if;

  -- whitelist = contracts MVT_LAYERS
  case p_layer
    when 'saline_soil'  then v_tbl := 'ref.saline_soil_zones'; v_props := 'salinity_level, salt_crust_pct, salinity_origin';
    when 'soil_units'   then v_tbl := 'ref.soil_units';        v_props := 'soil_group, soil_series, texture, drainage';
    when 'groundwater'  then v_tbl := 'ref.groundwater_zones'; v_props := 'quality_class, ec_dsm, depth_m, yield_m3_hr';
    when 'geology'      then v_tbl := 'ref.geology_units';     v_props := 'unit_code, unit_name, is_maha_sarakham';
    when 'irrigation'   then v_tbl := 'ref.irrigation_zones';  v_props := 'project_name';
    when 'water_bodies' then v_tbl := 'ref.water_bodies';      v_props := 'name, kind, capacity_mcm';
    else raise exception 'unknown layer %', p_layer using errcode = '22023';
  end case;

  v_env  := ST_TileEnvelope(z, x, y);
  v_bbox := ST_Transform(v_env, 4326);
  -- simplify by zoom: half a pixel of a 256 px tile, in metres (EPSG:3857)
  v_tol  := 40075016.686 / (256 * power(2, z)) * 0.5;

  execute format($q$
    select ST_AsMVT(t, %L, 4096, 'geom', 'id')
      from (
        select id, %s,
               ST_AsMVTGeom(ST_SimplifyPreserveTopology(ST_Transform(geom, 3857), $1), $2, 4096, 64, true) as geom
          from %s
         where geom is not null and geom && $3
      ) t
     where t.geom is not null
  $q$, p_layer, v_props, v_tbl)
  into v_tile
  using v_tol, v_env, v_bbox;

  return coalesce(v_tile, ''::bytea);
end $$;

-- ===================================================================== field helpers + triggers

-- Fill admin codes from geometry (security definer: callers cannot read ref.*)
create or replace function meta.tg_fields_admin_codes()
returns trigger
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare v_pt geometry := ST_PointOnSurface(new.geom);
begin
  select code into new.province_code from ref.admin_boundaries
   where level = 'province' and ST_Intersects(geom, v_pt) order by code limit 1;
  select code into new.district_code from ref.admin_boundaries
   where level = 'district' and ST_Intersects(geom, v_pt) order by code limit 1;
  select code into new.subdistrict_code from ref.admin_boundaries
   where level = 'subdistrict' and ST_Intersects(geom, v_pt) order by code limit 1;
  return new;
end $$;

-- Snapshot analyze_polygon into sim.field_profile; geometry change marks old runs stale
create or replace function meta.tg_fields_profile()
returns trigger
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare v_profile jsonb;
begin
  v_profile := public.analyze_polygon(ST_AsGeoJSON(new.geom)::jsonb);
  insert into sim.field_profile as fp (field_id, profile, data_versions, computed_at)
  values (new.id, v_profile, v_profile -> 'data_versions', now())
  on conflict (field_id) do update
    set profile = excluded.profile, data_versions = excluded.data_versions, computed_at = now();
  if tg_op = 'UPDATE' then
    update sim.model_runs set is_stale = true where field_id = new.id and not is_stale;
  end if;
  return null;
end $$;

create trigger fields_admin_codes
  before insert or update of geom on app.fields
  for each row execute function meta.tg_fields_admin_codes();

create trigger fields_profile
  after insert or update of geom on app.fields
  for each row execute function meta.tg_fields_profile();

-- ===================================================================== Phase 2 stubs

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pgmq') then
    if not exists (select 1 from pgmq.list_queues() q where q.queue_name = 'twin_runs') then
      perform pgmq.create('twin_runs');
    end if;
  end if;
end $$;

create or replace function public.enqueue_twin_run(p_field_id uuid, p_scenario text)
returns uuid
language plpgsql volatile security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_geom  geometry;
  v_model text;
  v_hash  text;
  v_run   uuid;
  v_new   boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select user_id, geom into v_owner, v_geom from app.fields where id = p_field_id;
  if v_owner is null or v_owner <> v_uid then
    raise exception 'field not found' using errcode = '42501';
  end if;
  if not exists (select 1 from sim.scenarios where id = p_scenario) then
    raise exception 'unknown scenario %', p_scenario using errcode = '22023';
  end if;

  select version into v_model from meta.model_versions order by released_at desc nulls last, version desc limit 1;
  v_model := coalesce(v_model, 'dev');

  -- SPEC §9.5 input hash (server-side canonical form)
  v_hash := encode(sha256(convert_to(jsonb_build_object(
      'polygon', ST_AsGeoJSON(v_geom, 6)::jsonb,
      'practices', (select coalesce(jsonb_agg(to_jsonb(p) - 'id' - 'field_id' - 'created_at'
                                              order by p.season_year, p.season, p.id), '[]'::jsonb)
                      from app.field_practices p where p.field_id = p_field_id),
      'profile_data_versions', (select fp.data_versions from sim.field_profile fp where fp.field_id = p_field_id),
      'scenario', p_scenario,
      'model_version', v_model)::text, 'UTF8')), 'hex');

  insert into sim.model_runs (field_id, scenario_id, model_version, input_hash)
  values (p_field_id, p_scenario, v_model, v_hash)
  on conflict (field_id, scenario_id, input_hash) do nothing
  returning id into v_run;

  if v_run is not null then
    v_new := true;
  else
    -- same input already exists: reuse; re-queue only if it failed
    update sim.model_runs set status = 'queued', error = null, run_at = now(), finished_at = null
     where field_id = p_field_id and scenario_id = p_scenario and input_hash = v_hash and status = 'failed'
     returning id into v_run;
    v_new := v_run is not null;
    if v_run is null then
      select id into v_run from sim.model_runs
       where field_id = p_field_id and scenario_id = p_scenario and input_hash = v_hash;
    end if;
  end if;

  if v_new and exists (select 1 from pg_extension where extname = 'pgmq') then
    execute 'select pgmq.send($1, $2)' using 'twin_runs',
      jsonb_build_object('run_id', v_run, 'field_id', p_field_id, 'scenario_id', p_scenario);
  end if;

  return v_run;
end $$;

create or replace function public.field_results(p_field_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_owner uuid; v_demo boolean;
begin
  select user_id, is_demo into v_owner, v_demo from app.fields where id = p_field_id;
  if v_owner is null or not (v_demo or v_owner = auth.uid()) then
    raise exception 'field not found' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'field_id', p_field_id,
    'profile', (select fp.profile from sim.field_profile fp where fp.field_id = p_field_id),
    'computed_at', (select fp.computed_at from sim.field_profile fp where fp.field_id = p_field_id),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'run_id', r.id, 'scenario_id', r.scenario_id, 'status', r.status,
               'model_version', r.model_version, 'is_stale', r.is_stale,
               'run_at', r.run_at, 'finished_at', r.finished_at, 'error', r.error,
               'seasons', coalesce((
                 select jsonb_agg(to_jsonb(s) - 'run_id' order by s.year, s.season)
                   from sim.results_season s where s.run_id = r.id), '[]'::jsonb)
             ) order by r.scenario_id, r.run_at desc)
        from sim.model_runs r where r.field_id = p_field_id), '[]'::jsonb)
  );
end $$;

-- ===================================================================== grants

revoke all on function
  public.analyze_polygon(jsonb),
  public.weather_series(int, date, date),
  public.enabled_provinces(),
  public.data_snapshots_latest(),
  public.mvt_tile(text, int, int, int),
  public.enqueue_twin_run(uuid, text),
  public.field_results(uuid)
from public, anon, authenticated;

grant execute on function
  public.analyze_polygon(jsonb),
  public.weather_series(int, date, date),
  public.enabled_provinces(),
  public.data_snapshots_latest(),
  public.mvt_tile(text, int, int, int),
  public.field_results(uuid)
to anon, authenticated;

grant execute on function public.enqueue_twin_run(uuid, text) to authenticated;

revoke all on function meta.latest_data_versions(), meta.et0_hargreaves(numeric, date, numeric, numeric),
  meta.tg_fields_admin_codes(), meta.tg_fields_profile() from public;
