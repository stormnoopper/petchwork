import { describe, expect, it } from 'vitest';
import { PolygonGeoJSON, type LatLng } from '@rice/contracts';
import { areaM2, areaM2Turf, formatRaiNganWa, relativeDiff } from './area';
import { fromGeoJSON, toGeoJSON } from './geojson';
import { signedPlanarArea, sortCounterClockwise } from './order';
import { MAX_EDGE_KM, edgeLengthsKm, hasKinks, validatePolygon } from './validate';

/** turf's sphere: R = 6371008.8 m */
const M_PER_DEG_LAT = (6371008.8 * Math.PI) / 180;

/** Axis-aligned w×h metre rectangle at (lat0, lng0), corners SW, SE, NE, NW (CCW). */
function rect(lat0: number, lng0: number, w: number, h: number): LatLng[] {
  const dLat = h / M_PER_DEG_LAT;
  const dLng = w / (M_PER_DEG_LAT * Math.cos(((lat0 + dLat / 2) * Math.PI) / 180));
  return [
    { lat: lat0, lng: lng0 },
    { lat: lat0, lng: lng0 + dLng },
    { lat: lat0 + dLat, lng: lng0 + dLng },
    { lat: lat0 + dLat, lng: lng0 },
  ];
}

// Maha Sarakham-ish
const LAT = 16.18;
const LNG = 103.3;
const RAI_M2 = 1600;

describe('toGeoJSON', () => {
  it('builds a closed [lng,lat] ring that passes the contract schema', () => {
    const v = rect(LAT, LNG, 40, 40);
    const g = toGeoJSON(v);
    expect(g.coordinates[0]).toHaveLength(5);
    expect(g.coordinates[0]![0]).toEqual([v[0]!.lng, v[0]!.lat]);
    expect(g.coordinates[0]![4]).toEqual(g.coordinates[0]![0]);
    expect(PolygonGeoJSON.safeParse(g).success).toBe(true);
    expect(fromGeoJSON(g)).toEqual(v);
  });

  it('rejects < 3 vertices', () => {
    expect(() => toGeoJSON([{ lat: 1, lng: 1 }])).toThrow();
  });
});

describe('sortCounterClockwise (SPEC §12: crossed order 1-3-2-4)', () => {
  const [sw, se, ne, nw] = rect(LAT, LNG, 200, 120) as [LatLng, LatLng, LatLng, LatLng];

  it('crossed tap order produces kinks before sorting', () => {
    expect(hasKinks([sw, ne, se, nw])).toBe(true);
  });

  it('reorders 1-3-2-4 so the polygon has no kinks and is CCW', () => {
    const sorted = sortCounterClockwise([sw, ne, se, nw]);
    expect(hasKinks(sorted)).toBe(false);
    expect(signedPlanarArea(sorted)).toBeGreaterThan(0);
    // first tapped vertex keeps number 1
    expect(sorted[0]).toEqual(sw);
    expect(sorted).toEqual([sw, se, ne, nw]);
  });

  it('fixes every permutation of a convex quad', () => {
    const pts = [sw, se, ne, nw];
    const perms: LatLng[][] = [];
    const permute = (rest: LatLng[], acc: LatLng[]) => {
      if (rest.length === 0) return void perms.push(acc);
      rest.forEach((p, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, p]));
    };
    permute(pts, []);
    expect(perms).toHaveLength(24);
    for (const p of perms) {
      const s = sortCounterClockwise(p);
      expect(hasKinks(s)).toBe(false);
      expect(s[0]).toEqual(p[0]);
    }
  });

  it('handles an irregular (non-rectangular) field', () => {
    const v: LatLng[] = [
      { lat: 16.1801, lng: 103.3002 },
      { lat: 16.1832, lng: 103.3049 },
      { lat: 16.1795, lng: 103.3041 },
      { lat: 16.1826, lng: 103.2998 },
    ];
    expect(hasKinks(v)).toBe(true);
    expect(hasKinks(sortCounterClockwise(v))).toBe(false);
  });

  it('leaves < 3 points untouched', () => {
    expect(sortCounterClockwise([sw, ne])).toEqual([sw, ne]);
  });
});

