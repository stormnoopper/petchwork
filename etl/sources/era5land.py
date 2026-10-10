"""ERA5-Land backfill → obs.weather_daily (static tier, D-004).

Two paths:
1. **Pilot / small bbox (implemented):** Open-Meteo archive API, `models=era5_seamless`
   (ERA5-Land 0.1° for temperature/humidity + ERA5 for precipitation/radiation/wind, which the
   `era5_land`-only model leaves null in daily aggregates). Chunked ≤10 locations × ≤1 year per
   request with a pause, and refused when the estimated call weight exceeds
   ETL_OPENMETEO_BUDGET (default 8,000 of the ~10,000/day free tier).
   Pilot 80 points × 2 years ≈ 80 × ⌈731/14⌉ = 4,240 weighted calls (one day's budget).
2. **Nationwide (design, not run here):** ~4,300 points × 20 y via the API ≈ 2.2 M calls (D-004)
   → read the Open-Meteo open-data mirror `s3://openmeteo/data/copernicus_era5_land/` (.om files,
   `omfiles` reader, no key) or Copernicus CDS `reanalysis-era5-land` NetCDF (CDS account,
   `cdsapi`), aggregate hourly→daily (tmin/tmax/rain sum/rh mean/u2/srad sum, ET0 via FAO-56 PM),
   then the same MERGE target. Runs as a Cloud Run Job (> 6 h GitHub Actions limit, SPEC §13).
   Until implemented, `--nationwide` returns skipped: 'use_bulk_s3'.
"""
from __future__ import annotations

import json
import logging
import math
import os
import time
from datetime import date, datetime, timedelta
from pathlib import Path

from lib import http
from lib.config import RunContext
from sources.base import CheckResult, Rows, Source
from sources.openmeteo import ARCHIVE, DAILY, DAILY_COLS, ICT, grid_points, parse_daily, weather_targets

log = logging.getLogger("etl.era5land")

LOC_PER_REQ = 10
MAX_DAYS_PER_REQ = 366
PAUSE_S = float(os.environ.get("ETL_OPENMETEO_PAUSE_S", "30"))  # stay under 600 weighted calls/min


def default_window(ctx: RunContext) -> tuple[date, date]:
    end = date.fromisoformat(ctx.options["end"]) if ctx.options.get("end") else datetime.now(ICT).date() - timedelta(days=7)
    start = date.fromisoformat(ctx.options["start"]) if ctx.options.get("start") else end - timedelta(days=730)
    return start, end


def call_weight(n_locations: int, days: int, n_vars: int = 7) -> int:
    return n_locations * math.ceil(days / 14) * math.ceil(n_vars / 10)


class Era5LandBackfill(Source):
    code = "era5_land"
    tier = "static"
    attribution = "ERA5-Land, Copernicus Climate Change Service (via Open-Meteo.com, CC BY 4.0)"
    targets = weather_targets()

    def check(self, ctx: RunContext) -> CheckResult:
        if ctx.nationwide and not ctx.options.get("allow_api_backfill"):
            return CheckResult(skip_reason="use_bulk_s3: nationwide ERA5-Land backfill must read "
                                           "s3://openmeteo/data/copernicus_era5_land (see era5land.py / README)")
        s, e = default_window(ctx)
        pts = grid_points(ctx)
        weight = call_weight(len(pts), (e - s).days + 1)
        budget = int(os.environ.get("ETL_OPENMETEO_BUDGET", "8000"))
        info = {"start": str(s), "end": str(e), "points": len(pts), "estimated_calls": weight, "budget": budget}
        if weight > budget:
            return CheckResult(skip_reason=f"over_budget: {weight} weighted calls > {budget}", info=info)
        return CheckResult(token=f"{s}..{e}|{len(pts)}", info=info)

    def fetch(self, ctx: RunContext) -> list[Path]:
        s, e = default_window(ctx)
        pts = grid_points(ctx)
        raw = ctx.raw_dir(self.code)
        (raw / "points.json").write_text(json.dumps(pts))
        out = [raw / "points.json"]
        spans = []
        cur = s
        while cur <= e:
            end = min(e, cur + timedelta(days=MAX_DAYS_PER_REQ - 1))
            spans.append((cur, end))
            cur = end + timedelta(days=1)
        n = 0
        for a, b in spans:
            for k in range(0, len(pts), LOC_PER_REQ):
                chunk = pts[k: k + LOC_PER_REQ]
                p = raw / f"daily_{a}_{b}_{k:04d}.json"
                if not p.exists():  # resumable
                    if n:
                        time.sleep(PAUSE_S)
                    params = {
                        "latitude": ",".join(f"{x[1]:.2f}" for x in chunk),
                        "longitude": ",".join(f"{x[2]:.2f}" for x in chunk),
                        "daily": DAILY, "start_date": str(a), "end_date": str(b),
                        "timezone": "Asia/Bangkok", "wind_speed_unit": "ms", "models": "era5_seamless",
                    }
                    payload = http.get_json(ARCHIVE, params=params, backoff=20)
                    p.write_text(json.dumps({"ids": [x[0] for x in chunk], "payload": payload}))
                    n += 1
                    log.info("  era5 %s..%s points %d-%d done", a, b, k, k + len(chunk) - 1)
                out.append(p)
        return out

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:
        from shapely.geometry import Point

        pts = json.loads(next(f for f in files if f.name == "points.json").read_text())

        def daily_rows():
            for f in files:
                if f.name.startswith("daily_"):
                    d = json.loads(f.read_text())
                    yield from parse_daily(d["payload"], d["ids"], "era5_land")

        return {
            "weather_grid": Rows(["id", "lat", "lon", "geom"], ((w, la, lo, Point(lo, la).wkb) for w, la, lo in pts)),
            "weather_daily": Rows(DAILY_COLS, daily_rows(), has_geom=False),
        }
