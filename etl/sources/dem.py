"""Copernicus DEM GLO-30 (AWS open data COG, 1°×1° tiles) → ref.grid_cells.elev_m / slope_pct.

Each tile is read once, averaged onto a 1/1200° (~92 m) grid (12×12 px per 0.01° cell), slope is
computed at that resolution (percent rise, metric dx/dy at the pixel latitude), then both are
block-averaged to the cell. Thailand ≈ 60 land tiles × ~43 MB.
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

log = logging.getLogger("etl.dem")

BASE = "https://copernicus-dem-30m.s3.amazonaws.com"
SUB = 12
M_PER_DEG = 111_320.0


def tile_name(lat: int, lon: int) -> str:
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM"


def tile_url(lat: int, lon: int) -> str:
    n = tile_name(lat, lon)
    return f"{BASE}/{n}/{n}.tif"


def slope_pct(z: np.ndarray, transform) -> np.ndarray:
    res = transform.a
    north = transform.f
    lats = north - (np.arange(z.shape[0]) + 0.5) * res
    dy = res * M_PER_DEG
    dx = (res * M_PER_DEG * np.cos(np.radians(lats)))[:, None]
    gy, gx = np.gradient(z)
    return 100.0 * np.sqrt((gx / dx) ** 2 + (gy / dy) ** 2)


class CopernicusDem(Source):
    code = "cop_dem"
    tier = "static"
    attribution = "Copernicus DEM GLO-30 (© DLR e.V. / Airbus, ESA)"
    targets = [
        Target(
            table="grid_cells",
            mode=GRID_UPDATE,
            has_geom=False,
            grid_columns=("elev_m", "slope_pct"),
            ranges={"elev_m": (-50, 3000), "slope_pct": (0, 300)},
            min_non_null={"elev_m": 0.95, "slope_pct": 0.95},
        )
    ]

    def _tiles(self, ctx):
        return list(degree_tiles(ctx.bbox))

    def check(self, ctx: RunContext) -> CheckResult:
        tokens = []
        for lat, lon, _ in self._tiles(ctx):
            try:
                tokens.append(http.head_token(tile_url(lat, lon)))
            except http.FetchError:  # sea tiles do not exist
                tokens.append(f"missing:{lat},{lon}")
        return CheckResult(token=http.sha256_bytes(*tokens)[:24])

    def fetch(self, ctx: RunContext) -> list[Path]:
        raw = ctx.raw_dir(self.code)
        out: list[Path] = []
        with raster.gdal_env():
            for lat, lon, clip in self._tiles(ctx):
                i0, j0, ni, nj, tr, w, h = raster.chunk_grid(clip, SUB)
                try:
                    z = raster.warp_read(f"/vsicurl/{tile_url(lat, lon)}", tr, w, h, Resampling.average)
                except Exception as e:  # noqa: BLE001 — ocean tiles 404
                    log.warning("  DEM tile N%d E%d unavailable: %s", lat, lon, type(e).__name__)
                    continue
                elev = raster.block_mean(z, SUB, ni, nj)
                slope = raster.block_mean(slope_pct(z, tr), SUB, ni, nj)
                for name, a in (("elev", elev), ("slope", slope)):
                    p = raw / f"{name}_N{lat:02d}E{lon:03d}_{i0}_{j0}_{ni}x{nj}.tif"
                    raster.save_geotiff(p, a, raster.chunk_grid(clip, 1)[4])
                    out.append(p)
                log.info("  DEM tile N%d E%d → %dx%d cells", lat, lon, ni, nj)
        return out

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:
        import rasterio

        def rows():
            chunks: dict[str, dict] = {}
            for f in files:
                name, _, i0, j0, dims = f.stem.split("_")
                chunks.setdefault(f"{i0}_{j0}_{dims}", {})[name] = f
            for key, d in chunks.items():
                i0, j0, dims = key.split("_")
                ni, nj = map(int, dims.split("x"))
                arrays = []
                for name in ("elev", "slope"):
                    with rasterio.open(d[name]) as src:
                        arrays.append(src.read(1))
                yield from raster.cell_rows(int(i0), int(j0), ni, nj, arrays)

        return {"grid_cells": Rows(["id", "elev_m", "slope_pct"], rows(), has_geom=False)}
