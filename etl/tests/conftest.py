"""Test fixtures. DB tests use ONLY throwaway schemas test_ref / test_staging / test_archive / test_meta
created and dropped here — real ref.* / meta.* are never written (only read, e.g. seed grid ids)."""
from __future__ import annotations

import sys
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
import pytest
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.config import RunContext, Schemas, database_url  # noqa: E402
from sources.base import CheckResult, Rows, Source, Target  # noqa: E402

TEST_SCHEMAS = Schemas(ref="test_ref", obs="test_ref", staging="test_staging", archive="test_archive",
                       meta="test_meta", app="test_app", sim="test_sim")

DDL = """
drop schema if exists test_ref, test_staging, test_archive, test_meta cascade;
create schema test_ref; create schema test_staging; create schema test_archive; create schema test_meta;
create table test_meta.data_sources (
  id serial primary key, code text unique not null, refresh_tier text,
  last_checksum text, last_success_at timestamptz, next_run_at timestamptz);
create table test_meta.data_snapshots (
  id bigserial primary key, source_code text not null references test_meta.data_sources(code),
  version text not null, checksum text, row_count int,
  bbox extensions.geometry(Polygon,4326), changed_area extensions.geometry(MultiPolygon,4326),
  storage_path text, created_at timestamptz not null default now());
create table test_meta.ingest_jobs (
  id bigserial primary key, source_code text, started_at timestamptz, finished_at timestamptz,
  rows int, status text, log text);
create table test_ref.zones (
  id serial primary key, name text not null, val numeric, source_id int,
  geom extensions.geometry(MultiPolygon,4326) not null);
create index zones_geom_gist on test_ref.zones using gist (geom);
create index zones_name_idx on test_ref.zones (name);
insert into test_meta.data_sources (code, refresh_tier) values ('test_fake', 'quarterly');
"""


def db_available() -> bool:
    try:
        with psycopg.connect(database_url(), connect_timeout=3):
            return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def dsn() -> str:
    if not db_available():
        pytest.skip("local Postgres not reachable (DATABASE_URL)")
    return database_url()


@pytest.fixture()
def test_db(dsn) -> Iterator[psycopg.Connection]:
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute("set search_path = public, extensions")
        conn.execute(DDL)
        try:
            yield conn
        finally:
            conn.execute("drop schema if exists test_ref, test_staging, test_archive, test_meta cascade")


class FakeSource(Source):
    """n squares along a row in the pilot bbox; token controls change detection."""

    code = "test_fake"
    tier = "quarterly"

    def __init__(self, n: int, token: str = "A", val: float = 1.0, **target_kw):
        self.n, self.token, self.val = n, token, val
        self.targets = [Target(table="zones", keep_where=None, required=("name",), ranges={"val": (0, 50)},
                               **target_kw)]

    def check(self, ctx):
        return CheckResult(token=self.token)

    def fetch(self, ctx):
        p = ctx.raw_dir(self.code) / f"fake_{self.token}.txt"
        p.write_text(f"{self.n}:{self.token}:{self.val}")
        return [p]

    def produce(self, ctx, files):
        rows = [(f"z{k}", self.val, box(103.0 + k * 0.01, 16.0, 103.0 + (k + 1) * 0.01, 16.01).wkb)
                for k in range(self.n)]
        return {"zones": Rows(["name", "val", "geom"], rows)}


_clock = [datetime(2026, 1, 1, tzinfo=timezone.utc)]


def make_ctx(tmp_path, dsn, **kw) -> RunContext:
    _clock[0] += timedelta(seconds=1)  # distinct snapshot versions per run
    return RunContext(schemas=TEST_SCHEMAS, raw_root=tmp_path / "raw", recompute=False, notify=False,
                      database_url=dsn, started_at=_clock[0], **kw)
