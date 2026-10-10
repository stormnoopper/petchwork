"""ThaiWater public API (สสน.) → obs.reservoir_storage, obs.water_quality (+ staged rain).

Attribution REQUIRED everywhere the data is shown: "คลังข้อมูลน้ำแห่งชาติ (สสน.)".
License is unclear (DATA_SOURCES §4) → cached backend-side only.

Endpoint (probed 2026-10-10): /public/thailand_main (≈10 MB, no key) contains
  dam.data.data[]          35 large RID reservoirs (dam_storage MCM, %, inflow, released)
  waterquality.data.data[] ~18 telemetry stations (salinity g/L, conductivity µS/cm, DO, pH)
  rain.data.data[]         ~4,600 stations rain_24h (no obs table yet → staging.thaiwater_rain_24h only)
Reservoirs + water quality are nationwide (tiny); rain is filtered to the bbox unless --nationwide.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from shapely.geometry import Point

from lib import http
from lib.config import RunContext
from sources.base import MERGE, STAGE_ONLY, CheckResult, Rows, Source, Target

URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/thailand_main"
ICT = timezone(timedelta(hours=7))

RAIN_DDL = """
create table {schema}.thaiwater_rain_24h (
  station_id text not null, observed_at timestamptz not null, rain_24h_mm numeric,
  province_code text, agency text, geom extensions.geometry(Point, 4326),
  primary key (station_id, observed_at)
)"""


def _num(v):
    try:
        return None if v is None or v == "" else float(v)
    except (TypeError, ValueError):
        return None


def _ts(s: str | None):
    if not s:
        return None
    return datetime.strptime(s[:16], "%Y-%m-%d %H:%M").replace(tzinfo=ICT)


class ThaiWater(Source):
    code = "thaiwater"
    tier = "daily"
    attribution = "คลังข้อมูลน้ำแห่งชาติ (สสน.)"
    targets = [
        Target(table="reservoir_storage", schema="obs", mode=MERGE, key=("thaiwater_id", "observed_on"),
               has_geom=False, required=("thaiwater_id", "observed_on"),
               ranges={"storage_pct": (0, 200), "storage_mcm": (0, 20_000)}),
        Target(table="water_quality", schema="obs", mode=MERGE, key=("station_id", "observed_at"),
               geom_type="point", required=("station_id", "observed_at"),
               ranges={"ec_dsm": (0, 100), "salinity_gl": (0, 60), "ph": (0, 14), "do_mgl": (0, 30)}),
        Target(table="thaiwater_rain_24h", mode=STAGE_ONLY, ddl=RAIN_DDL, geom_type="point",
               required=("station_id", "observed_at"), ranges={"rain_24h_mm": (0, 1000)}),
    ]

    def check(self, ctx: RunContext) -> CheckResult:
        # Payload changes every hour; the fetch is the check (sha256 of the body).
        r = http.request("GET", URL)
        self._body = r.content
        return CheckResult(token=http.sha256_bytes(self._body)[:24])

    def fetch(self, ctx: RunContext) -> list[Path]:
        p = ctx.raw_dir(self.code) / f"thailand_main_{datetime.now(ICT):%H%M}.json"
        p.write_bytes(getattr(self, "_body", None) or http.request("GET", URL).content)
        return [p]

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:
        d = json.loads(files[0].read_bytes())
        dams = (d.get("dam") or {}).get("data", {}).get("data") or []
        wq = (d.get("waterquality") or {}).get("data", {}).get("data") or []
        rain = (d.get("rain") or {}).get("data", {}).get("data") or []
        w, s, e, n = ctx.bbox

        def dam_rows():
            seen = set()
            for x in dams:
                dam = x.get("dam") or {}
                key = (str(dam.get("id")), x.get("dam_date"))
                if not dam.get("id") or not x.get("dam_date") or key in seen:
                    continue
                seen.add(key)
                yield (None, key[0], key[1], _num(x.get("dam_storage")), _num(x.get("dam_storage_percent")),
                       _num(x.get("dam_inflow")), _num(x.get("dam_released")))

        def wq_rows():
            seen = set()
            for x in wq:
                st = x.get("waterquality_station") or {}
                sid, ts = st.get("id"), _ts(x.get("waterquality_datetime"))
                lat, lon = _num(st.get("waterquality_station_lat")), _num(st.get("waterquality_station_long"))
                if not sid or not ts or (str(sid), ts) in seen:
                    continue
                seen.add((str(sid), ts))
                cond = _num(x.get("waterquality_conductivity"))
                yield (str(sid), ts, cond / 1000 if cond is not None else None, _num(x.get("waterquality_salinity")),
                       _num(x.get("waterquality_do")), _num(x.get("waterquality_ph")), "thaiwater",
                       Point(lon, lat).wkb if lat and lon else None)

        def rain_rows():
            seen = set()
            for x in rain:
                st = x.get("station") or {}
                lat, lon = _num(st.get("tele_station_lat")), _num(st.get("tele_station_long"))
                sid, ts = st.get("id"), _ts(x.get("rainfall_datetime"))
                if not sid or not ts or lat is None or lon is None or (str(sid), ts) in seen:
                    continue
                if not ctx.nationwide and not (w <= lon <= e and s <= lat <= n):
                    continue
                seen.add((str(sid), ts))
                yield (str(sid), ts, _num(x.get("rain_24h")), (x.get("geocode") or {}).get("province_code"),
                       ((x.get("agency") or {}).get("agency_shortname") or {}).get("en"), Point(lon, lat).wkb)

        return {
            "reservoir_storage": Rows(["water_body_id", "thaiwater_id", "observed_on", "storage_mcm", "storage_pct",
                                       "inflow_mcm", "outflow_mcm"], dam_rows(), has_geom=False),
            "water_quality": Rows(["station_id", "observed_at", "ec_dsm", "salinity_gl", "do_mgl", "ph", "source", "geom"],
                                  wq_rows()),
            "thaiwater_rain_24h": Rows(["station_id", "observed_at", "rain_24h_mm", "province_code", "agency", "geom"],
                                       rain_rows()),
        }
