"""Grid id formulas — MUST match DECISIONS D-012 and supabase/seed.sql.

    grid_cells.id   = floor((lat_min + 90) * 100) * 36000 + floor((lon_min + 180) * 100)
    weather_grid.id = floor((lat + 90) * 10)      * 3600  + floor((lon + 180) * 10)
    cell.weather_grid_id = (i // 10) * 3600 + (j // 10)

A tiny epsilon guards against float error at exact cell boundaries
(e.g. 15.6 + 90 = 105.6 → 105.6*100 = 10559.999999).
"""
from __future__ import annotations

import math
from collections.abc import Iterator

EPS = 1e-7
GRID_RES = 0.01
WEATHER_RES = 0.1


def _floor(x: float) -> int:
    return math.floor(x + EPS)


def cell_ij(lat_min: float, lon_min: float) -> tuple[int, int]:
    return _floor((lat_min + 90) * 100), _floor((lon_min + 180) * 100)


def grid_cell_id(lat_min: float, lon_min: float) -> int:
    i, j = cell_ij(lat_min, lon_min)
    return i * 36000 + j


def grid_cell_id_from_ij(i: int, j: int) -> int:
    return i * 36000 + j


def ij_from_grid_cell_id(cell_id: int) -> tuple[int, int]:
    return divmod(cell_id, 36000)


def weather_grid_id(lat: float, lon: float) -> int:
    return _floor((lat + 90) * 10) * 3600 + _floor((lon + 180) * 10)


def weather_grid_id_for_cell(i: int, j: int) -> int:
    return (i // 10) * 3600 + (j // 10)


def cell_bounds(i: int, j: int) -> tuple[float, float, float, float]:
    """(west, south, east, north) of cell (i, j)."""
    return (j / 100 - 180, i / 100 - 90, (j + 1) / 100 - 180, (i + 1) / 100 - 90)


def cell_range(bbox: tuple[float, float, float, float]) -> tuple[range, range]:
    """i (lat) and j (lon) index ranges of 0.01° cells whose lower-left corner lies in bbox."""
    w, s, e, n = bbox
    i0, j0 = _floor((s + 90) * 100), _floor((w + 180) * 100)
    i1, j1 = math.ceil((n + 90) * 100 - EPS), math.ceil((e + 180) * 100 - EPS)
    return range(i0, i1), range(j0, j1)


def weather_points(bbox: tuple[float, float, float, float]) -> Iterator[tuple[int, float, float]]:
    """(id, lat, lon) of 0.1° weather points (cell centres) for every 0.1° cell touching bbox."""
    w, s, e, n = bbox
    wi0, wj0 = _floor((s + 90) * 10), _floor((w + 180) * 10)
    wi1, wj1 = math.ceil((n + 90) * 10 - EPS), math.ceil((e + 180) * 10 - EPS)
    for wi in range(wi0, wi1):
        for wj in range(wj0, wj1):
            lat = round(wi / 10 - 90 + 0.05, 2)
            lon = round(wj / 10 - 180 + 0.05, 2)
            yield wi * 3600 + wj, lat, lon


def degree_tiles(bbox: tuple[float, float, float, float]) -> Iterator[tuple[int, int, tuple[float, float, float, float]]]:
    """1°×1° tiles (lat_floor, lon_floor, clipped bbox) covering bbox — used to chunk raster reads."""
    w, s, e, n = bbox
    for lat in range(math.floor(s), math.ceil(n)):
        for lon in range(math.floor(w), math.ceil(e)):
            clip = (max(w, lon), max(s, lat), min(e, lon + 1), min(n, lat + 1))
            if clip[0] < clip[2] and clip[1] < clip[3]:
                yield lat, lon, clip
