/**
 * Display-unit conversions for model outputs (SPEC §9, §14). Model works per hectare / mm;
 * farmers read per ไร่ and ลบ.ม./ไร่.
 */
import { HA_PER_RAI, M2_PER_RAI, type Percentiles } from '@rice/contracts';

/** kg/ha → กก./ไร่ */
export const kgHaToKgRai = (kgHa: number): number => kgHa * HA_PER_RAI;
/** t/ha → ตัน/ไร่ */
export const tHaToTRai = (tHa: number): number => tHa * HA_PER_RAI;
/** mm of water depth → ลบ.ม./ไร่ (1 mm × 1,600 m² = 1.6 m³) */
export const mmToM3PerRai = (mm: number): number => (mm / 1000) * M2_PER_RAI;

export const percentilesMap = (p: Percentiles, f: (v: number) => number): Percentiles => ({
  p10: f(p.p10),
  p50: f(p.p50),
  p90: f(p.p90),
});

/** Linear-interpolated quantile (q in 0..1) of a non-empty list. */
export function quantile(values: readonly number[], q: number): number {
  const xs = values
    .filter(Number.isFinite)
    .slice()
    .sort((a, b) => a - b);
  if (xs.length === 0) return Number.NaN;
  const pos = (xs.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return xs[lo]! + (xs[hi]! - xs[lo]!) * (pos - lo);
}

/** P10/P50/P90 across a list (e.g. per-year ensemble members). */
export function percentilesOf(values: readonly number[]): Percentiles {
  return { p10: quantile(values, 0.1), p50: quantile(values, 0.5), p90: quantile(values, 0.9) };
}
