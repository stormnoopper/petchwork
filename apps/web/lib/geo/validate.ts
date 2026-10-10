import { distance as turfDistance, kinks as turfKinks, point } from '@turf/turf';
import { MAX_VERTICES_PHASE1, M2_PER_RAI, type LatLng } from '@rice/contracts';
import { toGeoJSON } from './geojson';
import { areaM2 } from './area';

/** SPEC §5.2 thresholds */
export const MIN_AREA_RAI = 0.5;
export const MAX_AREA_RAI = 500;
export const MAX_EDGE_KM = 3;

/** Keys into `messages/th.map.json` → `validation.*` */
export type ValidationKey =
  'incomplete' | 'selfIntersecting' | 'areaTooSmall' | 'areaTooLarge' | 'edgeTooLong';

export type ValidationResult = {
  /** false when a blocking error exists (do not analyze) */
  ok: boolean;
  errors: ValidationKey[];
  warnings: ValidationKey[];
  /** warnings that need the user's explicit "ยืนยันว่าถูกต้อง" before analyzing */
  needsConfirm: boolean;
};

export function hasKinks(vertices: readonly LatLng[]): boolean {
  if (vertices.length < 4) return false;
  return turfKinks(toGeoJSON(vertices)).features.length > 0;
}

export function edgeLengthsKm(vertices: readonly LatLng[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    out.push(turfDistance(point([a.lng, a.lat]), point([b.lng, b.lat]), { units: 'kilometers' }));
  }
  return out;
}

/**
 * Client-side polygon checks (SPEC §5.2). Outside-Thailand / province checks happen on the server.
 * @param areaM2Override precomputed area (m²) from `areaM2()`; computed (WGS84 ellipsoidal) when omitted.
 */
export function validatePolygon(
  vertices: readonly LatLng[],
  areaM2Override?: number,
  required = MAX_VERTICES_PHASE1,
): ValidationResult {
  if (vertices.length < required) {
    return { ok: false, errors: ['incomplete'], warnings: [], needsConfirm: false };
  }
  const errors: ValidationKey[] = [];
  const warnings: ValidationKey[] = [];

  if (hasKinks(vertices)) errors.push('selfIntersecting');

  const rai = (areaM2Override ?? areaM2(vertices)) / M2_PER_RAI;
  if (rai < MIN_AREA_RAI) warnings.push('areaTooSmall');
  else if (rai > MAX_AREA_RAI) warnings.push('areaTooLarge');

  if (edgeLengthsKm(vertices).some((km) => km > MAX_EDGE_KM)) warnings.push('edgeTooLong');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    needsConfirm: warnings.includes('areaTooSmall') || warnings.includes('areaTooLarge'),
  };
}
