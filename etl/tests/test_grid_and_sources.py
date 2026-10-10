"""Grid id formula (D-012) + source-level unit tests (no network)."""
from __future__ import annotations

import psycopg
import pytest

from lib.config import RunContext
from lib.grid import (cell_range, grid_cell_id, grid_cell_id_from_ij, ij_from_grid_cell_id, weather_grid_id,
                      weather_grid_id_for_cell, weather_points)
from lib.provinces import code_from_name, region


def test_grid_formula_unit():
    # D-012: floor((lat_min+90)*100)*36000 + floor((lon_min+180)*100)
    assert grid_cell_id(15.6, 102.85) == 10560 * 36000 + 28285
    assert grid_cell_id(16.59, 103.54) == 10659 * 36000 + 28354
    assert ij_from_grid_cell_id(grid_cell_id_from_ij(10600, 28300)) == (10600, 28300)
    # float edge: 15.6+90 = 105.6 → 10559.999… must still floor to 10560
    assert grid_cell_id(15.6, 102.85) != grid_cell_id(15.599, 102.85)
    assert weather_grid_id(16.05, 103.25) == 1060 * 3600 + 2832
    assert weather_grid_id_for_cell(10605, 28325) == 1060 * 3600 + 2832
    ir, jr = cell_range((102.85, 15.6, 103.55, 16.6))
    assert len(ir) * len(jr) == 7000  # seed grid size for the pilot bbox
    assert len(list(weather_points((102.85, 15.6, 103.55, 16.6)))) == 80


def test_grid_formula_matches_seed(dsn):
    """Python formula == ids in ref.grid_cells / ref.weather_grid (read-only)."""
    with psycopg.connect(dsn) as conn:
        conn.execute("set search_path = public, extensions")
        cells = conn.execute(
            "select id, weather_grid_id, ST_YMin(geom), ST_XMin(geom) from ref.grid_cells "
            "where geom && ST_MakeEnvelope(102.85, 15.6, 103.55, 16.6, 4326)").fetchall()
        wg = conn.execute("select id, lat, lon from ref.weather_grid").fetchall()
    if not cells:
        pytest.skip("ref.grid_cells empty")
    for cid, wid, ymin, xmin in cells:
        assert grid_cell_id(ymin, xmin) == cid
        i, j = ij_from_grid_cell_id(cid)
        assert weather_grid_id_for_cell(i, j) == wid
    for wid, lat, lon in wg:
        assert weather_grid_id(float(lat), float(lon)) == wid
    pilot = {p[0] for p in weather_points((102.85, 15.6, 103.55, 16.6))}
    assert pilot <= {w[0] for w in wg} or not wg


def test_province_name_mapping():
    assert code_from_name("แผนที่น้ำบาดาล จังหวัดมหาสารคาม") == "44"
    assert code_from_name("แผนที่น้ำบาดาล จังหวัดกรุงเทพ") == "10"
    assert code_from_name("แผนที่น้ำบาดาล จังหวัดนครพนม") == "48"
    assert code_from_name("แผนที่น้ำบาดาล จังหวัดหนองบัวลำภู") == "39"
    assert region("Northeast") == "northeast" and region("North") == "north"


def test_ldd_without_files_is_skipped_no_source(tmp_path):
    from sources.ldd import LddSaline, LddSoil

    ctx = RunContext(raw_root=tmp_path)
    for s in (LddSoil(), LddSaline()):
        r = s.check(ctx)
        assert r.skip_reason and r.skip_reason.startswith("no_source")


def test_dgr_fieldmap_maps_all_known_classes():
    from sources.dgr import load_fieldmap

    cfg = load_fieldmap("44")
    for raw in ("<500", "500-1,500", ">1,500", "1,500"):
        assert raw in cfg["tds_classes_mgl"]
    for raw in ("<2", "2-10", "10-20", ">20", "5-10", "<5"):
        assert raw in cfg["yield_classes_m3_hr"]
    assert cfg["quality_class_by_prefix"] == {"B": "fresh", "G": "brackish", "R": "saline"}
    ec = cfg["tds_classes_mgl"][">1,500"] / cfg["ec_from_tds_factor"]
    assert 0 < ec < 50


def test_stub_sources_skip():
    from sources.phase2 import Chirps, NexGddpCmip6, Sentinel2

    for s in (Sentinel2(), Chirps(), NexGddpCmip6()):
        assert s.check(RunContext()).skip_reason.startswith("not_implemented")


def test_era5_budget_guard(monkeypatch):
    from sources import era5land

    assert era5land.call_weight(80, 731) == 80 * 53
    ctx = RunContext(options={"start": "2006-01-01", "end": "2025-12-31"})
    monkeypatch.setattr(era5land, "grid_points", lambda c: [(1, 16.0, 103.0)] * 80)
    r = era5land.Era5LandBackfill().check(ctx)
    assert r.skip_reason and r.skip_reason.startswith("over_budget")


def test_openmeteo_parse_daily():
    from sources.openmeteo import parse_daily

    payload = [{"daily": {"time": ["2026-10-01"], "temperature_2m_min": [22], "temperature_2m_max": [31],
                          "precipitation_sum": [3.2], "relative_humidity_2m_mean": [80],
                          "wind_speed_10m_mean": [2.0], "shortwave_radiation_sum": [18],
                          "et0_fao_evapotranspiration": [4.1]}}]
    rows = list(parse_daily(payload, [3818232], "open_meteo"))
    assert rows == [(3818232, "2026-10-01", 22, 31, 3.2, 80, 1.5, 18, 4.1, "open_meteo")]


def test_ldd_manual_file_is_mapped(tmp_path):
    import json

    from sources.ldd import LddSaline

    d = tmp_path / "ldd" / "manual" / "2026-10-10"
    d.mkdir(parents=True)
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"SALINITY": "2", "SALT_PCT": 12.5},
         "geometry": {"type": "Polygon", "coordinates": [[[103.2, 16.0], [103.3, 16.0], [103.3, 16.1], [103.2, 16.0]]]}}]}
    (d / "saline_msk.geojson").write_text(json.dumps(fc))
    ctx = RunContext(raw_root=tmp_path)
    src = LddSaline()
    chk = src.check(ctx)
    assert chk.skip_reason is None and chk.token
    rows = list(src.produce(ctx, src.fetch(ctx))["saline_soil_zones"].rows)
    assert rows[0][:3] == ("high", 12.5, "inland_rock_salt")
