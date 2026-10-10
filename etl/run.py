#!/usr/bin/env python3
"""Thai Rice Digital Twin ETL CLI (SPEC §6.1).

Examples
  python etl/run.py --tier semiannual                    # every source whose meta.data_sources.refresh_tier = semiannual
  python etl/run.py --source dmr,dgr --dry-run           # fetch → stage → validate, never swap
  python etl/run.py --source dgr --provinces 44,40
  python etl/run.py --source openmeteo --start 2026-10-01 --end 2026-10-07
  python etl/run.py --source soilgrids --nationwide
  python etl/run.py --rollback dmr                       # swap newest archive version back
  python etl/run.py --list

Exit code 0 when every source ended success / skipped / dry_run, 1 otherwise.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.config import PILOT_BBOX, THAILAND_BBOX, RunContext  # noqa: E402
from lib.notify import notify  # noqa: E402
from sources import ALIASES, registry, resolve  # noqa: E402

# Dependencies first: admin boundaries feed coverage checks, grid ensure-cells and DGR province lookup.
ORDER = ["gistda_admin", "hdx_codab", "dmr_rock_250k", "gistda_irrigation", "dgr_groundwater", "ldd_soil",
         "ldd_saline", "jrc_gsw", "soilgrids", "cop_dem", "chirps", "sentinel2", "gistda_rice_calendar",
         "era5_land", "open_meteo", "thaiwater", "tmd", "nasa_power", "nex_gddp_cmip6"]


def parse_bbox(s: str) -> tuple[float, float, float, float]:
    v = tuple(float(x) for x in s.split(","))
    if len(v) != 4 or not (v[0] < v[2] and v[1] < v[3]):
        raise argparse.ArgumentTypeError("bbox must be west,south,east,north")
    return v  # type: ignore[return-value]


def tier_sources(ctx: RunContext, tier: str) -> list[str]:
    reg = registry()
    try:
        import psycopg

        with psycopg.connect(ctx.database_url, connect_timeout=10) as conn:
            codes = [r[0] for r in conn.execute(
                f"select code from {ctx.schemas.meta}.data_sources where refresh_tier = %s", (tier,)).fetchall()]
        return [c for c in codes if c in reg]
    except Exception as e:  # noqa: BLE001 — fall back to code defaults
        logging.getLogger("etl").warning("meta.data_sources unavailable (%s) → code default tiers", type(e).__name__)
        return [c for c, cls in reg.items() if cls.tier == tier]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tier", choices=["daily", "quarterly", "semiannual", "static", "manual"])
    ap.add_argument("--source", help="comma list of source codes or aliases (" + ", ".join(sorted(ALIASES)) + ")")
    ap.add_argument("--dry-run", action="store_true", help="stop after validate (never swap/merge)")
    ap.add_argument("--bbox", type=parse_bbox, help="west,south,east,north (default pilot Maha Sarakham)")
    ap.add_argument("--nationwide", action="store_true", help="all of Thailand")
    ap.add_argument("--force", action="store_true", help="ignore unchanged checksum")
    ap.add_argument("--upload-raw", action="store_true", help="also upload raw files to Storage bucket etl-raw")
    ap.add_argument("--no-recompute", action="store_true")
    ap.add_argument("--provinces", help="DGR: comma list of 2-digit province codes")
    ap.add_argument("--start", help="weather window start YYYY-MM-DD")
    ap.add_argument("--end", help="weather window end YYYY-MM-DD")
    ap.add_argument("--allow-api-backfill", action="store_true", help="era5_land: allow API backfill nationwide")
    ap.add_argument("--rollback", metavar="SOURCE", help="swap the newest archive version back into ref")
    ap.add_argument("--list", action="store_true", help="list sources and exit")
    ap.add_argument("--json", action="store_true", help="print results as JSON")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s", datefmt="%H:%M:%S")
    for noisy in ("urllib3", "rasterio", "fiona", "pyogrio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    reg = registry()
    if a.list:
        for code in ORDER:
            cls = reg[code]
            print(f"{code:22s} tier={cls.tier:10s} targets={[t.schema + '.' + t.table for t in cls.targets]}")
        return 0

    ctx = RunContext(
        bbox=THAILAND_BBOX if a.nationwide else (a.bbox or PILOT_BBOX),
        nationwide=a.nationwide, dry_run=a.dry_run, force=a.force, upload_raw=a.upload_raw,
        recompute=not a.no_recompute,
        options={k: v for k, v in {
            "provinces": [p.strip().zfill(2) for p in a.provinces.split(",")] if a.provinces else None,
            "start": a.start, "end": a.end, "allow_api_backfill": a.allow_api_backfill}.items() if v},
    )

    from pipeline import JobResult, Pipeline  # noqa: E402 — heavy imports after arg parsing

    if a.rollback:
        p = Pipeline(ctx)
        results = []
        for code in resolve([a.rollback]):
            src = reg[code]()
            with p.connect() as conn, conn.transaction():
                for t in src.targets:
                    arch = p.rollback_table(conn, ctx.schemas.resolve(t.schema), t.table)
                    results.append(JobResult(code, "success", None, f"rolled back {t.table}; previous live → archive.{arch}"))
                conn.execute(
                    f"insert into {ctx.schemas.meta}.data_snapshots (source_code, version, bbox) "
                    "values (%s, %s, ST_GeomFromText(%s, 4326))", (code, f"rollback-{ctx.version}", ctx.bbox_wkt))
                conn.execute(f"update {ctx.schemas.meta}.data_sources set last_checksum = null where code = %s", (code,))
        for r in results:
            print(f"{r.source}: {r.message}")
        return 0

    if not a.tier and not a.source:
        ap.error("give --tier or --source (or --list)")
    codes = resolve(a.source.split(",")) if a.source else []
    if a.tier:
        tcodes = tier_sources(ctx, a.tier)
        codes = [c for c in codes if c in tcodes] if codes else tcodes
    codes = sorted(codes, key=lambda c: ORDER.index(c) if c in ORDER else 99)
    logging.getLogger("etl").info("run %s scope=%s dry_run=%s sources=%s", ctx.version, ctx.scope, ctx.dry_run, codes)

    pipe = Pipeline(ctx)
    results = []
    for c in codes:
        try:
            results.append(pipe.run(reg[c]()))
        except Exception as e:  # noqa: BLE001 — e.g. DB unreachable / unknown meta code: record and continue
            logging.getLogger("etl").exception("source %s crashed before it could be recorded", c)
            results.append(JobResult(c, "failed", None, f"{type(e).__name__}: {str(e)[:300]}"))
    notify([r.as_dict() for r in results])

    print("\n" + "=" * 78)
    for r in results:
        print(f"{r.source:22s} {r.status:8s} rows={r.rows!s:>8}  {r.message}")
        for c in (r.details.get("validate") or []):
            if not c["ok"] or a.verbose:
                print(f"    {'ok ' if c['ok'] else 'FAIL'} {c['target']}.{c['name']}: {c['detail']}")
    if a.json:
        print(json.dumps([{**r.as_dict(), "details": r.details} for r in results], default=str, ensure_ascii=False, indent=1))
    return 0 if all(r.status in ("success", "skipped", "dry_run") for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
