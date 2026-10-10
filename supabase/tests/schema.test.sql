-- Schema invariants: extensions, schemas, partitions, GIST everywhere, RLS on app.*, seed shape
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_extension('postgis', 'postgis installed');
select ok(exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
                  where e.extname = 'postgis' and n.nspname = 'extensions'), 'postgis lives in schema extensions');
select is((select count(*)::int from pg_namespace
            where nspname in ('ref','obs','app','sim','meta','staging','archive')), 7, 'all 7 project schemas exist');

select is((select count(*)::int from pg_inherits i join pg_class p on p.oid = i.inhparent
            join pg_namespace n on n.oid = p.relnamespace
           where n.nspname = 'obs' and p.relname = 'weather_daily'), 37, 'weather_daily has 37 yearly partitions (2000–2036)');
select ok(exists (select 1 from pg_indexes where schemaname = 'obs' and tablename = 'weather_daily'
                  and indexdef ilike '%using brin (date)%'), 'BRIN index on weather_daily.date');

-- every geometry column (non-partition, non-staging) has a GIST index
select is((
  select count(*)::int from extensions.geometry_columns gc
   where gc.f_table_schema in ('ref','obs','app','meta')
     and not exists (
       select 1 from pg_index ix
         join pg_class t on t.oid = ix.indrelid
         join pg_namespace n on n.oid = t.relnamespace
         join pg_class ic on ic.oid = ix.indexrelid
         join pg_am am on am.oid = ic.relam
         join pg_attribute a on a.attrelid = t.oid and a.attnum = any(ix.indkey)
        where n.nspname = gc.f_table_schema and t.relname = gc.f_table_name
          and a.attname = gc.f_geometry_column and am.amname = 'gist')
), 0, 'every geometry column has a GIST index');

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app' and c.relkind = 'r' and not c.relrowsecurity), 0, 'RLS enabled on every app.* table');

select is((select array_agg(id order by id) from sim.scenarios),
          array['awd','baseline','bund_trees','farm_pond','salt_tolerant'], 'sim.scenarios seeded with 5 ids');

select has_column('meta', 'data_sources', 'refresh_tier', '§6.1 alteration: data_sources.refresh_tier');
select has_column('sim', 'model_runs', 'is_stale', '§6.1 alteration: model_runs.is_stale');
select has_table('meta', 'data_snapshots', 'meta.data_snapshots exists');

-- LDD placeholder: these tables exist and the seed leaves them empty
select is((select count(*)::int from ref.soil_units), 0, 'ref.soil_units empty (LDD placeholder)');
select is((select count(*)::int from ref.saline_soil_zones), 0, 'ref.saline_soil_zones empty (LDD placeholder)');

-- API roles cannot touch non-exposed schemas directly
select ok(not has_schema_privilege('anon', 'ref', 'usage') and not has_schema_privilege('authenticated', 'sim', 'usage'),
          'anon/authenticated have no usage on ref / sim');

select * from finish();
rollback;
