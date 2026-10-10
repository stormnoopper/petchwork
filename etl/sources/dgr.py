"""DGR แผนที่น้ำบาดาล 1:100,000 (per province, .rar/.zip on data.go.th CKAN) → ref.groundwater_zones.

* check: CKAN package_show → (resource id, last_modified, size) of the selected provinces
* fetch: download each archive (retry), keep under etl/.raw/dgr_groundwater/<date>/
* extract: bsdtar (libarchive ≥3.6 reads RAR5; macOS + ubuntu `libarchive-tools`) → unar → 7z fallback.
  Archives are untrusted: extracted only under the raw dir, paths verified, nothing executed.
* map fields via sources/dgr_fieldmap.yaml (per-province overrides)
* provinces: --provinces 44,40 | provinces whose boundary intersects the bbox | all (--nationwide)
"""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
from pathlib import Path

import psycopg
import yaml

from lib import http
from lib.config import RunContext
from lib.provinces import code_from_name
from sources.base import CheckResult, Rows, Source, Target

log = logging.getLogger("etl.dgr")

PACKAGE_ID = "e1472db9-e7b9-442a-88a1-cb25fe813c70"
CKAN = "https://dgr.gdcatalog.go.th/api/3/action/package_show"
FIELDMAP = Path(__file__).with_name("dgr_fieldmap.yaml")


def load_fieldmap(province: str) -> dict:
    fm = yaml.safe_load(FIELDMAP.read_text())
    cfg = dict(fm["default"])
    over = (fm.get("provinces") or {}).get(province) or {}
    for k, v in over.items():
        cfg[k] = {**cfg[k], **v} if isinstance(v, dict) and isinstance(cfg.get(k), dict) else v
    return cfg


def extractor() -> list[str] | None:
    for tool, args in (("bsdtar", ["-xf", "{a}", "-C", "{d}"]), ("unar", ["-q", "-f", "-o", "{d}", "{a}"]),
                       ("7z", ["x", "-y", "-o{d}", "{a}"]), ("7zz", ["x", "-y", "-o{d}", "{a}"])):
        if shutil.which(tool):
            return [tool, *args]
    return None


def extract(archive: Path, dest: Path) -> Path:
    cmd = extractor()
    if not cmd:
        raise RuntimeError("no archive tool (install libarchive-tools / unar / p7zip)")
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    argv = [c.replace("{a}", str(archive)).replace("{d}", str(dest)) for c in cmd]
    subprocess.run(argv, check=True, capture_output=True, timeout=600)
    root = dest.resolve()
    for p in dest.rglob("*"):  # defence in depth against path traversal
        if not p.resolve().is_relative_to(root) or p.is_symlink():
            raise RuntimeError(f"unsafe archive entry: {p}")
    return dest


