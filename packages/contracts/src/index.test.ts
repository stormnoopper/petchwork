import { describe, expect, it } from 'vitest';
import { AnalyzeRequest, DEFAULT_PRACTICES, Practices, PolygonGeoJSON } from './index';

const ring: [number, number][] = [
  [103.25, 16.05],
  [103.26, 16.05],
  [103.26, 16.06],
  [103.25, 16.06],
  [103.25, 16.05],
];

describe('contracts', () => {
  it('accepts closed polygon', () => {
    expect(PolygonGeoJSON.safeParse({ type: 'Polygon', coordinates: [ring] }).success).toBe(true);
  });
  it('rejects open ring', () => {
    expect(PolygonGeoJSON.safeParse({ type: 'Polygon', coordinates: [ring.slice(0, 4)] }).success).toBe(false);
  });
  it('defaults are valid practices', () => {
    expect(Practices.parse(DEFAULT_PRACTICES)).toEqual(DEFAULT_PRACTICES);
  });
  it('analyze request with partial practices', () => {
    const r = AnalyzeRequest.safeParse({ polygon: { type: 'Polygon', coordinates: [ring] }, practices: { waterRegime: 'awd' } });
    expect(r.success).toBe(true);
  });
});
