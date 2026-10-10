import type { Confidence, ConfidenceTag } from '@rice/contracts';

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Area-weighted mean of a nullable attribute; null when no part has a value. */
export function weightedMean<T extends { w: number }>(
  parts: readonly T[],
  get: (p: T) => number | null,
): number | null {
  let sw = 0;
  let sv = 0;
  for (const p of parts) {
    const v = get(p);
    if (v == null || !Number.isFinite(v) || p.w <= 0) continue;
    sw += p.w;
    sv += p.w * v;
  }
  return sw > 0 ? sv / sw : null;
}

/** Percentile with linear interpolation (Hyndman & Fan type 7). */
export function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * (h - lo);
}

export function percentiles(values: readonly number[]): { p10: number; p50: number; p90: number } {
  const s = [...values].sort((a, b) => a - b);
  return { p10: percentile(s, 0.1), p50: percentile(s, 0.5), p90: percentile(s, 0.9) };
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/** The weaker of two confidence tags (sources joined). */
export function minConfidence(a: ConfidenceTag, b: ConfidenceTag): ConfidenceTag {
  const level = RANK[a.level] <= RANK[b.level] ? a.level : b.level;
  return { level, source: a.source === b.source ? a.source : `${a.source}; ${b.source}` };
}
