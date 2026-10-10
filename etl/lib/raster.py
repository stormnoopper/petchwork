"""Raster → 0.01° grid zonal stats (rasterio windowed / warped reads over COG/VRT, never point APIs).

For each 1°×1° chunk of the bbox we warp the source onto an EPSG:4326 grid whose resolution
divides 0.01° exactly (`sub` pixels per cell side), then block-average to 0.01° cells. Cell ids
follow D-012 (lib/grid.py).
"""
from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from contextlib import contextmanager

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

from .grid import EPS, grid_cell_id_from_ij

log = logging.getLogger("etl.raster")

GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.vrt,.TIF",
    "GDAL_HTTP_MAX_RETRY": "3",
    "GDAL_HTTP_RETRY_DELAY": "2",
    "GDAL_HTTP_TIMEOUT": "120",
    "VSI_CACHE": "TRUE",
    "GDAL_CACHEMAX": "512",
    "GDAL_HTTP_MULTIRANGE": "YES",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
}


@contextmanager
def gdal_env():
    opts = {k: os.environ.get(k, v) for k, v in GDAL_ENV.items()}
    opts = {k: int(v) if str(v).isdigit() else v for k, v in opts.items()}
    with rasterio.Env(**opts):
        yield


def chunk_grid(clip: tuple[float, float, float, float], sub: int):
    """Aligned 0.01° chunk grid: (i0, j0, ni, nj, transform, width, height)."""
    w, s, e, n = clip
    j0 = int(np.floor((w + 180) * 100 + EPS))
    i0 = int(np.floor((s + 90) * 100 + EPS))
    j1 = int(np.ceil((e + 180) * 100 - EPS))
    i1 = int(np.ceil((n + 90) * 100 - EPS))
    ni, nj = i1 - i0, j1 - j0
    res = 0.01 / sub
    west, north = j0 / 100 - 180, i1 / 100 - 90
    return i0, j0, ni, nj, from_origin(west, north, res, res), nj * sub, ni * sub


def warp_read(src_path: str, transform, width: int, height: int, resampling=Resampling.average,
              band: int = 1) -> np.ndarray:
    """Read src warped onto the given EPSG:4326 grid; nodata → NaN (float32)."""
    with rasterio.open(src_path) as src:
        nod = src.nodata
        with WarpedVRT(src, crs="EPSG:4326", transform=transform, width=width, height=height,
                       resampling=resampling, src_nodata=nod, nodata=np.nan, dtype="float32") as vrt:
            arr = vrt.read(band, out_dtype="float32")
    return arr


def block_mean(arr: np.ndarray, sub: int, ni: int, nj: int, min_valid: float = 0.25) -> np.ndarray:
    """(ni*sub, nj*sub) → (ni, nj) nanmean; cells with < min_valid valid pixels → NaN. Row 0 = north."""
    b = arr.reshape(ni, sub, nj, sub)
    valid = np.isfinite(b).sum(axis=(1, 3))
    with np.errstate(invalid="ignore", divide="ignore"):
        m = np.nansum(b, axis=(1, 3)) / valid
    m[valid < min_valid * sub * sub] = np.nan
    return m


def cell_rows(i0: int, j0: int, ni: int, nj: int, arrays: list[np.ndarray]) -> Iterator[tuple]:
    """Yield (cell_id, v1, v2, ...) for cells with at least one finite value. arrays row 0 = north."""
    for r in range(ni):
        i = i0 + (ni - 1 - r)
        for c in range(nj):
            vals = [a[r, c] for a in arrays]
            if not any(np.isfinite(v) for v in vals):
                continue
            yield (grid_cell_id_from_ij(i, j0 + c), *[None if not np.isfinite(v) else round(float(v), 3) for v in vals])


def save_geotiff(path, arr: np.ndarray, transform, nodata=np.nan) -> None:
    with rasterio.open(path, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1,
                       dtype="float32", crs="EPSG:4326", transform=transform, nodata=nodata,
                       compress="deflate") as dst:
        dst.write(arr.astype("float32"), 1)


def read_native(src_path: str, bbox: tuple[float, float, float, float], pad_px: int = 4):
    """One windowed read of `bbox` (EPSG:4326) in the source's native CRS/resolution.

    Returns (array float32 with NaN nodata, transform, crs). Much faster than per-chunk remote warps
    on tiled VRTs (one big ranged read; GDAL merges consecutive ranges)."""
    from rasterio.warp import transform_bounds
    from rasterio.windows import Window, from_bounds

    with rasterio.open(src_path) as src:
        b = transform_bounds("EPSG:4326", src.crs, *bbox, densify_pts=41)
        win = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
        win = Window(max(0, win.col_off - pad_px), max(0, win.row_off - pad_px),
                     win.width + 2 * pad_px, win.height + 2 * pad_px)
        arr = src.read(1, window=win, out_dtype="float32", boundless=True, fill_value=src.nodata or 0)
        if src.nodata is not None:
            arr[arr == src.nodata] = np.nan
        return arr, src.window_transform(win), src.crs


def reproject_to(arr: np.ndarray, src_transform, src_crs, transform, width: int, height: int,
                 resampling=Resampling.bilinear) -> np.ndarray:
    """In-memory warp of a native array onto an EPSG:4326 chunk grid (NaN = nodata)."""
    from rasterio.warp import reproject

    out = np.full((height, width), np.nan, dtype="float32")
    reproject(arr, out, src_transform=src_transform, src_crs=src_crs, dst_transform=transform,
              dst_crs="EPSG:4326", src_nodata=np.nan, dst_nodata=np.nan, resampling=resampling)
    return out
