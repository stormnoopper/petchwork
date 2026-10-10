"""NASA POWER daily point API → ref.weather_grid + obs.weather_daily (static tier, D-029).

Free nationwide weather (no key, public domain) so every province has a weather series while the
ERA5-Land bulk reader (D-004) is not built yet.

* API: https://power.larc.nasa.gov/api/temporal/daily/point, community AG, JSON,
  T2M_MAX, T2M_MIN, PRECTOTCORR, RH2M, WS2M (already 2 m), ALLSKY_SFC_SW_DWN (MJ/m²/day).
  The whole window comes back in ONE request per point (~1.5–2 s, ~0.4 MB for 10 y).
  Fill value -999 → null; a day without tmin/tmax/rain is dropped (required columns).
* Points: 0.25° lattice (lat/lon multiples of 0.25) over the scope, kept when within
  ETL_NASAPOWER_LAND_KM (default 15 km) of a province in ref.admin_boundaries (land mask).
  POWER meteorology is MERRA-2 0.5°×0.625° (radiation 1°) → neighbouring points can be identical;
  0.25° only keeps the nearest-point lookup in analyze_polygon short (≤ ~18 km).
* ids: D-012 weather_grid formula on the point itself (floor((lat+90)*10)*3600 + floor((lon+180)*10)).
  An id already in ref.weather_grid that has NO nasa_power rows (0.1° seed / ERA5 / Open-Meteo point)
  is skipped — the existing point covers it and is never overwritten.
* ET0: FAO-56 Penman-Monteith (eq. 6, elevation = POWER geometry z, RHmean eq. 19, Rso eq. 37);
  Hargreaves (eq. 52) when Rs / RH / wind is missing.
* Resumable: raw JSON per point cached under <ETL_RAW_DIR>/nasa_power/cache/ (re-used across runs);
  points whose nasa_power rows already reach the window end are skipped. ≤ 4 concurrent requests and
  ≥ ETL_NASAPOWER_MIN_INTERVAL_S (1.5 s) between request starts (POWER returns 429 after ~600 fast
  requests), retry 429/5xx with backoff 30 s × 2^n (lib/http), progress + ETA every 25 points.
  After 3 points fail for good the fetch stops and the points already fetched are still loaded.
* Window: --start/--end (default 2016-01-01 … yesterday, Asia/Bangkok).
"""
from __future__ import annotations

import json
import logging
import math
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from pathlib import Path

import psycopg
from shapely.geometry import Point

from lib import http
from lib.config import RunContext
from lib.grid import weather_grid_id
from sources.base import CheckResult, Rows, Source
from sources.openmeteo import DAILY_COLS, ICT, weather_targets

log = logging.getLogger("etl.nasapower")

URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMS = "T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN"
STEP = 0.25
FILL = -999.0
DEFAULT_START = date(2016, 1, 1)
WORKERS = min(4, int(os.environ.get("ETL_NASAPOWER_WORKERS", "4")))  # be polite: never more than 4
LAND_KM = float(os.environ.get("ETL_NASAPOWER_LAND_KM", "15"))
# POWER answers HTTP 429 after ~600 requests in ~4 min (2026-10-10) → space request starts across threads
MIN_INTERVAL_S = float(os.environ.get("ETL_NASAPOWER_MIN_INTERVAL_S", "1.5"))


class _Throttle:
    """Shared minimum interval between request starts (all worker threads)."""

    def __init__(self, interval: float) -> None:
        self.interval, self.lock, self.next_at = interval, threading.Lock(), 0.0

    def wait(self) -> None:
        with self.lock:
            now = time.monotonic()
            delay = max(0.0, self.next_at - now)
            self.next_at = max(now, self.next_at) + self.interval
        if delay:
            time.sleep(delay)


