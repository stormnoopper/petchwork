-- D-033 · Weather measurements numeric → real (float4) to fit the Supabase Free 500 MB database.
-- ~7 significant digits is far beyond sensor/reanalysis precision (0.01 °C, 0.01 mm). ~25% smaller heap.
alter table obs.weather_daily
  alter column tmin    type real,
  alter column tmax    type real,
  alter column rain_mm type real,
  alter column rh      type real,
  alter column wind_ms type real,
  alter column srad_mj type real,
  alter column et0_mm  type real;

alter table obs.weather_daily_proj
  alter column tmin    type real,
  alter column tmax    type real,
  alter column rain_mm type real,
  alter column rh      type real,
  alter column wind_ms type real,
  alter column srad_mj type real,
  alter column et0_mm  type real;

-- weather_series passes real tmin/tmax → overload that forwards to the numeric implementation
create or replace function meta.et0_hargreaves(p_lat numeric, p_date date, p_tmin real, p_tmax real)
returns numeric
language sql immutable
set search_path = ''
as $$ select meta.et0_hargreaves(p_lat, p_date, p_tmin::numeric, p_tmax::numeric) $$;
revoke all on function meta.et0_hargreaves(numeric, date, real, real) from public;
