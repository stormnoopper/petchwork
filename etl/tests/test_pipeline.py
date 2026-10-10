"""Pipeline behaviour on throwaway schemas (SPEC §12 'ETL อัตโนมัติ')."""
from __future__ import annotations

import threading
import time

import psycopg

from pipeline import ARCHIVE_KEEP, Pipeline, next_run_at
from tests.conftest import FakeSource, make_ctx


def live_rows(conn) -> list[tuple]:
    return conn.execute("select name, val, ST_AsText(geom) from test_ref.zones order by name").fetchall()


def archives(conn) -> list[str]:
    return [r[0] for r in conn.execute(
        "select tablename from pg_tables where schemaname = 'test_archive' order by 1").fetchall()]


def test_first_load_swaps_and_records(test_db, dsn, tmp_path):
    res = Pipeline(make_ctx(tmp_path, dsn)).run(FakeSource(10, "A"))
    assert res.status == "success", res.message
    assert len(live_rows(test_db)) == 10
    snap = test_db.execute("select version, row_count, bbox is not null, changed_area is not null "
                           "from test_meta.data_snapshots").fetchall()
    assert len(snap) == 1 and snap[0][1] == 10 and snap[0][2] and snap[0][3]
    src = test_db.execute("select last_checksum, last_success_at is not null, next_run_at is not null "
                          "from test_meta.data_sources").fetchone()
    assert src[0].endswith("|A") and src[1] and src[2]
    job = test_db.execute("select status, rows from test_meta.ingest_jobs").fetchone()
    assert job == ("success", 10)
    # original index names restored, serial default still works, source_id filled
    idx = {r[0] for r in test_db.execute("select indexname from pg_indexes where schemaname = 'test_ref'").fetchall()}
    assert {"zones_pkey", "zones_geom_gist", "zones_name_idx"} <= idx
    test_db.execute("insert into test_ref.zones (name, geom) values ('x', ST_Multi(ST_MakeEnvelope(0,0,1,1,4326)))")
    assert test_db.execute("select count(*) from test_ref.zones where source_id is null").fetchone()[0] == 1


def test_unchanged_source_is_skipped(test_db, dsn, tmp_path):
    assert Pipeline(make_ctx(tmp_path, dsn)).run(FakeSource(10, "A")).status == "success"
    before, arch_before = live_rows(test_db), archives(test_db)
    res = Pipeline(make_ctx(tmp_path, dsn)).run(FakeSource(10, "A"))
    assert res.status == "skipped" and res.message == "unchanged"
    assert live_rows(test_db) == before
    assert test_db.execute("select count(*) from test_meta.data_snapshots").fetchone()[0] == 1
    assert archives(test_db) == arch_before  # nothing swapped
    statuses = [r[0] for r in test_db.execute("select status from test_meta.ingest_jobs order by id").fetchall()]
    assert statuses == ["success", "skipped"]


def test_row_delta_over_30pct_blocks_swap(test_db, dsn, tmp_path):
    assert Pipeline(make_ctx(tmp_path, dsn)).run(FakeSource(10, "A")).status == "success"
    before, arch_before = live_rows(test_db), archives(test_db)
    res = Pipeline(make_ctx(tmp_path, dsn)).run(FakeSource(6, "B"))  # −40 %
    assert res.status == "blocked"
    assert "row_delta" in res.message
    assert live_rows(test_db) == before  # ref unchanged
    assert archives(test_db) == arch_before
    assert test_db.execute("select last_checksum from test_meta.data_sources").fetchone()[0].endswith("|A")
    # within ±30 % passes
    assert Pipeline(make_ctx(tmp_path, dsn)).run(FakeSource(8, "C")).status == "success"
    assert len(live_rows(test_db)) == 8


def test_value_range_and_required_block_swap(test_db, dsn, tmp_path):
    res = Pipeline(make_ctx(tmp_path, dsn)).run(FakeSource(5, "A", val=99))  # val range 0–50
    assert res.status == "blocked" and "range:val" in res.message
    assert live_rows(test_db) == []


def test_dry_run_never_swaps(test_db, dsn, tmp_path):
    res = Pipeline(make_ctx(tmp_path, dsn, dry_run=True)).run(FakeSource(7, "A"))
    assert res.status == "dry_run"
    assert live_rows(test_db) == []
    assert test_db.execute("select count(*) from test_staging.zones").fetchone()[0] == 7
    assert test_db.execute("select last_checksum from test_meta.data_sources").fetchone()[0] is None
    assert test_db.execute("select count(*) from test_meta.data_snapshots").fetchone()[0] == 0


def test_swap_keeps_at_most_two_archive_versions(test_db, dsn, tmp_path):
    for k, n in enumerate([10, 11, 12, 13, 14]):
        assert Pipeline(make_ctx(tmp_path, dsn)).run(FakeSource(n, f"T{k}")).status == "success"
    arch = archives(test_db)
    assert len(arch) == ARCHIVE_KEEP, arch
    assert all(a.startswith("zones_v") for a in arch)
    assert len(live_rows(test_db)) == 14
    # archived indexes were renamed (no name clash), newest archive holds the previous version
    newest = sorted(arch)[-1]
    assert test_db.execute(f"select count(*) from test_archive.{newest}").fetchone()[0] == 13


def test_rollback_restores_previous_version(test_db, dsn, tmp_path):
    for k, n in enumerate([10, 12]):
        assert Pipeline(make_ctx(tmp_path, dsn)).run(FakeSource(n, f"R{k}")).status == "success"
    p = Pipeline(make_ctx(tmp_path, dsn))
    with p.connect() as conn, conn.transaction():
        p.rollback_table(conn, "test_ref", "zones")
    assert len(live_rows(test_db)) == 10
    idx = {r[0] for r in test_db.execute("select indexname from pg_indexes where schemaname = 'test_ref'").fetchall()}
    assert {"zones_pkey", "zones_geom_gist", "zones_name_idx"} <= idx


def test_concurrent_reads_never_fail_during_swap(test_db, dsn, tmp_path):
    assert Pipeline(make_ctx(tmp_path, dsn)).run(FakeSource(10, "A")).status == "success"
    errors: list[str] = []
    counts: list[int] = []
    stop = threading.Event()

    def reader():
        with psycopg.connect(dsn, autocommit=True) as c:
            while not stop.is_set():
                try:
                    counts.append(c.execute(
                        "select count(*) from test_ref.zones where ST_Intersects(geom, "
                        "ST_MakeEnvelope(102, 15, 104, 17, 4326))").fetchone()[0])
                except Exception as e:  # noqa: BLE001
                    errors.append(str(e))

    th = threading.Thread(target=reader)
    th.start()
    try:
        for k, n in enumerate([11, 12, 13]):
            assert Pipeline(make_ctx(tmp_path, dsn)).run(FakeSource(n, f"C{k}")).status == "success"
            time.sleep(0.05)
    finally:
        stop.set()
        th.join()
    assert errors == []
    assert counts and min(counts) >= 10  # never an empty / half-loaded table


def test_next_run_at_tiers():
    from datetime import datetime, timezone

    now = datetime(2026, 10, 10, 13, 0, tzinfo=timezone.utc)
    assert next_run_at("daily", now) == datetime(2026, 10, 10, 19, 0, tzinfo=timezone.utc)
    assert next_run_at("quarterly", now) == datetime(2027, 1, 1, 19, 0, tzinfo=timezone.utc)
    assert next_run_at("semiannual", now) == datetime(2027, 1, 1, 19, 0, tzinfo=timezone.utc)
    assert next_run_at("static", now) is None
