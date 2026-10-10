import { area as turfArea } from '@turf/turf';
import type { LatLng } from '@rice/contracts';
import { toGeoJSON } from './geojson';

export { toRaiNganWa, formatRaiNganWa } from '@/lib/units';

/** Geodesic area (m²) via turf — works without the Google Maps runtime (tests, server). */
export function areaM2Turf(vertices: readonly LatLng[]): number {
  if (vertices.length < 3) return 0;
  return turfArea(toGeoJSON(vertices));
}

type SphericalLike = { computeArea: (path: google.maps.LatLngLiteral[]) => number };

function getSpherical(): SphericalLike | null {
  const g = (globalThis as { google?: typeof google }).google;
  return g?.maps?.geometry?.spherical ?? null;
}

/**
 * Area (m²) — `google.maps.geometry.spherical.computeArea` when the geometry library is
 * loaded (SPEC §5.2), otherwise turf. Both are geodesic; they agree to well within 0.5%.
 */
export function areaM2(vertices: readonly LatLng[]): number {
  if (vertices.length < 3) return 0;
  const spherical = getSpherical();
  if (spherical) return Math.abs(spherical.computeArea(vertices.map((v) => ({ lat: v.lat, lng: v.lng }))));
  return areaM2Turf(vertices);
}

/** Relative difference between two area estimates (for the computeArea ↔ turf cross-check). */
export function relativeDiff(a: number, b: number): number {
  const m = Math.max(Math.abs(a), Math.abs(b));
  return m === 0 ? 0 : Math.abs(a - b) / m;
}