# --------------------------------------------------------------------------------------------- points
def lattice(bbox: tuple[float, float, float, float], step: float = STEP) -> list[tuple[int, float, float]]:
    """(weather_grid id, lat, lon) of every 0.25° lattice point inside bbox."""
    w, s, e, n = bbox
    out = []
    for i in range(math.ceil(s / step - 1e-9), math.floor(n / step + 1e-9) + 1):
        for j in range(math.ceil(w / step - 1e-9), math.floor(e / step + 1e-9) + 1):
            lat, lon = round(i * step, 4), round(j * step, 4)
            out.append((weather_grid_id(lat, lon), lat, lon))
    ids = [p[0] for p in out]
    assert len(ids) == len(set(ids)), "0.25° lattice produced a weather_grid id collision"
    return out


def window(ctx: RunContext) -> tuple[date, date]:
    end = date.fromisoformat(ctx.options["end"]) if ctx.options.get("end") else datetime.now(ICT).date() - timedelta(days=1)
    start = date.fromisoformat(ctx.options["start"]) if ctx.options.get("start") else DEFAULT_START
    return start, end


def plan_points(ctx: RunContext, start: date, end: date) -> dict:
    """Land-masked lattice, minus ids owned by another weather source, split into done / pending."""
    pts = lattice(ctx.bbox)
    ids, lats, lons = [p[0] for p in pts], [p[1] for p in pts], [p[2] for p in pts]
    R, O = ctx.schemas.ref, ctx.schemas.obs
    with psycopg.connect(ctx.database_url) as conn:
        conn.execute("set search_path = public, extensions")
        land = {r[0] for r in conn.execute(
            f"select x.id from unnest(%s::int[], %s::float8[], %s::float8[]) x(id, lat, lon) "
            f"where exists (select 1 from {R}.admin_boundaries a where a.level = 'province' "
            "  and a.geom && ST_Expand(ST_SetSRID(ST_MakePoint(x.lon, x.lat), 4326), %s) "  # index prefilter
            "  and ST_DWithin(a.geom::geography, ST_SetSRID(ST_MakePoint(x.lon, x.lat), 4326)::geography, %s))",
            (ids, lats, lons, LAND_KM / 100.0, LAND_KM * 1000)).fetchall()}
        existing = {r[0] for r in conn.execute(
            f"select id from {R}.weather_grid where id = any(%s)", (list(land),)).fetchall()}
        span = {r[0]: (r[1], r[2]) for r in conn.execute(
            f"select weather_grid_id, min(date), max(date) from {O}.weather_daily "
            "where source = 'nasa_power' and weather_grid_id = any(%s) group by 1", (list(land),)).fetchall()}
    # POWER lags a few days behind → a point is "done" when its rows reach end − 7 d
    done_after = end - timedelta(days=7)
    keep = [p for p in pts if p[0] in land]
    collide = [p for p in keep if p[0] in existing and p[0] not in span]
    mine = [p for p in keep if p not in collide]
    done = [p for p in mine if p[0] in span and span[p[0]][0] <= start + timedelta(days=7)
            and span[p[0]][1] >= done_after]
    pending = [p for p in mine if p not in done]
    return {"lattice": len(pts), "land": len(keep), "collisions": [p[0] for p in collide],
            "done": len(done), "pending": pending}


# --------------------------------------------------------------------------------------------- FAO-56
def _e0(t: float) -> float:
    return 0.6108 * math.exp(17.27 * t / (t + 237.3))


def extraterrestrial_ra(lat: float, doy: int) -> float:
    """Ra (MJ m-2 day-1), FAO-56 eq. 21."""
    dr = 1 + 0.033 * math.cos(2 * math.pi * doy / 365)
    dec = 0.409 * math.sin(2 * math.pi * doy / 365 - 1.39)
    phi = math.radians(lat)
    ws = math.acos(max(-1.0, min(1.0, -math.tan(phi) * math.tan(dec))))
    return 24 * 60 / math.pi * 0.0820 * dr * (ws * math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.sin(ws))


def et0_hargreaves(lat: float, doy: int, tmin: float, tmax: float) -> float | None:
    if tmax < tmin:
        return None
    ra = extraterrestrial_ra(lat, doy)
    return max(0.0, 0.0023 * ((tmin + tmax) / 2 + 17.8) * math.sqrt(tmax - tmin) * ra * 0.408)


