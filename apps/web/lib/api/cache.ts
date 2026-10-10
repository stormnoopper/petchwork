import { createHash } from 'node:crypto';
import type { AnalyzeRequest, PolygonGeoJSON } from '@rice/contracts';

/** Small LRU cache with per-entry TTL (Map keeps insertion order → first key = least recent). */
export class LruTtlCache<V> {
  private readonly map = new Map<string, { v: V; exp: number }>();

  constructor(
    readonly max: number,
    readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.exp <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit); // refresh recency
    return hit.v;
  }

  set(key: string, v: V): void {
    this.map.delete(key);
    this.map.set(key, { v, exp: this.now() + this.ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }
}

const round6 = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};

/** Polygon ring rounded to 6 decimals (~0.1 m) — the cache identity of a field shape. */
export function roundPolygon(polygon: PolygonGeoJSON): PolygonGeoJSON {
  return {
    type: 'Polygon',
    coordinates: polygon.coordinates.map((ring) => ring.map(([x, y]) => [round6(x), round6(y)] as [number, number])),
  };
}

/** JSON with sorted object keys and `undefined` dropped → stable across key order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** sha256(polygon rounded to 6 dp + practices) — SPEC §8 /api/analyze cache key. */
export function analyzeCacheKey(req: AnalyzeRequest): string {
  const canonical = stableStringify({
    polygon: roundPolygon(req.polygon).coordinates,
    practices: req.practices ?? {},
  });
  return createHash('sha256').update(canonical).digest('hex');
}
