"""LDD ชุดดิน / ดินเค็ม — PLACEHOLDER loader (D-002, DATA_SOURCES §2).

No automatic channel exists. Files obtained by letter are dropped into
    etl/.raw/ldd/manual/<yyyy-mm-dd>/*.{shp,gpkg,geojson,zip}
(or Storage `etl-raw/ldd/manual/…`, synced down before the run). If nothing matches the layer
globs in ldd_fieldmap.yaml → status `skipped` with reason `no_source` (never an error).
When files exist: normal pipeline (stage → validate → swap → recompute) and, inside the swap
transaction, ref.province_coverage.has_ldd_soil / has_ldd_saline = true for provinces covered.
"""
from __future__ import annotations

import fnmatch
import logging
import zipfile
from pathlib import Path

import yaml

from lib import http
from lib.config import RunContext
from sources.base import CheckResult, Rows, Source, Target

log = logging.getLogger("etl.ldd")
FIELDMAP = Path(__file__).with_name("ldd_fieldmap.yaml")
EXTS = (".shp", ".gpkg", ".geojson", ".zip")


def manual_dir(ctx: RunContext) -> Path:
    return ctx.raw_root / "ldd" / "manual"


def find_layers(ctx: RunContext, globs: list[str]) -> list[Path]:
    root = manual_dir(ctx)
    if not root.exists():
        return []
    out = []
    for p in sorted(root.rglob("*")):
        if p.is_file() and p.suffix.lower() in EXTS and any(fnmatch.fnmatch(p.name.lower(), g.lower()) for g in globs):
            out.append(p)
    return out


class _LddBase(Source):
    kind = ""            # 'soil' | 'saline'
    coverage_column = ""  # province_coverage flag set after swap
    tier = "manual"
    attribution = "กรมพัฒนาที่ดิน"

    def cfg(self) -> dict:
        return yaml.safe_load(FIELDMAP.read_text())[self.kind]

    def check(self, ctx: RunContext) -> CheckResult:
        files = find_layers(ctx, self.cfg()["layer_glob"])
        if not files:
            return CheckResult(skip_reason=f"no_source: no LDD {self.kind} file in {manual_dir(ctx)}")
        token = http.sha256_bytes(*[http.sha256_file(f) for f in files])[:24]
        return CheckResult(token=token, info={"files": [f.name for f in files]})

    def fetch(self, ctx: RunContext) -> list[Path]:
        return find_layers(ctx, self.cfg()["layer_glob"])

    def _read(self, path: Path):
        import geopandas as gpd

        if path.suffix.lower() == ".zip":
            with zipfile.ZipFile(path) as z:
                shp = [n for n in z.namelist() if n.lower().endswith(".shp")]
            if not shp:
                raise RuntimeError(f"{path.name}: no .shp inside")
            return gpd.read_file(f"zip://{path}!{shp[0]}")
        return gpd.read_file(path)

    def after_swap_sql(self, ctx: RunContext) -> list[tuple[str, dict]]:
        S = ctx.schemas
        return [(
            f"update {S.ref}.province_coverage c set {self.coverage_column} = true "
            f"where exists (select 1 from {S.ref}.admin_boundaries a join {S.ref}.{self.targets[0].table} t "
            "on ST_Intersects(a.geom, t.geom) where a.level = 'province' and a.code = c.province_code)",
            {},
        )]


class LddSoil(_LddBase):
    code = "ldd_soil"
    kind = "soil"
    coverage_column = "has_ldd_soil"
    targets = [Target(table="soil_units", simplify_tol=0.00002, required=("soil_group",),
                      ranges={"ph": (2, 11), "ksat_mm_day": (0, 10_000), "awc_mm_m": (0, 400)},
                      keep_where="not ST_Intersects(geom, ST_GeomFromText(%(bbox)s, 4326))", max_row_delta=0.5)]

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:
        f = self.cfg()["fields"]
        cols = ["soil_group", "soil_series", "texture", "drainage", "ph", "ksat_mm_day", "awc_mm_m"]

        def rows():
            for p in files:
                gdf = self._read(p).to_crs(4326)
                for _, r in gdf.iterrows():
                    if r.geometry is None:
                        continue
                    yield (*[(r.get(f[c]) if f.get(c) else None) for c in cols], r.geometry.wkb)

        return {"soil_units": Rows(cols + ["geom"], rows())}


class LddSaline(_LddBase):
    code = "ldd_saline"
    kind = "saline"
    coverage_column = "has_ldd_saline"
    targets = [Target(table="saline_soil_zones", simplify_tol=0.00002, required=("salinity_level",),
                      ranges={"salt_crust_pct": (0, 100)},
                      keep_where="not ST_Intersects(geom, ST_GeomFromText(%(bbox)s, 4326))", max_row_delta=0.5)]

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:
        c = self.cfg()
        f, lvl = c["fields"], c["salinity_level_map"]

        def rows():
            for p in files:
                gdf = self._read(p).to_crs(4326)
                for _, r in gdf.iterrows():
                    if r.geometry is None:
                        continue
                    raw = str(r.get(f["salinity_level"]) or "").strip()
                    pct = r.get(f["salt_crust_pct"]) if f.get("salt_crust_pct") else None
                    yield (lvl.get(raw, raw.lower() or None), pct, c["default_origin"], r.geometry.wkb)

        return {"saline_soil_zones": Rows(["salinity_level", "salt_crust_pct", "salinity_origin", "geom"], rows())}