def et0_penman_monteith(lat: float, z: float, doy: int, tmin: float, tmax: float,
                        rh: float | None, u2: float | None, rs: float | None) -> float | None:
    """FAO-56 PM reference ET (mm/day); Hargreaves when Rs / RH / u2 is missing."""
    if tmin is None or tmax is None:
        return None
    if rh is None or u2 is None or rs is None:
        return et0_hargreaves(lat, doy, tmin, tmax)
    tmean = (tmax + tmin) / 2
    p = 101.3 * ((293 - 0.0065 * z) / 293) ** 5.26                 # eq. 7
    gamma = 0.000665 * p                                            # eq. 8
    es = (_e0(tmax) + _e0(tmin)) / 2                                # eq. 12
    ea = max(0.0, min(es, rh / 100 * es))                           # eq. 19 (RHmean)
    delta = 4098 * _e0(tmean) / (tmean + 237.3) ** 2                # eq. 13
    ra = extraterrestrial_ra(lat, doy)
    rso = (0.75 + 2e-5 * z) * ra                                    # eq. 37
    rns = 0.77 * rs                                                 # eq. 38, albedo 0.23
    ratio = min(1.0, rs / rso) if rso > 0 else 1.0
    rnl = 4.903e-9 * ((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2 \
        * (0.34 - 0.14 * math.sqrt(ea)) * (1.35 * ratio - 0.35)     # eq. 39
    rn = rns - rnl
    num = 0.408 * delta * rn + gamma * 900 / (tmean + 273) * u2 * (es - ea)
    den = delta + gamma * (1 + 0.34 * u2)
    return max(0.0, num / den)


# --------------------------------------------------------------------------------------------- parse
def _v(series: dict, day: str) -> float | None:
    x = series.get(day)
    if x is None or x == FILL or (isinstance(x, float) and x != x):
        return None
    return float(x)


def parse_point(payload: dict, wid: int, lat: float) -> list[tuple]:
    """POWER daily JSON → obs.weather_daily rows (DAILY_COLS). Days missing tmin/tmax/rain are dropped."""
    p = payload["properties"]["parameter"]
    coords = (payload.get("geometry") or {}).get("coordinates") or []
    z = float(coords[2]) if len(coords) > 2 and coords[2] not in (None, FILL) else 0.0
    tx, tn, pr = p.get("T2M_MAX", {}), p.get("T2M_MIN", {}), p.get("PRECTOTCORR", {})
    rh_s, ws_s, rs_s = p.get("RH2M", {}), p.get("WS2M", {}), p.get("ALLSKY_SFC_SW_DWN", {})
    out = []
    for day in sorted(tx):
        tmax, tmin, rain = _v(tx, day), _v(tn, day), _v(pr, day)
        if tmax is None or tmin is None or rain is None:
            continue
        if tmax < tmin:
            tmin, tmax = tmax, tmin
        rh, u2, rs = _v(rh_s, day), _v(ws_s, day), _v(rs_s, day)
        d = date(int(day[:4]), int(day[4:6]), int(day[6:8]))
        et0 = et0_penman_monteith(lat, z, d.timetuple().tm_yday, tmin, tmax, rh, u2, rs)
        out.append((wid, d, round(tmin, 2), round(tmax, 2), round(max(rain, 0.0), 2),
                    None if rh is None else round(min(rh, 100.0), 1), None if u2 is None else round(u2, 2),
                    None if rs is None else round(rs, 2), None if et0 is None else round(et0, 2), "nasa_power"))
    return out


# --------------------------------------------------------------------------------------------- source
class NasaPower(Source):
    code = "nasa_power"
    tier = "static"
    attribution = "NASA POWER Project (power.larc.nasa.gov)"
    targets = weather_targets()

    def __init__(self) -> None:
        self._plan: dict | None = None

    def _get_plan(self, ctx: RunContext) -> dict:
        if self._plan is None:
            s, e = window(ctx)
            self._plan = plan_points(ctx, s, e)
        return self._plan

    def check(self, ctx: RunContext) -> CheckResult:
        s, e = window(ctx)
        pl = self._get_plan(ctx)
        info = {"start": str(s), "end": str(e), "lattice": pl["lattice"], "land_points": pl["land"],
                "skipped_collisions": len(pl["collisions"]), "already_loaded": pl["done"],
                "pending": len(pl["pending"])}
        log.info("  nasa_power plan: %s", info)
        if not pl["pending"]:
            return CheckResult(skip_reason="already_loaded: every point has nasa_power rows up to the window end",
                               info=info)
        return CheckResult(token=f"{s}..{e}|{len(pl['pending'])}", info=info)

    def _cache_dir(self, ctx: RunContext) -> Path:
        p = ctx.raw_root / self.code / "cache"
        p.mkdir(parents=True, exist_ok=True)
        return p

    def fetch(self, ctx: RunContext) -> list[Path]:
        s, e = window(ctx)
        pts = self._get_plan(ctx)["pending"]
        cache = self._cache_dir(ctx)
        manifest = ctx.raw_dir(self.code) / "points.json"
        manifest.write_text(json.dumps({"start": str(s), "end": str(e), "points": pts}))

        def one(p) -> tuple[Path, bool]:
            wid, lat, lon = p
            f = cache / f"{wid}_{lat:.2f}_{lon:.2f}_{s:%Y%m%d}_{e:%Y%m%d}.json"
            if f.exists() and f.stat().st_size > 1000:
                return f, False
            throttle.wait()
            payload = http.get_json(URL, params={
                "parameters": PARAMS, "community": "AG", "longitude": f"{lon:.4f}", "latitude": f"{lat:.4f}",
                "start": f"{s:%Y%m%d}", "end": f"{e:%Y%m%d}", "format": "JSON"}, backoff=30, retries=5)
            if "properties" not in payload:
                raise http.FetchError(f"NASA POWER: unexpected payload for {lat},{lon}: {str(payload)[:200]}")
            tmp = f.with_suffix(".part")
            tmp.write_text(json.dumps(payload, separators=(",", ":")))
            tmp.replace(f)
            return f, True

        throttle = _Throttle(MIN_INTERVAL_S)
        files: list[Path] = [manifest]
        failed: list[int] = []
        t0, fetched, n = time.monotonic(), 0, len(pts)
        ex = ThreadPoolExecutor(max_workers=WORKERS)
        try:
            futs = {ex.submit(one, p): p for p in pts}
            for k, fut in enumerate(as_completed(futs), 1):
                try:
                    f, net = fut.result()
                except http.FetchError as err:
                    failed.append(futs[fut][0])
                    log.warning("  nasa_power point %s failed: %s", futs[fut][0], err)
                    if len(failed) >= 3:  # persistent 429 / outage → stop, keep what is cached (resumable)
                        log.error("  nasa_power: 3 points failed after retries → stop fetching; re-run to resume")
                        ex.shutdown(wait=True, cancel_futures=True)
                        break
                    continue
                files.append(f)
                fetched += net
                if k % 25 == 0 or k == n:
                    el = time.monotonic() - t0
                    eta = el / k * (n - k)
                    log.info("  nasa_power %d/%d points (%d downloaded, %d cached) %.0fs elapsed, ETA %.0fs",
                             k, n, fetched, k - fetched, el, eta)
        finally:
            ex.shutdown(wait=True, cancel_futures=True)
        if len(files) == 1:
            raise http.FetchError(f"NASA POWER: no point fetched ({len(failed)} failed)")
        if len(files) - 1 < n:
            log.warning("  nasa_power: loading %d of %d pending points — re-run to fetch the rest", len(files) - 1, n)
        return files

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:
        man = json.loads(next(f for f in files if f.name == "points.json").read_text())
        pts = {p[0]: p for p in man["points"]}
        data_files = [f for f in files if f.name != "points.json"]

        def grid_rows():
            for wid, lat, lon in pts.values():
                yield (wid, lat, lon, Point(lon, lat).wkb)

        def daily_rows():
            for f in data_files:
                wid = int(f.name.split("_", 1)[0])
                if wid not in pts:
                    continue
                yield from parse_point(json.loads(f.read_text()), wid, pts[wid][1])

        return {
            "weather_grid": Rows(["id", "lat", "lon", "geom"], grid_rows()),
            "weather_daily": Rows(DAILY_COLS, daily_rows(), has_geom=False),
        }
