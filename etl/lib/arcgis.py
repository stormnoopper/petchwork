"""ArcGIS REST FeatureLayer helpers.

* check-for-change: `returnIdsOnly` (count + sha256 of the sorted object ids)
* fetch: `resultOffset` pagination when the layer supports it (DMR, maxRecordCount 2000);
  otherwise chunks of objectIds via POST (GISTDA 10.1 servers reject pagination).
Every page is saved raw (GeoJSON) under the run's raw dir.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from . import http

log = logging.getLogger("etl.arcgis")


def layer_info(url: str) -> dict:
    return http.get_json(url, params={"f": "json"})


def _spatial_params(bbox: tuple[float, float, float, float] | None) -> dict:
    if not bbox:
        return {}
    return {
        "geometry": ",".join(f"{v}" for v in bbox),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
    }


def object_ids(url: str, bbox=None, where: str = "1=1") -> tuple[str, list[int]]:
    params = {"where": where, "returnIdsOnly": "true", "f": "json", **_spatial_params(bbox)}
    d = http.request("POST", f"{url}/query", data=params).json()
    if "error" in d:
        raise http.FetchError(f"ArcGIS error: {d['error']}")
    return d.get("objectIdFieldName") or "OBJECTID", sorted(d.get("objectIds") or [])


def change_token(url: str, bbox=None, where: str = "1=1") -> str:
    _, ids = object_ids(url, bbox, where)
    return f"n={len(ids)};ids={http.sha256_bytes(json.dumps(ids))[:16]}"


def fetch_features(
    url: str,
    raw_dir: Path,
    *,
    bbox=None,
    where: str = "1=1",
    out_fields: str = "*",
    max_allowable_offset: float | None = None,
    page_size: int | None = None,
    prefix: str = "page",
) -> tuple[list[dict], list[Path]]:
    """Return (GeoJSON features in EPSG:4326, saved page files)."""
    info = layer_info(url)
    max_rc = int(info.get("maxRecordCount") or 1000)
    page = min(page_size or max_rc, max_rc)
    adv = info.get("advancedQueryCapabilities") or {}
    supports_paging = bool(adv.get("supportsPagination"))
    base = {
        "where": where,
        "outFields": out_fields,
        "outSR": "4326",
        "returnGeometry": "true",
        "f": "geojson",
    }
    if max_allowable_offset:
        base["maxAllowableOffset"] = str(max_allowable_offset)

    feats: list[dict] = []
    files: list[Path] = []

    def _save(n: int, payload: dict) -> None:
        p = raw_dir / f"{prefix}_{n:04d}.geojson"
        p.write_text(json.dumps(payload, ensure_ascii=False))
        files.append(p)

    if supports_paging:
        oid_field, _ = info.get("objectIdField"), None
        offset, n = 0, 0
        while True:
            params = {
                **base,
                **_spatial_params(bbox),
                "resultOffset": str(offset),
                "resultRecordCount": str(page),
                "orderByFields": oid_field or "OBJECTID",
            }
            d = http.request("POST", f"{url}/query", data=params).json()
            if "error" in d:
                raise http.FetchError(f"ArcGIS error: {d['error']}")
            fs = d.get("features") or []
            _save(n, d)
            feats.extend(fs)
            n += 1
            log.info("  page %d: %d features (total %d)", n, len(fs), len(feats))
            exceeded = d.get("exceededTransferLimit") or (d.get("properties") or {}).get("exceededTransferLimit")
            if not fs or (len(fs) < page and not exceeded):
                break
            offset += len(fs)
    else:
        oid_field, ids = object_ids(url, bbox, where)
        chunk = min(page, 200)  # keep POST bodies / responses moderate
        for n, k in enumerate(range(0, len(ids), chunk)):
            params = {**base, "objectIds": ",".join(map(str, ids[k : k + chunk]))}
            params.pop("where")
            d = http.request("POST", f"{url}/query", data=params).json()
            if "error" in d:
                raise http.FetchError(f"ArcGIS error: {d['error']}")
            fs = d.get("features") or []
            _save(n, d)
            feats.extend(fs)
            log.info("  ids chunk %d: %d features (total %d/%d)", n + 1, len(fs), len(feats), len(ids))
        if len(feats) != len(ids):
            raise http.FetchError(f"expected {len(ids)} features, got {len(feats)}")
    return feats, files
