"""Source registry: meta.data_sources.code → Source class, plus CLI aliases."""
from __future__ import annotations

from sources.base import Source


def registry() -> dict[str, type[Source]]:
    from sources.dem import CopernicusDem
    from sources.dgr import DgrGroundwater
    from sources.dmr import DmrRockUnits
    from sources.era5land import Era5LandBackfill
    from sources.gistda import GistdaAdmin, GistdaIrrigation
    from sources.ldd import LddSaline, LddSoil
    from sources.openmeteo import OpenMeteoDaily
    from sources.nasapower import NasaPower
    from sources.phase2 import Chirps, GistdaRiceCalendar, HdxCodab, JrcSurfaceWater, NexGddpCmip6, Sentinel2, Tmd
    from sources.soilgrids import SoilGrids
    from sources.thaiwater import ThaiWater

    classes = [DmrRockUnits, GistdaIrrigation, GistdaAdmin, DgrGroundwater, OpenMeteoDaily, Era5LandBackfill,
               SoilGrids, CopernicusDem, ThaiWater, LddSoil, LddSaline, Sentinel2, Chirps, NexGddpCmip6,
               JrcSurfaceWater, HdxCodab, GistdaRiceCalendar, Tmd, NasaPower]
    return {c.code: c for c in classes}


ALIASES: dict[str, list[str]] = {
    "dmr": ["dmr_rock_250k"],
    "gistda": ["gistda_irrigation", "gistda_admin"],
    "irrigation": ["gistda_irrigation"],
    "admin": ["gistda_admin"],
    "dgr": ["dgr_groundwater"],
    "openmeteo": ["open_meteo"],
    "era5land": ["era5_land"],
    "era5": ["era5_land"],
    "nasa": ["nasa_power"],
    "nasapower": ["nasa_power"],
    "dem": ["cop_dem"],
    "ldd": ["ldd_soil", "ldd_saline"],
    "cmip6": ["nex_gddp_cmip6"],
    "jrc": ["jrc_gsw"],
    "grid": ["soilgrids", "cop_dem"],
}


def resolve(names: list[str]) -> list[str]:
    reg = registry()
    out: list[str] = []
    for n in names:
        for code in ALIASES.get(n, [n]):
            if code not in reg:
                raise SystemExit(f"unknown source '{n}'. Known: {', '.join(sorted(set(reg) | set(ALIASES)))}")
            if code not in out:
                out.append(code)
    return out
