-- ETL support (etl-engineer handoff, Wave 2)

create table if not exists obs.rain_station_daily (
  station_id   text not null,
  observed_at  timestamptz not null,
  rain_24h_mm  numeric,
  province_code text,
  agency       text,
  geom         extensions.geometry(Point, 4326),
  source       text default 'thaiwater',
  primary key (station_id, observed_at)
);
create index if not exists rain_station_daily_geom_gist on obs.rain_station_daily using gist (geom);

alter table ref.groundwater_zones add column if not exists aquifer_unit text;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pgmq') then
    perform pgmq.create('profile_refresh');
  end if;
end $$;
