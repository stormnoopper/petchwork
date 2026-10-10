-- Raw data browser (/data, D-031): read-only public view of the reference / observation inputs.
-- ref.* / obs.* are not exposed through PostgREST, so access goes through two security-definer RPCs
-- over a fixed allow-list. User-linked tables (app.*, sim.*, obs.sat_indices) are never listed.

create or replace function public.raw_data_tables()
returns text[]
language sql immutable
set search_path = ''
as $$
  select array[
    'ref.province_coverage', 'ref.admin_boundaries', 'ref.geology_units', 'ref.groundwater_zones',
    'ref.irrigation_zones', 'ref.soil_units', 'ref.saline_soil_zones', 'ref.water_bodies',
    'ref.grid_cells', 'ref.weather_grid',
    'obs.weather_daily', 'obs.weather_daily_proj', 'obs.rain_station_daily', 'obs.water_quality',
    'obs.reservoir_storage', 'obs.gw_level'
  ]::text[];
$$;

-- Catalog: every data source + latest snapshot, and every browsable table with its row count.
create or replace function public.raw_data_catalog()
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tables jsonb := '[]'::jsonb;
  t text;
  n bigint;
  v_cols jsonb;
begin
  foreach t in array public.raw_data_tables() loop
    if t = 'obs.weather_daily' then
      -- 3M+ rows: planner estimate summed over partitions (exact count would take seconds)
      select coalesce(sum(greatest(c.reltuples, 0)), 0)::bigint into n
      from pg_inherits i join pg_class c on c.oid = i.inhrelid
      where i.inhparent = 'obs.weather_daily'::regclass;
    else
      execute format('select count(*) from %s', t) into n;
    end if;
    select coalesce(jsonb_agg(c.column_name order by c.ordinal_position), '[]'::jsonb) into v_cols
    from information_schema.columns c
    where c.table_schema || '.' || c.table_name = t and c.udt_name <> 'geometry';
    v_tables := v_tables || jsonb_build_object(
      'table', t,
      'rows', n,
      'estimated', t = 'obs.weather_daily',
      'columns', v_cols,
      'sources', (select coalesce(jsonb_agg(s.code order by s.code), '[]'::jsonb)
                  from meta.data_sources s where t = any(s.target_tables))
    );
  end loop;

  return jsonb_build_object(
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', s.code, 'name_th', s.name_th, 'url', s.url, 'license', s.license,
        'attribution_th', s.attribution_th, 'scale', s.scale, 'refresh_tier', s.refresh_tier,
        'status', s.status, 'target_tables', to_jsonb(s.target_tables),
        'last_success_at', s.last_success_at,
        'latest_version', ls.version, 'latest_rows', ls.row_count, 'latest_at', ls.created_at
      ) order by s.status = 'placeholder', s.code), '[]'::jsonb)
      from meta.data_sources s
      left join lateral (
        select d.version, d.row_count, d.created_at from meta.data_snapshots d
        where d.source_code = s.code order by d.created_at desc, d.id desc limit 1
      ) ls on true
    ),
    'tables', v_tables
  );
end;
$$;

-- Rows of one allow-listed table. Geometry is summarised (centroid lat/lon, area in rai for polygons).
-- Optional equality filter on one non-geometry column (value cast to the column type).
create or replace function public.raw_data_rows(
  p_table text,
  p_limit int default 50,
  p_offset int default 0,
  p_filter_col text default null,
  p_filter_val text default null
)
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_schema text := split_part(p_table, '.', 1);
  v_name   text := split_part(p_table, '.', 2);
  v_cols   text;
  v_names  jsonb;
  v_order  text;
  v_geo    text;
  v_where  text := '';
  v_type   text;
  v_total  bigint;
  v_rows   jsonb;
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 5000);
  v_offset int := least(greatest(coalesce(p_offset, 0), 0), 100000);
begin
  if p_table is null or not (p_table = any(public.raw_data_tables())) then
    raise exception 'unknown table %', p_table using errcode = '22023';
  end if;

  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position),
         jsonb_agg(c.column_name order by c.ordinal_position)
    into v_cols, v_names
  from information_schema.columns c
  where c.table_schema = v_schema and c.table_name = v_name and c.udt_name <> 'geometry';

  -- geometry summary (all browsable tables name their geometry column "geom")
  select case
           when gc.type in ('POINT', 'MULTIPOINT') then
             'round(st_y(st_centroid(geom))::numeric, 5) as lat, round(st_x(st_centroid(geom))::numeric, 5) as lon'
           else
             'round(st_y(st_pointonsurface(geom))::numeric, 5) as lat, round(st_x(st_pointonsurface(geom))::numeric, 5) as lon, '
             || 'round((st_area(geom::geography) / 1600)::numeric, 1) as area_rai'
         end
    into v_geo
  from extensions.geometry_columns gc
  where gc.f_table_schema = v_schema and gc.f_table_name = v_name and gc.f_geometry_column = 'geom';
  if v_geo is not null and v_names ? 'lat' then
    v_geo := null; -- table already carries lat/lon (ref.weather_grid)
  end if;
  if v_geo is not null then
    v_names := v_names || case when v_geo like '%area_rai%' then '["lat","lon","area_rai"]'::jsonb
                               else '["lat","lon"]'::jsonb end;
  end if;

  -- stable order: primary key, else first column
  select string_agg(format('%I', a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum))
    into v_order
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = p_table::regclass and i.indisprimary;
  v_order := coalesce(v_order, format('%I', v_names ->> 0));

  if p_filter_col is not null and p_filter_val is not null and p_filter_val <> '' then
    select format_type(a.atttypid, a.atttypmod) into v_type
    from pg_attribute a
    where a.attrelid = p_table::regclass and a.attname = p_filter_col and a.attnum > 0
      and not a.attisdropped and format_type(a.atttypid, a.atttypmod) not like 'geometry%';
    if v_type is null then
      raise exception 'unknown column %', p_filter_col using errcode = '22023';
    end if;
    begin
      execute format('select %L::%s', p_filter_val, v_type);
    exception when others then
      raise exception 'invalid value for %', p_filter_col using errcode = '22023';
    end;
    v_where := format(' where %I = %L::%s', p_filter_col, p_filter_val, v_type);
  end if;

  if p_table = 'obs.weather_daily' and v_where = '' then
    select coalesce(sum(greatest(c.reltuples, 0)), 0)::bigint into v_total
    from pg_inherits i join pg_class c on c.oid = i.inhrelid
    where i.inhparent = 'obs.weather_daily'::regclass;
  else
    execute format('select count(*) from %s%s', p_table, v_where) into v_total;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from (select %s%s from %s%s order by %s limit %s offset %s) r',
    v_cols, coalesce(', ' || v_geo, ''), p_table, v_where, v_order, v_limit, v_offset
  ) into v_rows;

  return jsonb_build_object(
    'table', p_table,
    'columns', v_names,
    'total', v_total,
    'estimated', p_table = 'obs.weather_daily' and v_where = '',
    'limit', v_limit,
    'offset', v_offset,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.raw_data_catalog() from public;
revoke all on function public.raw_data_rows(text, int, int, text, text) from public;
grant execute on function public.raw_data_tables() to anon, authenticated;
grant execute on function public.raw_data_catalog() to anon, authenticated;
grant execute on function public.raw_data_rows(text, int, int, text, text) to anon, authenticated;