describe('area', () => {
  it('40 m × 40 m square = 1 ไร่ ± 0.5%', () => {
    const a = areaM2Turf(rect(LAT, LNG, 40, 40));
    expect(relativeDiff(a, RAI_M2)).toBeLessThan(0.005);
    expect(formatRaiNganWa(a)).toBe('1 ไร่');
  });

  it('is independent of vertex order direction', () => {
    const v = rect(LAT, LNG, 100, 64);
    expect(relativeDiff(areaM2Turf(v), areaM2Turf([...v].reverse()))).toBeLessThan(1e-9);
  });

  it('falls back to turf when google.maps.geometry is not loaded', () => {
    const v = rect(LAT, LNG, 40, 40);
    expect(areaM2(v)).toBe(areaM2Turf(v));
  });

  it('uses google.maps.geometry.spherical.computeArea when available', () => {
    const g = globalThis as { google?: unknown };
    g.google = { maps: { geometry: { spherical: { computeArea: () => -1234 } } } };
    try {
      expect(areaM2(rect(LAT, LNG, 40, 40))).toBe(1234);
    } finally {
      delete g.google;
    }
  });

  it('returns 0 for < 3 vertices', () => {
    expect(areaM2([{ lat: 1, lng: 1 }])).toBe(0);
  });
});

describe('validatePolygon (SPEC §5.2)', () => {
  it('incomplete until 4 points', () => {
    const r = validatePolygon(rect(LAT, LNG, 40, 40).slice(0, 3));
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(['incomplete']);
  });

  it('valid 10-rai field passes cleanly', () => {
    const r = validatePolygon(rect(LAT, LNG, 160, 100));
    expect(r).toEqual({ ok: true, errors: [], warnings: [], needsConfirm: false });
  });

  it('blocks self-intersecting polygons', () => {
    const [a, b, c, d] = rect(LAT, LNG, 160, 100) as [LatLng, LatLng, LatLng, LatLng];
    const r = validatePolygon([a, c, b, d]);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('selfIntersecting');
  });

  it('warns + confirm when area < 0.5 ไร่', () => {
    // 0.45 ไร่ = 720 m² → 30 × 24 m
    const r = validatePolygon(rect(LAT, LNG, 30, 24));
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual(['areaTooSmall']);
    expect(r.needsConfirm).toBe(true);
  });

  it('no warning just above 0.5 ไร่', () => {
    // 0.55 ไร่ = 880 m² → 40 × 22 m
    expect(validatePolygon(rect(LAT, LNG, 40, 22)).warnings).toEqual([]);
  });

  it('warns + confirm when area > 500 ไร่', () => {
    // 510 ไร่ = 816,000 m² → 1000 × 816 m
    const r = validatePolygon(rect(LAT, LNG, 1000, 816));
    expect(r.warnings).toEqual(['areaTooLarge']);
    expect(r.needsConfirm).toBe(true);
  });

  it('no warning just below 500 ไร่', () => {
    // 490 ไร่ = 784,000 m² → 1000 × 784 m
    expect(validatePolygon(rect(LAT, LNG, 1000, 784)).warnings).toEqual([]);
  });

  it('uses the area override (computeArea) when given', () => {
    const r = validatePolygon(rect(LAT, LNG, 160, 100), 100);
    expect(r.warnings).toEqual(['areaTooSmall']);
  });

  it('warns when an edge is > 3 km (no confirm needed by itself)', () => {
    // 3.1 km × 20 m strip ≈ 38.75 ไร่ — area OK, edge too long
    const v = rect(LAT, LNG, 3100, 20);
    expect(Math.max(...edgeLengthsKm(v))).toBeGreaterThan(MAX_EDGE_KM);
    const r = validatePolygon(v);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual(['edgeTooLong']);
    expect(r.needsConfirm).toBe(false);
  });

  it('no edge warning at 2.9 km', () => {
    expect(validatePolygon(rect(LAT, LNG, 2900, 20)).warnings).toEqual([]);
  });
});
