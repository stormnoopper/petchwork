import { describe, expect, it } from 'vitest';
import { prepareInitialVertices, signedPlanarArea } from './order';

const sq = [
  { lat: 16.0, lng: 103.0 },
  { lat: 16.001, lng: 103.001 }, // crossed order 1-3-2-4
  { lat: 16.0, lng: 103.001 },
  { lat: 16.001, lng: 103.0 },
];

describe('prepareInitialVertices (draft restore)', () => {
  it('returns [] for missing / empty input', () => {
    expect(prepareInitialVertices(undefined)).toEqual([]);
    expect(prepareInitialVertices(null)).toEqual([]);
    expect(prepareInitialVertices([])).toEqual([]);
  });

  it('keeps partial drafts in the given order', () => {
    expect(prepareInitialVertices(sq.slice(0, 2))).toEqual(sq.slice(0, 2));
  });

  it('CCW-sorts a complete quad and keeps the first vertex first', () => {
    const out = prepareInitialVertices(sq);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual(sq[0]);
    expect(signedPlanarArea(out)).toBeGreaterThan(0);
  });

  it('drops invalid points, strips extra keys and caps at 4', () => {
    const out = prepareInitialVertices([
      { lat: 'x', lng: 1 },
      { lat: 95, lng: 103 },
      null,
      { ...sq[0], extra: true },
      ...sq.slice(1),
      { lat: 16.5, lng: 103.5 },
    ]);
    expect(out).toHaveLength(4);
    expect(out.every((p) => Object.keys(p).sort().join() === 'lat,lng')).toBe(true);
    expect(out).not.toContainEqual({ lat: 16.5, lng: 103.5 });
  });
});
