import type { LatLng } from '@rice/contracts';

/**
 * Fit vertices into a `width × height` SVG box (equirectangular, x scaled by cos(lat)),
 * preserving aspect ratio and centring. Returns "x,y x,y …" for <polygon points>.
 */
export function verticesToSvgPoints(
  vertices: readonly LatLng[],
  width: number,
  height: number,
  pad = 8,
): string {
  if (vertices.length === 0) return '';
  const lat0 = vertices.reduce((s, v) => s + v.lat, 0) / vertices.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const pts = vertices.map((v) => ({ x: v.lng * k, y: -v.lat }));
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  return pts
    .map(
      (p) =>
        `${((p.x - minX) * scale + offX).toFixed(1)},${((p.y - minY) * scale + offY).toFixed(1)}`,
    )
    .join(' ');
}

/** Closed GeoJSON polygon from vertices ([lng,lat], first point repeated). */
export function verticesToPolygon(vertices: readonly LatLng[]) {
  const ring = vertices.map((v) => [v.lng, v.lat] as [number, number]);
  if (ring.length > 0) ring.push([ring[0]![0], ring[0]![1]]);
  return { type: 'Polygon' as const, coordinates: [ring] };
}
