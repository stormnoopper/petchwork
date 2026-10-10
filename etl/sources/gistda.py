"""GISTDA ArcGIS REST (DATA_SOURCES §6–7).

gistda_irrigation : L09_rice/พื้นที่ชลประทาน_/MapServer/0 → ref.irrigation_zones (615 polygons nationwide)
gistda_admin      : L05_AdminBoundary/L05_Province_GISTDA_50k (77) + L05_Amphoe_GISTDA_50k (928)
                    → ref.admin_boundaries (level province / district)

Province code mapping (verified 2026-10-10): GISTDA `PV_CODE` is already the 2-digit DOPA code
('44' มหาสารคาม, '40' ขอนแก่น, '72' สุพรรณบุรี) = seed codes → stored as-is in `code`/`province_code`.
District `code` = `AP_IDN` (4-digit DOPA, e.g. 4401 = เมืองมหาสารคาม) = seed '4401'.
`region` = lower(RE_ROYIN) (Royal Institute 6-region: north/northeast/central/east/west/south).
Subdistrict rows are owned by hdx_codab and are always kept.

GISTDA servers are ArcGIS 10.1: no pagination → objectIds chunks (lib/arcgis.py).
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote

from shapely.geometry import shape

from lib import arcgis, http
from lib.config import RunContext
from lib.provinces import region
from sources.base import CheckResult, Rows, Source, Target

ROOT = "https://gistdaportal.gistda.or.th/data/rest/services"
IRRIGATION_URL = f"{ROOT}/L09_rice/{quote('พื้นที่ชลประทาน_')}/MapServer/0"
PROVINCE_URL = f"{ROOT}/L05_AdminBoundary/L05_Province_GISTDA_50k/MapServer/0"
AMPHOE_URL = f"{ROOT}/L05_AdminBoundary/L05_Amphoe_GISTDA_50k/MapServer/0"


class GistdaIrrigation(Source):
    code = "gistda_irrigation"
    tier = "semiannual"
    attribution = "GISTDA"
    targets = [Target(table="irrigation_zones", simplify_tol=0.0001, required=("project_name",))]

    def _bbox(self, ctx):
        return None if ctx.nationwide else ctx.bbox

    def check(self, ctx: RunContext) -> CheckResult:
        return CheckResult(token=arcgis.change_token(IRRIGATION_URL, self._bbox(ctx)))

    def fetch(self, ctx: RunContext) -> list[Path]:
        _, files = arcgis.fetch_features(
            IRRIGATION_URL, ctx.raw_dir(self.code), bbox=self._bbox(ctx),
            out_fields="FID,PROJNAME,PROJCODE,PROVNAME,Type,IRR_Zone", max_allowable_offset=0.00005)
        return files

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:
        def rows():
            for f in files:
                for feat in json.loads(f.read_text()).get("features", []):
                    if not feat.get("geometry"):
                        continue
                    p = feat.get("properties") or {}
                    name = (p.get("PROJNAME") or "").strip() or (p.get("PROJCODE") or "").strip() or "ไม่ระบุชื่อโครงการ"
                    yield (name, shape(feat["geometry"]).wkb)

        return {"irrigation_zones": Rows(["project_name", "geom"], rows())}


class GistdaAdmin(Source):
    code = "gistda_admin"
    tier = "semiannual"
    attribution = "GISTDA"
    targets = [
        Target(
            table="admin_boundaries",
            simplify_tol=0.0001,
            required=("code", "level", "province_code", "region"),
            # provinces are always fetched nationwide; districts within scope
            keep_where="level = 'subdistrict' or (level = 'district' and not ST_Intersects(geom, ST_GeomFromText(%(bbox)s, 4326)))",
            keep_where_on_seed="level = 'subdistrict'",
        )
    ]

    def _bbox(self, ctx):
        return None if ctx.nationwide else ctx.bbox

    def check(self, ctx: RunContext) -> CheckResult:
        t1 = arcgis.change_token(PROVINCE_URL)
        t2 = arcgis.change_token(AMPHOE_URL, self._bbox(ctx))
        return CheckResult(token=http.sha256_bytes(t1, t2)[:24], info={"province": t1, "amphoe": t2})

    def fetch(self, ctx: RunContext) -> list[Path]:
        raw = ctx.raw_dir(self.code)
        fields_p = "PV_CODE,PV_TN,PV_EN,RE_ROYIN"
        fields_a = "AP_IDN,AP_TN,AP_EN,PV_CODE,RE_ROYIN"
        _, f1 = arcgis.fetch_features(PROVINCE_URL, raw, out_fields=fields_p, max_allowable_offset=0.0001,
                                      prefix="province")
        _, f2 = arcgis.fetch_features(AMPHOE_URL, raw, bbox=self._bbox(ctx), out_fields=fields_a,
                                      max_allowable_offset=0.0001, prefix="amphoe")
        return f1 + f2

    def produce(self, ctx: RunContext, files: list[Path]) -> dict[str, Rows]:
        def rows():
            for f in files:
                is_prov = f.name.startswith("province")
                for feat in json.loads(f.read_text()).get("features", []):
                    if not feat.get("geometry"):
                        continue
                    p = feat.get("properties") or {}
                    pv = str(p.get("PV_CODE") or "").zfill(2)
                    if is_prov:
                        yield ("province", pv, p.get("PV_TN"), p.get("PV_EN"), pv, region(p.get("RE_ROYIN")),
                               shape(feat["geometry"]).wkb)
                    else:
                        code = str(p.get("AP_IDN") or "")
                        yield ("district", code, p.get("AP_TN"), p.get("AP_EN"), pv, region(p.get("RE_ROYIN")),
                               shape(feat["geometry"]).wkb)

        return {"admin_boundaries": Rows(["level", "code", "name_th", "name_en", "province_code", "region", "geom"], rows())}
