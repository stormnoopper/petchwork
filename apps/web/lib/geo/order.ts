import { LatLng as LatLngSchema, MAX_VERTICES_PHASE1, type LatLng } from '@rice/contracts';

/** Arithmetic mean of vertices — good enough as a pivot / label anchor for a field-sized quad. */
export function vertexCentroid(vertices: readonly LatLng[]): LatLng {
  const n = vertices.length;
  if (n === 0) throw new Error('no vertices');
  let lat = 0;
  let lng = 0;
  for (const v of vertices) {
    lat += v.lat;
    lng += v.lng;
  }
  return { lat: lat / n, lng: lng / n };
}

/**
 * Sort vertices counter-clockwise by angle around their centroid (SPEC §5.2) so that
 * taps in a crossed order (e.g. 1-3-2-4) do not produce a "butterfly" polygon.
 *
 * The ring is rotated so the vertex that was first in the input stays first —
 * marker numbering stays as stable as possible for the user.
 * Longitude is scaled by cos(lat) so angles are correct on a local equirectangular plane.
 */
export function sortCounterClockwise(vertices: readonly LatLng[]): LatLng[] {
  if (vertices.length < 3) return [...vertices];
  const c = vertexCentroid(vertices);
  const k = Math.cos((c.lat * Math.PI) / 180);
  const withAngle = vertices.map((v, i) => ({
    v,
    i,
    a: Math.atan2(v.lat - c.lat, (v.lng - c.lng) * k),
  }));
  withAngle.sort((p, q) => p.a - q.a || p.i - q.i);
  const start = withAngle.findIndex((p) => p.i === 0);
  const rotated = [...withAngle.slice(start), ...withAngle.slice(0, start)];
  return rotated.map((p) => p.v);
}

/** Signed area on the local plane; > 0 means counter-clockwise. */
export function signedPlanarArea(vertices: readonly LatLng[]): number {
  let s = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    s += a.lng * b.lat - b.lng * a.lat;
  }
  return s / 2;
}

/**
 * Sanitise restored vertices (e.g. post-login draft): keep valid LatLng only, at most
 * `max`, CCW-sorted once complete — same invariant FieldDrawer keeps while drawing.
 */
export function prepareInitialVertices(
  input: readonly unknown[] | null | undefined,
  max = MAX_VERTICES_PHASE1,
): LatLng[] {
  if (!input?.length) return [];
  const pts: LatLng[] = [];
  for (const p of input) {
    const r = LatLngSchema.safeParse(p);
    if (r.success) pts.push({ lat: r.data.lat, lng: r.data.lng });
    if (pts.length === max) break;
  }
  return pts.length === max ? sortCounterClockwise(pts) : pts;
}
