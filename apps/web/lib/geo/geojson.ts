import type { LatLng, LngLat, PolygonGeoJSON } from '@rice/contracts';

/** Vertices (LatLng) → closed GeoJSON Polygon ring in [lng, lat] order (contracts `PolygonGeoJSON`). */
export function toGeoJSON(vertices: readonly LatLng[]): PolygonGeoJSON {
  if (vertices.length < 3) throw new Error('polygon needs at least 3 vertices');
  const ring: LngLat[] = vertices.map((v) => [v.lng, v.lat]);
  ring.push([vertices[0]!.lng, vertices[0]!.lat]);
  return { type: 'Polygon', coordinates: [ring] };
}

/** Closed GeoJSON ring → open vertex list (drops the duplicated closing position). */
export function fromGeoJSON(polygon: PolygonGeoJSON): LatLng[] {
  const ring = polygon.coordinates[0]!;
  return ring.slice(0, -1).map(([lng, lat]) => ({ lat, lng }));
}
