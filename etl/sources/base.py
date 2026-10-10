"""Uniform source interface.

A Source does only source-specific work:
    check(ctx)            -> CheckResult  (change token, or skip reason)
    fetch(ctx)            -> list[Path]   (raw files saved under ctx.raw_dir(code))
    produce(ctx, files)   -> dict[target_table, Rows]   (rows ready for COPY)
Everything else (staging DDL, geometry cleanup, validation, swap/merge, snapshot,
recompute, notify) lives in pipeline.py so all sources behave the same.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from lib.config import RunContext

# Target modes
REPLACE = "replace"          # polygon ref table: staging = kept rows + new rows → atomic swap
GRID_UPDATE = "grid_update"  # ref.grid_cells: staging = copy of ref, update columns in bbox → atomic swap
MERGE = "merge"              # time series / point tables: upsert staging → target on key, one tx
STAGE_ONLY = "stage_only"    # no live table yet (schema change requested) — stage + validate only


@dataclass
class CheckResult:
    token: str | None = None        # compared with meta.data_sources.last_checksum
    skip_reason: str | None = None  # e.g. 'no_source', 'not_implemented'
    info: dict = field(default_factory=dict)


@dataclass
class Rows:
    """Rows for one target. `geom` (if any) is WKB bytes in EPSG:`srid`, as the LAST column."""

    columns: list[str]
    rows: Iterable[tuple[Any, ...]]
    srid: int = 4326
    has_geom: bool = True


@dataclass
class Target:
    table: str                       # physical table name (same in ref/obs and staging)
    schema: str = "ref"              # logical schema ('ref' | 'obs'), resolved via ctx.schemas
    mode: str = REPLACE
    key: tuple[str, ...] = ()        # MERGE: conflict key
    simplify_tol: float = 0.0        # degrees; ST_SimplifyPreserveTopology
    geom_type: str = "multipolygon"  # 'multipolygon' | 'point' | 'polygon' | 'any'
    required: tuple[str, ...] = ()   # NOT NULL columns
    ranges: dict[str, tuple[float, float]] = field(default_factory=dict)
    coverage_flag: str | None = None  # ref.province_coverage column (e.g. 'enabled', 'has_dgr')
    # REPLACE: SQL predicate on the CURRENT live rows to keep (outside the refreshed scope).
    # Params available: %(bbox)s (WKT, 4326), %(provinces)s (text[]). None → keep nothing.
    keep_where: str | None = "not ST_Intersects(geom, ST_GeomFromText(%(bbox)s, 4326))"
    keep_where_on_seed: str | None = None  # used when the live data is still the synthetic seed
    grid_columns: tuple[str, ...] = ()     # GRID_UPDATE: columns this source owns
    min_non_null: dict[str, float] = field(default_factory=dict)  # GRID_UPDATE: frac inside bbox
    max_row_delta: float = 0.30
    ddl: str | None = None                 # STAGE_ONLY: create table statement ({schema} placeholder)
    has_geom: bool = True


class Source:
    code: str = ""          # meta.data_sources.code
    tier: str = "manual"    # default tier when meta.data_sources is unavailable
    targets: list[Target] = []
    attribution: str = ""

    def check(self, ctx: RunContext) -> CheckResult:  # pragma: no cover - interface
        raise NotImplementedError

    def fetch(self, ctx: RunContext) -> list[Path]:  # pragma: no cover - interface
        raise NotImplementedError

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:  # pragma: no cover
        raise NotImplementedError

    # Hook run inside the swap transaction (e.g. LDD sets ref.province_coverage.has_ldd_*)
    def after_swap_sql(self, ctx: RunContext) -> list[tuple[str, dict]]:
        return []

    # Hook: provinces refreshed by this run (used by keep_where %(provinces)s)
    def provinces(self, ctx: RunContext) -> list[str]:
        return ctx.options.get("provinces") or []


class StubSource(Source):
    """Phase-2 placeholder: always skipped with a clear reason."""

    reason = "not_implemented"

    def check(self, ctx: RunContext) -> CheckResult:
        return CheckResult(skip_reason=self.reason)

    def fetch(self, ctx):  # pragma: no cover
        return []

    def produce(self, ctx, files):  # pragma: no cover
        return {}
