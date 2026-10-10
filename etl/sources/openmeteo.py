"""Open-Meteo API → obs.weather_daily (daily tier) at the 0.1° weather grid (D-012).

* Points = 0.1° cell centres touching the bbox (pilot = 80 points, nationwide ≈ 4,300 land+sea
  centres; filter to ref.weather_grid when it exists). Points are also merged into ref.weather_grid.
* Window: --start/--end (default: last 7 complete days, Asia/Bangkok). Forecast API serves the
  recent past (`start_date/end_date` ≤ 92 days back); older windows use the archive API.
* Budget (free tier ~10,000 calls/day; >10 variables or >14 days count as several calls):
  7 variables × ≤14 days = 1 call per location → pilot 80/day, nationwide ≈ 4,300/day.
* wind: 10 m mean → 2 m with FAO-56 eq. 47 (× 0.748). ET0 = Open-Meteo FAO-56 Penman-Monteith.
"""
from __future__ import annotations

import json
import logging
import math
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import psycopg
from shapely.geometry import Point

from lib import http
from lib.config import RunContext
from lib.grid import weather_points
from sources.base import MERGE, CheckResult, Rows, Source, Target

log = logging.getLogger("etl.openmeteo")

FORECAST = "https://api.open-meteo.com/v1/forecast"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
DAILY = ("temperature_2m_min,temperature_2m_max,precipitation_sum,relative_humidity_2m_mean,"
         "wind_speed_10m_mean,shortwave_radiation_sum,et0_fao_evapotranspiration")
U10_TO_U2 = 4.87 / math.log(67.8 * 10 - 5.42)  # FAO-56 eq. 47 ≈ 0.748
BATCH = 50  # locations per request (URL length; each location is billed separately anyway)
ICT = timezone(timedelta(hours=7))

WEATHER_RANGES = {
    "tmin": (-5, 45), "tmax": (0, 50), "rain_mm": (0, 600), "rh": (0, 100),
    "wind_ms": (0, 40), "srad_mj": (0, 45), "et0_mm": (0, 15),
}


def weather_targets() -> list[Target]:
    return [
        Target(table="weather_grid", mode=MERGE, key=("id",), geom_type="point", required=("lat", "lon")),
        Target(table="weather_daily", schema="obs", mode=MERGE, key=("weather_grid_id", "date"), has_geom=False,
               required=("weather_grid_id", "date", "tmin", "tmax", "rain_mm"), ranges=WEATHER_RANGES),
    ]


def grid_points(ctx: RunContext) -> list[tuple[int, float, float]]:
    """0.1° points for the bbox. Nationwide: only points already in ref.weather_grid (land mask)
    if that table has >1,000 rows, else every centre in the Thailand bbox that falls in a province."""
    pts = list(weather_points(ctx.bbox))
    if not ctx.nationwide:
        return pts
    with psycopg.connect(ctx.database_url) as conn:
        conn.execute("set search_path = public, extensions")
        ids = {r[0] for r in conn.execute(
            f"select w.id from {ctx.schemas.ref}.weather_grid w").fetchall()}
        if len(ids) > 1000:
            return [p for p in pts if p[0] in ids]
        land = {r[0] for r in conn.execute(
            f"select distinct x.id from unnest(%s::int[], %s::float8[], %s::float8[]) x(id, lat, lon) "
            f"join {ctx.schemas.ref}.admin_boundaries a on a.level = 'province' "
            "and ST_DWithin(a.geom, ST_SetSRID(ST_MakePoint(x.lon, x.lat), 4326), 0.07)",
            ([p[0] for p in pts], [p[1] for p in pts], [p[2] for p in pts])).fetchall()}
    return [p for p in pts if p[0] in land]


def window(ctx: RunContext, default_days: int = 7) -> tuple[date, date]:
    today = datetime.now(ICT).date()
    end = date.fromisoformat(ctx.options["end"]) if ctx.options.get("end") else today - timedelta(days=1)
    start = date.fromisoformat(ctx.options["start"]) if ctx.options.get("start") else end - timedelta(days=default_days - 1)
    return start, end


def parse_daily(payload, ids: list[int], source: str):
    items = payload if isinstance(payload, list) else [payload]
    def val(d: dict, name: str, k: int):
        arr = d.get(name) or []
        return arr[k] if k < len(arr) else None

    if len(items) != len(ids):
        raise ValueError(f"open-meteo returned {len(items)} locations for {len(ids)} requested")
    for wid, it in zip(ids, items, strict=True):
        d = it.get("daily") or {}
        for k, day in enumerate(d.get("time") or []):
            def v(name, d=d, k=k):
                return val(d, name, k)
            wind = v("wind_speed_10m_mean")
            yield (wid, day, v("temperature_2m_min"), v("temperature_2m_max"), v("precipitation_sum"),
                   v("relative_humidity_2m_mean"), round(wind * U10_TO_U2, 2) if wind is not None else None,
                   v("shortwave_radiation_sum"), v("et0_fao_evapotranspiration"), source)


DAILY_COLS = ["weather_grid_id", "date", "tmin", "tmax", "rain_mm", "rh", "wind_ms", "srad_mj", "et0_mm", "source"]


class OpenMeteoDaily(Source):
    code = "open_meteo"
    tier = "daily"
    attribution = "Weather data by Open-Meteo.com (CC BY 4.0)"
    targets = weather_targets()
    source_tag = "open_meteo"

    def check(self, ctx: RunContext) -> CheckResult:
        s, e = window(ctx)
        # The window moves daily; re-running the same day is skipped (idempotent upsert anyway).
        return CheckResult(token=f"{s}..{e}", info={"start": str(s), "end": str(e)})

    def _requests(self, ctx: RunContext, pts, s: date, e: date):
        days_back = (datetime.now(ICT).date() - s).days
        url = FORECAST if days_back <= 92 else ARCHIVE
        for k in range(0, len(pts), BATCH):
            chunk = pts[k: k + BATCH]
            params = {
                "latitude": ",".join(f"{p[1]:.2f}" for p in chunk),
                "longitude": ",".join(f"{p[2]:.2f}" for p in chunk),
                "daily": DAILY, "start_date": str(s), "end_date": str(e),
                "timezone": "Asia/Bangkok", "wind_speed_unit": "ms",
            }
            yield url, params, [p[0] for p in chunk]

    def fetch(self, ctx: RunContext) -> list[Path]:
        s, e = window(ctx)
        pts = grid_points(ctx)
        raw = ctx.raw_dir(self.code)
        (raw / "points.json").write_text(json.dumps(pts))
        out = [raw / "points.json"]
        for n, (url, params, ids) in enumerate(self._requests(ctx, pts, s, e)):
            payload = http.get_json(url, params=params)
            p = raw / f"daily_{s}_{e}_{n:03d}.json"
            p.write_text(json.dumps({"ids": ids, "payload": payload}))
            out.append(p)
            time.sleep(1.0)
        log.info("  open-meteo: %d points, %s..%s, %d requests", len(pts), s, e, len(out) - 1)
        return out

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:
        pts_file = next(f for f in files if f.name == "points.json")
        pts = json.loads(pts_file.read_text())

        def grid_rows():
            for wid, lat, lon in pts:
                yield (wid, lat, lon, Point(lon, lat).wkb)

        def daily_rows():
            for f in files:
                if f.name.startswith("daily_"):
                    d = json.loads(f.read_text())
                    yield from parse_daily(d["payload"], d["ids"], self.source_tag)

        return {
            "weather_grid": Rows(["id", "lat", "lon", "geom"], grid_rows()),
            "weather_daily": Rows(DAILY_COLS, daily_rows(), has_geom=False),
        }
