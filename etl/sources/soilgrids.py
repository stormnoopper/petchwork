"""SoilGrids 250 m (ISRIC) → ref.grid_cells.sg_clay_pct / sg_soc_gkg (DATA_SOURCES §12).

Bulk read of the global VRT/COG mosaics (Homolosine) via /vsicurl with windowed warps — NOT the
REST API (fair-use ~5 calls/min). Topsoil 0–30 cm = thickness-weighted mean of 0–5, 5–15, 15–30 cm.
Units: clay g/kg → % (÷10) · soc dg/kg → g/kg (÷10). Urban/water pixels are nodata → cell null.
"""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
from rasterio.enums import Resampling

from lib import http, raster
from lib.config import RunContext
from lib.grid import degree_tiles
from sources.base import GRID_UPDATE, CheckResult, Rows, Source, Target

log = logging.getLogger("etl.soilgrids")

BASE = "https://files.isric.org/soilgrids/latest/data"
DEPTHS = (("0-5cm", 5), ("5-15cm", 10), ("15-30cm", 15))
PROPS = {"clay": ("sg_clay_pct", 0.1), "soc": ("sg_soc_gkg", 0.1)}
SUB = 4  # 0.0025° (~275 m) pixels → 4×4 per 0.01° cell


def vrt_url(prop: str, depth: str) -> str:
    return f"{BASE}/{prop}/{prop}_{depth}_mean.vrt"


class SoilGrids(Source):
    code = "soilgrids"
    tier = "semiannual"
    attribution = "ISRIC SoilGrids (CC BY 4.0)"
    targets = [
        Target(
            table="grid_cells",
            mode=GRID_UPDATE,
            has_geom=False,
            grid_columns=("sg_clay_pct", "sg_soc_gkg"),
            ranges={"sg_clay_pct": (0, 100), "sg_soc_gkg": (0, 600)},
            min_non_null={"sg_clay_pct": 0.80, "sg_soc_gkg": 0.80},
        )
    ]

    def check(self, ctx: RunContext) -> CheckResult:
        tokens = [http.head_token(vrt_url(p, d)) for p in PROPS for d, _ in DEPTHS]
        return CheckResult(token=http.sha256_bytes(*tokens)[:24])

    def fetch(self, ctx: RunContext) -> list[Path]:
        """One native (Homolosine, 250 m) window read per layer for the whole bbox, then in-memory warp +
        aggregation per 1° chunk; the 0.0025° topsoil rasters (GeoTIFF) are saved as the raw artefact."""
        raw = ctx.raw_dir(self.code)
        out: list[Path] = []
        tiles = list(degree_tiles(ctx.bbox))
        with raster.gdal_env():
            for prop in PROPS:
                native = {d: raster.read_native(f"/vsicurl/{vrt_url(prop, d)}", ctx.bbox) for d, _ in DEPTHS}
                log.info("  soilgrids %s: read %s native windows", prop, [a.shape for a, _, _ in native.values()])
                for lat, lon, clip in tiles:
                    i0, j0, ni, nj, tr, w, h = raster.chunk_grid(clip, SUB)
                    acc = np.zeros((h, w), dtype="float64")
                    wsum = np.zeros((h, w), dtype="float64")
                    for depth, thick in DEPTHS:
                        arr, st, crs = native[depth]
                        a = raster.reproject_to(arr, st, crs, tr, w, h, Resampling.bilinear)
                        ok = np.isfinite(a) & (a >= 0)
                        acc[ok] += a[ok] * thick
                        wsum[ok] += thick
                    with np.errstate(invalid="ignore", divide="ignore"):
                        top = np.where(wsum > 0, acc / wsum, np.nan)
                    p = raw / f"{prop}_0-30cm_N{lat:02d}E{lon:03d}_{i0}_{j0}_{ni}x{nj}.tif"
                    raster.save_geotiff(p, top, tr)
                    out.append(p)
        log.info("  soilgrids: %d chunks", len(tiles))
        return out

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:
        import rasterio

        def rows():
            chunks: dict[str, dict] = {}
            for f in files:
                prop, _, _, i0, j0, dims = f.stem.split("_")
                chunks.setdefault(f"{i0}_{j0}_{dims}", {})[prop] = f
            for key, props in chunks.items():
                i0, j0, dims = key.split("_")
                ni, nj = map(int, dims.split("x"))
                arrays = []
                for prop, (_, scale) in PROPS.items():
                    with rasterio.open(props[prop]) as src:
                        a = src.read(1)
                    arrays.append(raster.block_mean(a, SUB, ni, nj) * scale)
                yield from raster.cell_rows(int(i0), int(j0), ni, nj, arrays)

        return {"grid_cells": Rows(["id", "sg_clay_pct", "sg_soc_gkg"], rows(), has_geom=False)}
