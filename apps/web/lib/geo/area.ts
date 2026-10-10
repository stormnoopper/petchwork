import { area as turfArea } from '@turf/turf';
import type { LatLng } from '@rice/contracts';
import { toGeoJSON } from './geojson';

export { toRaiNganWa, formatRaiNganWa } from '@/lib/units';

// WGS84 ellipsoid (same as PostGIS `geography` / EPSG:4326).
const WGS84_A = 6_378_137;
const WGS84_F = 1 / 298.257223563;
const E2 = WGS84_F * (2 - WGS84_F);
const E = Math.sqrt(E2);
const DEG = Math.PI / 180;

/** q(φ) for the authalic-latitude transform (Snyder 1987, eq. 3-12). */
function authalicQ(sinPhi: number): number {
  const es = E * sinPhi;
  return (1 - E2) * (sinPhi / (1 - es * es) - (1 / (2 * E)) * Math.log((1 - es) / (1 + es)));
}
const QP = authalicQ(1);
/** Authalic sphere radius: a sphere with the same surface area as the WGS84 ellipsoid (≈ 6 371 007 m). */
export const AUTHALIC_RADIUS_M = WGS84_A * Math.sqrt(QP / 2);

/** Authalic latitude β (radians) for a geodetic latitude in degrees. */
function authalicLat(latDeg: number): number {
  const ratio = authalicQ(Math.sin(latDeg * DEG)) / QP;
  return Math.asin(Math.max(-1, Math.min(1, ratio)));
}

/**
 * Ellipsoidal (WGS84) polygon area in m² — the single area computation used for everything the
 * client displays or validates (SPEC §5.2, §12). Matches PostGIS `ST_Area(geography)` (GeographicLib)
 * and therefore the DB column `app.fields.area_rai` / `profile.area_m2` to ~1e-6 for field-size polygons.
 *
 * Method: map latitudes to authalic latitude (equal-area map ellipsoid → sphere of radius R_q),
 * then take the exact spherical excess of the ring (per-edge tan-half-angle formula, as used by
 * GeographicLib / Google's computeSignedArea). Geodesic-vs-great-circle edge differences are
 * negligible at field scale (< 1e-7 relative for km-long edges).
 *
 * Unlike turf / google `computeArea` (sphere of radius 6 378 137 m, ~+0.5% at Thai latitudes)
 * this does not overestimate.
 */
export function areaM2Ellipsoidal(vertices: readonly LatLng[]): number {
  const n = vertices.length;
  if (n < 3) return 0;
  let excess = 0;
  for (let i = 0; i < n; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % n]!;
    if (a.lat === b.lat && a.lng === b.lng) continue;
    let dLng = (b.lng - a.lng) * DEG;
    // wrap to (-π, π] so an antimeridian-crossing edge takes the short way
    if (dLng > Math.PI) dLng -= 2 * Math.PI;
    else if (dLng <= -Math.PI) dLng += 2 * Math.PI;
    const t1 = Math.tan(authalicLat(a.lat) / 2);
    const t2 = Math.tan(authalicLat(b.lat) / 2);
    excess += 2 * Math.atan2(Math.tan(dLng / 2) * (t1 + t2), 1 + t1 * t2);
  }
  return Math.abs(excess) * AUTHALIC_RADIUS_M * AUTHALIC_RADIUS_M;
}

/**
 * Spherical area (m²) via turf (sphere R = 6 378 137 m) — kept only as a cross-check.
 * Reads ~0.5% high versus the ellipsoidal value; never display it.
 */
export function areaM2Turf(vertices: readonly LatLng[]): number {
  if (vertices.length < 3) return 0;
  return turfArea(toGeoJSON(vertices));
}

/**
 * Field area (m²) for display and validation — always the WGS84 ellipsoidal value so the map
 * badge, result panel, saved field (`app.fields.area_rai`) and report agree (SPEC §12).
 * Pure: does not depend on any map SDK.
 */
export function areaM2(vertices: readonly LatLng[]): number {
  return areaM2Ellipsoidal(vertices);
}

/** Relative difference between two area estimates (for cross-checks). */
export function relativeDiff(a: number, b: number): number {
  const m = Math.max(Math.abs(a), Math.abs(b));
  return m === 0 ? 0 : Math.abs(a - b) / m;
}
