import type { LatLng, PolygonGeoJSON } from '@rice/contracts';
import type { ValidationKey } from '@/lib/geo/validate';

/**
 * Emitted by <FieldDrawer onPolygonChange> after each debounced (400 ms) recompute.
 * UI-local shape (not an API contract) — the result panel subscribes to it.
 */
export type FieldDrawResult = {
  /** current vertices, CCW-sorted once 4 are placed */
  vertices: LatLng[];
  /** closed [lng,lat] ring; null until 4 vertices are placed */
  polygon: PolygonGeoJSON | null;
  /** m², WGS84 ellipsoidal (`lib/geo/area.ts` areaM2 — same as PostGIS geography); 0 below 3 vertices */
  areaM2: number;
  /** true = OK to call /api/analyze (no blocking error, area warnings confirmed) */
  valid: boolean;
  /** non-blocking warnings (keys into th.map.json → validation.*) */
  warnings: ValidationKey[];
  /** blocking errors */
  errors: ValidationKey[];
  /** area warnings are present and the user has not confirmed yet */
  needsConfirm: boolean;
};
