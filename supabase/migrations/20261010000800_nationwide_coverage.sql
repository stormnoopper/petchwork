-- D-029 — nationwide: every province enabled (seed_provinces.sql) + analyze_polygon works outside the
-- pre-computed 0.01° ref.grid_cells (pilot = Maha Sarakham only).
--   * no grid cell intersects the polygon → `grid` keeps the contract shape with every value null except
--     weather_grid_id = nearest ref.weather_grid point within 50 km (KNN `<->` on the gist index), else null
--   * confidence.soil / .salinity source = 'fallback' (level low) when the grid has no SoilGrids clay /
--     Sentinel-2 SI for the polygon (previously claimed 'SoilGrids 250m' / 'Sentinel-2 SI' with no data)
--   * meta.data_sources row for NASA POWER (nationwide 0.25° weather points, etl/sources/nasapower.py)
-- Contract shape unchanged (packages/contracts FieldProfile).

insert into meta.data_sources (code, name_th, url, license, attribution_th, scale, target_tables, refresh_tier, status)
values ('nasa_power', 'NASA POWER daily (community AG)', 'https://power.larc.nasa.gov/api/temporal/daily/point',
        'public domain', 'NASA POWER Project', '0.5°×0.625° (sampled at 0.25°)',
        '{ref.weather_grid,obs.weather_daily}', 'static', 'ok')
on conflict (code) do update
  set name_th = excluded.name_th, attribution_th = excluded.attribution_th, scale = excluded.scale,
      target_tables = excluded.target_tables;

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
  wx_near as (  -- D-029: outside ref.grid_cells → nearest ref.weather_grid point within 50 km (KNN on gist)
    select k.id from (
      select w.id, w.geom from ref.weather_grid w order by w.geom <-> v_pt limit 3
    ) k
     where ST_DWithin(k.geom::geography, v_pt::geography, 50000)
     order by ST_Distance(k.geom::geography, v_pt::geography), k.id
     limit 1
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
    -- D-029: no grid cell (outside the pre-computed 0.01° grid) → same shape, every value null except
    -- weather_grid_id = nearest weather point ≤ 50 km (null if none). Confidence below reflects it.
    'grid', (select case when grid.n = 0 then jsonb_build_object(
        'elev_m', null, 'clay_pct', null, 'soc_gkg', null, 'rain_normal_mm', null, 'et0_normal_mm', null,
        'plant_doy_wet', null, 'plant_doy_dry', null, 'si_dry_season', null, 'coast_dist_km', null,
        'weather_grid_id', (select id from wx_near))
      else jsonb_build_object(
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
            when (select clay_pct from grid) is not null
            then jsonb_build_object('level', 'low', 'source', 'SoilGrids 250m')
            else jsonb_build_object('level', 'low', 'source', 'fallback') end,
        'salinity', case when exists (select 1 from saline)
            then jsonb_build_object('level', 'high', 'source', 'LDD 1:25k')
            when (select si_dry_season from grid) is not null
            then jsonb_build_object('level', 'low', 'source', 'Sentinel-2 SI')
            else jsonb_build_object('level', 'low', 'source', 'fallback') end),
    'data_versions', meta.latest_data_versions()
  ) into result;

  return result;
end $$;

-- grants are unchanged by create or replace (0500 revoked public + granted anon/authenticated)
