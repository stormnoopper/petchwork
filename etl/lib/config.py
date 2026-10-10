"""Run-wide configuration: bboxes, schema names, raw dir, run context."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ETL_ROOT = Path(__file__).resolve().parent.parent
RAW_ROOT = Path(os.environ.get("ETL_RAW_DIR", ETL_ROOT / ".raw"))

# west, south, east, north (EPSG:4326)
PILOT_BBOX: tuple[float, float, float, float] = (102.85, 15.6, 103.55, 16.6)  # Maha Sarakham (44)
THAILAND_BBOX: tuple[float, float, float, float] = (97.3, 5.6, 105.7, 20.5)

# Local Supabase (D-011). Real deployments set DATABASE_URL (GitHub secret).
DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55422/postgres"

log = logging.getLogger("etl")


def database_url() -> str:
    return os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL


@dataclass(frozen=True)
class Schemas:
    """Physical schema names. Tests swap these for throwaway `test_*` schemas."""

    ref: str = "ref"
    obs: str = "obs"
    staging: str = "staging"
    archive: str = "archive"
    meta: str = "meta"
    app: str = "app"
    sim: str = "sim"

    def resolve(self, logical: str) -> str:
        return getattr(self, logical)


@dataclass
class RunContext:
    bbox: tuple[float, float, float, float] = PILOT_BBOX
    nationwide: bool = False
    dry_run: bool = False
    force: bool = False
    upload_raw: bool = False
    recompute: bool = True
    notify: bool = True
    schemas: Schemas = field(default_factory=Schemas)
    raw_root: Path = RAW_ROOT
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    # free-form per-source options from the CLI (e.g. start/end dates, provinces)
    options: dict = field(default_factory=dict)
    database_url: str = field(default_factory=database_url)

    @property
    def version(self) -> str:
        """Snapshot version = UTC timestamp of the run, e.g. 20261010T130501."""
        return self.started_at.strftime("%Y%m%dT%H%M%S")

    @property
    def run_date(self) -> str:
        return self.started_at.strftime("%Y-%m-%d")

    def raw_dir(self, source_code: str) -> Path:
        p = self.raw_root / source_code / self.run_date
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def bbox_wkt(self) -> str:
        w, s, e, n = self.bbox
        return f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"

    @property
    def scope(self) -> str:
        return "nationwide" if self.nationwide else "bbox:" + ",".join(f"{v:g}" for v in self.bbox)
