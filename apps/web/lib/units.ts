/**
 * Unit conversions for the display layer (SPEC §5.2, §14).
 * Code works in SI (m², ha); convert to ไร่-งาน-ตร.ว. only when rendering.
 */
import { HA_PER_RAI, M2_PER_NGAN, M2_PER_RAI, M2_PER_SQ_WA } from '@rice/contracts';

const M2_PER_HA = 10_000;

export const m2ToRai = (m2: number): number => m2 / M2_PER_RAI;
export const raiToM2 = (rai: number): number => rai * M2_PER_RAI;
export const m2ToHa = (m2: number): number => m2 / M2_PER_HA;
export const haToM2 = (ha: number): number => ha * M2_PER_HA;
export const raiToHa = (rai: number): number => rai * HA_PER_RAI;
export const haToRai = (ha: number): number => ha / HA_PER_RAI;

export type RaiNganWa = { rai: number; ngan: number; wa: number };

/**
 * Split an area (m²) into whole ไร่ / งาน and ตร.ว. rounded to the nearest integer
 * (with carry, so 399.9 ตร.ว. never shows as "100 ตร.ว.").
 */
export function toRaiNganWa(m2: number): RaiNganWa {
  const totalWa = Math.max(0, Math.round(m2 / M2_PER_SQ_WA));
  const waPerNgan = M2_PER_NGAN / M2_PER_SQ_WA; // 100
  const waPerRai = M2_PER_RAI / M2_PER_SQ_WA; // 400
  const rai = Math.floor(totalWa / waPerRai);
  const rest = totalWa - rai * waPerRai;
  const ngan = Math.floor(rest / waPerNgan);
  const wa = rest - ngan * waPerNgan;
  return { rai, ngan, wa };
}

export function fromRaiNganWa({ rai, ngan, wa }: RaiNganWa): number {
  return rai * M2_PER_RAI + ngan * M2_PER_NGAN + wa * M2_PER_SQ_WA;
}

const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Thai area label, e.g. `12 ไร่ 2 งาน 35 ตร.ว.`.
 * Zero parts are omitted (`3 ไร่ 10 ตร.ว.`); an empty area renders as `0 ตร.ว.`.
 */
export function formatRaiNganWa(m2: number): string {
  const { rai, ngan, wa } = toRaiNganWa(m2);
  const parts: string[] = [];
  if (rai > 0) parts.push(`${intFmt.format(rai)} ไร่`);
  if (ngan > 0) parts.push(`${ngan} งาน`);
  if (wa > 0) parts.push(`${wa} ตร.ว.`);
  return parts.length > 0 ? parts.join(' ') : '0 ตร.ว.';
}

/** Decimal rai label, e.g. `12.59 ไร่`. */
export function formatRai(m2: number, fractionDigits = 2): string {
  return `${m2ToRai(m2).toLocaleString('en-US', { maximumFractionDigits: fractionDigits })} ไร่`;
}