class DgrGroundwater(Source):
    code = "dgr_groundwater"
    tier = "semiannual"
    attribution = "กรมทรัพยากรน้ำบาดาล"
    targets = [
        Target(
            table="groundwater_zones",
            simplify_tol=0.00005,
            required=("quality_class", "province_code", "tds_mgl", "ec_dsm"),
            ranges={"ec_dsm": (0, 50), "tds_mgl": (0, 50_000), "yield_m3_hr": (0, 500), "depth_m": (0, 1000)},
            coverage_flag="has_dgr",
            keep_where="province_code is null or province_code <> all(%(provinces)s)",
            keep_where_on_seed=None,  # seed polygons are synthetic → drop all
        )
    ]

    def __init__(self) -> None:
        self._resources: list[dict] | None = None

    # ------------------------------------------------------------ resources
    def _all_resources(self) -> list[dict]:
        if self._resources is None:
            d = http.get_json(CKAN, params={"id": PACKAGE_ID})
            out = []
            for r in d["result"]["resources"]:
                code = code_from_name(r.get("name") or "")
                out.append({"id": r["id"], "name": r.get("name"), "url": r.get("url"), "province": code,
                            "last_modified": r.get("last_modified"), "size": r.get("size")})
            self._resources = out
        return self._resources

    def provinces(self, ctx: RunContext) -> list[str]:
        if ctx.options.get("provinces"):
            return list(ctx.options["provinces"])
        if ctx.nationwide:
            return sorted({r["province"] for r in self._all_resources() if r["province"] and r["url"]})
        cache = ctx.options.setdefault("_dgr_provinces", None)
        if cache is not None:
            return cache
        with psycopg.connect(ctx.database_url) as conn:
            conn.execute("set search_path = public, extensions")
            rows = conn.execute(
                f"select code from {ctx.schemas.ref}.admin_boundaries where level = 'province' "
                "and ST_Area(ST_Intersection(geom, ST_GeomFromText(%s, 4326))) > 0 order by code",
                (ctx.bbox_wkt,),
            ).fetchall()
        ctx.options["_dgr_provinces"] = [r[0] for r in rows]
        return ctx.options["_dgr_provinces"]

    def _selected(self, ctx: RunContext) -> list[dict]:
        want = set(self.provinces(ctx))
        sel = [r for r in self._all_resources() if r["province"] in want]
        missing = sorted(want - {r["province"] for r in sel if r["url"]})
        if missing:
            log.warning("DGR has no downloadable file for provinces %s", missing)
        return [r for r in sel if r["url"]]

    # ------------------------------------------------------------ interface
    def check(self, ctx: RunContext) -> CheckResult:
        sel = self._selected(ctx)
        if not sel:
            return CheckResult(skip_reason="no_source: no DGR file for provinces in scope")
        token = http.sha256_bytes(json.dumps([(r["id"], r["last_modified"], r["size"]) for r in sel]))[:24]
        return CheckResult(token=token, info={"provinces": [r["province"] for r in sel]})

    def fetch(self, ctx: RunContext) -> list[Path]:
        raw = ctx.raw_dir(self.code)
        out = []
        for r in self._selected(ctx):
            ext = ".zip" if r["url"].lower().endswith(".zip") else ".rar"
            dest = raw / f"dgr_{r['province']}_{r['id'][:8]}{ext}"
            size = int(r["size"]) if r.get("size") else None
            http.download(r["url"], dest, expected_size=size)
            out.append(dest)
            log.info("  DGR %s %s (%.1f MB)", r["province"], r["name"], dest.stat().st_size / 1e6)
        return out

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:
        import geopandas as gpd  # heavy import only when needed

        stats: dict = {}

        def rows():
            for archive in files:
                province = archive.name.split("_")[1]
                cfg = load_fieldmap(province)
                ex = extract(archive, archive.parent / "extract" / archive.stem)
                shps = sorted(ex.rglob(cfg["layer_glob"]))
                if not shps:
                    raise RuntimeError(f"{archive.name}: no layer matching {cfg['layer_glob']}")
                f = cfg["fields"]
                for shp in shps:
                    gdf = gpd.read_file(shp)
                    if gdf.crs is None:
                        raise RuntimeError(f"{shp.name}: missing .prj")
                    gdf = gdf.to_crs(4326)  # PROJ datum shift (Indian 1975 → WGS84) done here, not in PostGIS
                    unknown = 0
                    for _, r in gdf.iterrows():
                        cls = r.get(f["class"])
                        if r.geometry is None or cls is None or (isinstance(cls, float) and cls != cls):
                            continue
                        cls = str(cls).strip()
                        qc = cfg["quality_class_by_prefix"].get(cls[:1].upper())
                        tds_raw = str(r.get(f["tds"]) or "").strip()
                        tds = cfg["tds_classes_mgl"].get(tds_raw)
                        yld_raw = str(r.get(f["yield"]) or "").strip()
                        yld = cfg["yield_classes_m3_hr"].get(yld_raw)
                        if tds is None or qc is None:
                            unknown += 1
                        ec = round(tds / cfg["ec_from_tds_factor"], 3) if tds is not None else None
                        depth = r.get(f["depth"]) if f.get("depth") else None
                        yield (qc, ec, tds, depth, yld, province, r.geometry.wkb)
                    stats[shp.name] = {"features": len(gdf), "unmapped": unknown}
            log.info("  DGR layers: %s", stats)

        return {"groundwater_zones": Rows(
            ["quality_class", "ec_dsm", "tds_mgl", "depth_m", "yield_m3_hr", "province_code", "geom"], rows())}
