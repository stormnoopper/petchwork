"""Phase-2 stubs — uniform interface, always `skipped: not_implemented` (no network, no DB writes
besides the ingest_jobs row). Each docstring is the implementation TODO.
"""
from __future__ import annotations

from sources.base import GRID_UPDATE, MERGE, StubSource, Target


class Sentinel2(StubSource):
    """TODO(Phase 2) Sentinel-2 L2A dry-season (Jan–Apr) median → ref.grid_cells.si_dry_season
    (= sqrt(Blue × Red), reflectance 0–1, D-010) + obs.sat_indices per field (NDVI/NDWI/SI).
    Via Google Earth Engine (GEE_SERVICE_ACCOUNT_JSON) reduceRegions on the 0.01° grid, or
    Element84 earth-search STAC COGs + rasterio. Mask clouds with SCL; inner buffer −10 m for fields."""

    code = "sentinel2"
    tier = "quarterly"
    targets = [Target(table="grid_cells", mode=GRID_UPDATE, has_geom=False, grid_columns=("si_dry_season",),
                      ranges={"si_dry_season": (0, 1)})]
    reason = "not_implemented: Phase 2 (Sentinel-2 SI via GEE/STAC)"


class Chirps(StubSource):
    """TODO(Phase 2) CHIRPS 2.0 daily p05 GeoTIFF (data.chc.ucsb.edu/products/CHIRPS-2.0/global_daily/tifs/p05/<y>/)
    → 30-y normals ref.grid_cells.rain_normal_mm (block mean to 0.01°) + bias-correction of ERA5 rain."""

    code = "chirps"
    tier = "quarterly"
    targets = [Target(table="grid_cells", mode=GRID_UPDATE, has_geom=False, grid_columns=("rain_normal_mm",))]
    reason = "not_implemented: Phase 2 (CHIRPS normals)"


class NexGddpCmip6(StubSource):
    """TODO(Phase 2) NEX-GDDP-CMIP6 (s3://nex-gddp-cmip6, NetCDF 0.25°) 5 GCM × SSP2-4.5/SSP5-8.5, 2026–2036
    → obs.weather_daily_proj (bilinear to 0.1° weather grid; ET0 Hargreaves/PM)."""

    code = "nex_gddp_cmip6"
    tier = "static"
    targets = [Target(table="weather_daily_proj", schema="obs", mode=MERGE, has_geom=False,
                      key=("weather_grid_id", "gcm", "ssp", "date"))]
    reason = "not_implemented: Phase 2 (CMIP6 projections)"


class JrcSurfaceWater(StubSource):
    """TODO(Phase 2) JRC GSW occurrence tiles (storage.googleapis.com/global-surface-water/downloads2021/occurrence/)
    → ref.water_bodies polygons (occurrence ≥ 50 %, area ≥ 1 ha), keep ThaiWater ids on overlap."""

    code = "jrc_gsw"
    tier = "semiannual"
    targets = [Target(table="water_bodies", geom_type="any")]
    reason = "not_implemented: Phase 2 (JRC surface water)"


class HdxCodab(StubSource):
    """TODO HDX COD-AB Thailand subdistricts (437 MB zip) → ref.admin_boundaries level='subdistrict'
    (code = ADM3_PCODE without 'TH' prefix → 6-digit DOPA). Pipeline keeps province/district rows."""

    code = "hdx_codab"
    tier = "semiannual"
    targets = [Target(table="admin_boundaries")]
    reason = "not_implemented: subdistricts (HDX COD-AB) — next iteration"


class GistdaRiceCalendar(StubSource):
    """TODO(Phase 2) GISTDA half-monthly rice area 2015–2018 → ref.grid_cells.plant_doy_wet / plant_doy_dry."""

    code = "gistda_rice_calendar"
    tier = "static"
    targets = [Target(table="grid_cells", mode=GRID_UPDATE, has_geom=False,
                      grid_columns=("plant_doy_wet", "plant_doy_dry"))]
    reason = "not_implemented: Phase 2 (planting calendar)"


class Tmd(StubSource):
    """TODO TMD WeatherToday (needs TMD_API_KEY) — bias-correct reference only, no history."""

    code = "tmd"
    tier = "daily"
    reason = "not_implemented: TMD key pending (bias-correction only)"


class NasaPower(StubSource):
    """Backup weather source (power.larc.nasa.gov) — used only if Open-Meteo is down."""

    code = "nasa_power"
    tier = "static"
    reason = "not_implemented: backup source"
