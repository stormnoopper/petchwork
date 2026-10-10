-- SPEC §7.1 — extensions & schemas (v2 nationwide)
-- postgis lives in `extensions` (Supabase convention). pg_cron / pgmq are guarded:
-- if the local image lacks them the migration still succeeds and the RPCs
-- (enqueue_twin_run) detect pgmq at runtime.

create extension if not exists postgis with schema extensions;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  else
    raise notice 'pg_cron not available — skipped';
  end if;

  if exists (select 1 from pg_available_extensions where name = 'pgmq') then
    execute 'create extension if not exists pgmq';
  else
    raise notice 'pgmq not available — skipped';
  end if;
end $$;

create schema if not exists ref;      -- reference maps (read-only for clients, via RPC)
create schema if not exists obs;      -- time series
create schema if not exists app;      -- user data (exposed via PostgREST, RLS on every table)
create schema if not exists sim;      -- simulation results (never overwritten)
create schema if not exists meta;     -- data sources, ingest jobs, snapshots, model versions
create schema if not exists staging;  -- ETL stage area (SPEC §6.1 swap)
create schema if not exists archive;  -- previous versions kept for rollback

-- Only `app` is reachable by API roles; everything else goes through public RPCs.
revoke all on schema ref, obs, sim, meta, staging, archive from public, anon, authenticated;
grant usage on schema app to anon, authenticated;
