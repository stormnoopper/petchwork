"""DMR หน่วยหิน 1:250,000 → ref.geology_units (DATA_SOURCES §1).

* ArcGIS REST GEOL/ROCK_UNIT_250K/MapServer/0, maxRecordCount 2000 → resultOffset paging
* check-for-change: returnIdsOnly (count + hash of ids) within the run scope
* is_maha_sarakham = TEXT_SYM = 'KTms' · rock_salt_depth_m = null (no source yet)
"""
from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import shape

from lib import arcgis
from lib.config import RunContext
from sources.base import CheckResult, Rows, Source, Target

URL = "https://gisportal.dmr.go.th/arcgis/rest/services/GEOL/ROCK_UNIT_250K/MapServer/0"

# Formation names for common symbols (DMR legend). Unknown symbols → unit_name null.
UNIT_NAMES = {
    "KTms": "หมวดหินมหาสารคาม",
    "KTpt": "หมวดหินภูทอก",
    "Kkk": "หมวดหินโคกกรวด",
    "Kpp": "หมวดหินภูพาน",
    "Ksk": "หมวดหินเสาขัว",
    "Jpw": "หมวดหินพระวิหาร",
    "Jpk": "หมวดหินภูกระดึง",
    "Qa": "ตะกอนน้ำพา",
    "Qt": "ตะกอนตะพักลำน้ำ",
    "Qc": "ตะกอนเศษหินเชิงเขา",
}


class DmrRockUnits(Source):
    code = "dmr_rock_250k"
    tier = "semiannual"
    attribution = "กรมทรัพยากรธรณี"
    targets = [
        Target(
            table="geology_units",
            simplify_tol=0.0002,  # ≈ 22 m — well below 1:250k positional accuracy
            required=("unit_code", "is_maha_sarakham"),
            coverage_flag="enabled",
        )
    ]

    def _bbox(self, ctx: RunContext):
        return None if ctx.nationwide else ctx.bbox

    def check(self, ctx: RunContext) -> CheckResult:
        return CheckResult(token=arcgis.change_token(URL, self._bbox(ctx)))

    def fetch(self, ctx: RunContext) -> list[Path]:
        _, files = arcgis.fetch_features(URL, ctx.raw_dir(self.code), bbox=self._bbox(ctx),
                                         out_fields="OBJECTID,TEXT_SYM,YEAR_COMPI")
        return files

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:
        def rows():
            for f in files:
                for feat in json.loads(f.read_text()).get("features", []):
                    if not feat.get("geometry"):
                        continue
                    p = feat.get("properties") or {}
                    sym = (p.get("TEXT_SYM") or "").strip() or None
                    yield (sym, UNIT_NAMES.get(sym or ""), sym == "KTms", None, shape(feat["geometry"]).wkb)

        return {"geology_units": Rows(["unit_code", "unit_name", "is_maha_sarakham", "rock_salt_depth_m", "geom"], rows())}
