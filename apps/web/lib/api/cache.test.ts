import { describe, expect, it } from 'vitest';
import type { PolygonGeoJSON } from '@rice/contracts';
import { analyzeCacheKey, LruTtlCache, roundPolygon, stableStringify } from './cache';

const poly = (d = 0): PolygonGeoJSON => ({
  type: 'Polygon',
  coordinates: [
    [
      [103.247 + d, 16.048],
      [103.253, 16.048],
      [103.253, 16.052],
      [103.247 + d, 16.052],
      [103.247 + d, 16.048],
    ],
  ],
});

describe('analyzeCacheKey', () => {
  it('is a sha256 hex and stable', () => {
    const k = analyzeCacheKey({ polygon: poly() });
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(analyzeCacheKey({ polygon: poly() })).toBe(k);
  });

  it('ignores differences below 6 decimals', () => {
    expect(analyzeCacheKey({ polygon: poly(1e-8) })).toBe(analyzeCacheKey({ polygon: poly() }));
    expect(analyzeCacheKey({ polygon: poly(1e-5) })).not.toBe(analyzeCacheKey({ polygon: poly() }));
  });

  it('depends on practices but not on their key order; {} == undefined', () => {
    const a = analyzeCacheKey({ polygon: poly(), practices: { variety: 'RD6', strawBurn: true } });
    const b = analyzeCacheKey({ polygon: poly(), practices: { strawBurn: true, variety: 'RD6' } });
    expect(a).toBe(b);
    expect(a).not.toBe(analyzeCacheKey({ polygon: poly() }));
    expect(analyzeCacheKey({ polygon: poly(), practices: {} })).toBe(analyzeCacheKey({ polygon: poly() }));
  });

  it('roundPolygon normalises -0', () => {
    const p = roundPolygon({ type: 'Polygon', coordinates: [[[-1e-9, 0], [1, 0], [1, 1], [-1e-9, 0]]] });
    expect(Object.is(p.coordinates[0]![0]![0], 0)).toBe(true);
  });

  it('stableStringify sorts keys and drops undefined', () => {
    expect(stableStringify({ b: 1, a: [1, { d: undefined, c: 2 }] })).toBe('{"a":[1,{"c":2}],"b":1}');
  });
});

describe('LruTtlCache', () => {
  it('evicts least-recently used beyond max', () => {
    const c = new LruTtlCache<number>(2, 1000);
    c.set('a', 1);
    c.set('b', 2);
    expect(c.get('a')).toBe(1); // a is now most recent
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
    expect(c.size).toBe(2);
  });

  it('expires entries after ttl', () => {
    let now = 0;
    const c = new LruTtlCache<string>(10, 100, () => now);
    c.set('k', 'v');
    now = 99;
    expect(c.get('k')).toBe('v');
    now = 200;
    expect(c.get('k')).toBeUndefined();
    expect(c.size).toBe(0);
  });
});
