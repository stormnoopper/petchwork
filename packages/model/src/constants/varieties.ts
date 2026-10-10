/**
 * Rice variety parameters (Phase 1 lookup table, SPEC §9.2).
 *
 * Salt tolerance (Maas–Hoffman): Y_rel = 1 − slope × max(0, ECe − threshold).
 *  - Generic rice: threshold 3.0 dS/m, slope 12 %/(dS/m) — Maas, E.V. & Hoffman, G.J. (1977)
 *    J. Irrig. Drain. Div. ASCE 103:115–134; Ayers & Westcot (1985) FAO Irrigation and
 *    Drainage Paper 29 Rev.1, Table 4.
 *  - No published Maas–Hoffman fit exists for most Thai varieties. Per-variety values are
 *    adjusted from the generic curve using qualitative rankings in Thai literature
 *    (KDML105 / RD15 moderately tolerant among Thai cultivars; Pathum Thani 1 relatively
 *    sensitive). All are flagged ASSUMPTION and should be replaced when Rice Department
 *    data are available.
 *
 * Potential yield (kg/ha): attainable yield without water/salt/N limitation. Derived from
 * Rice Department (กรมการข้าว) variety descriptions (average station yields, kg/rai) × ~1.2
 * and converted with 1 rai = 0.16 ha. // ASSUMPTION (all values; to be calibrated with
 * OAE district statistics — SPEC §9.2).
 *
 * Photoperiod: sensitive varieties flower around a fixed calendar date regardless of
 * planting date; non-sensitive ones have a fixed duration (days, planting → maturity).
 */
import type { Variety } from '@rice/contracts';

export interface VarietyParams {
  /** Maas–Hoffman threshold ECe (dS/m) */
  saltThresholdDsm: number;
  /** Maas–Hoffman slope, fraction per dS/m (0.12 = 12 %) */
  saltSlopePerDsm: number;
  /** potential yield, kg/ha */
  potentialYieldKgHa: number;
  photoperiodSensitive: boolean;
  /** non-sensitive: field duration planting → maturity (d). Sensitive: fallback duration
   *  when planted outside its normal window (e.g. dry season). */
  durationDays: number;
  /** sensitive only: typical day-of-year of 50 % flowering in NE Thailand */
  floweringDoy: number | null;
}

/** Generic rice — Maas & Hoffman (1977); FAO-29 Table 4. SPEC §12: fSalt(5) = 0.76. */
export const GENERIC_RICE_SALT = { saltThresholdDsm: 3.0, saltSlopePerDsm: 0.12 } as const;

/** Grain filling: flowering → physiological maturity ≈ 30 d (Yoshida 1981,
 *  Fundamentals of Rice Crop Science, IRRI). */
export const FLOWERING_TO_MATURITY_DAYS = 30;

/** Window around flowering used for f_water (SPEC §9.2: flowering ± 20 d). */
export const FLOWERING_WINDOW_DAYS = 20;

export const VARIETIES: Record<Variety, VarietyParams> = {
  // ขาวดอกมะลิ 105 — photoperiod sensitive, flowers ~20–25 Oct in Isan (Rice Dept.).
  // ASSUMPTION: salt threshold 3.0, slope 11 % (moderately tolerant vs other Thai cultivars).
  // ASSUMPTION: potential 3,000 kg/ha (station avg ≈ 363–400 kg/rai).
  KDML105: {
    saltThresholdDsm: 3.0,
    saltSlopePerDsm: 0.11,
    potentialYieldKgHa: 3000,
    photoperiodSensitive: true,
    durationDays: 150,
    floweringDoy: 295,
  },
  // กข6 — glutinous, photoperiod sensitive, flowers ~20 Oct.
  // ASSUMPTION: generic salt curve; potential 3,600 kg/ha.
  RD6: {
    saltThresholdDsm: 3.0,
    saltSlopePerDsm: 0.12,
    potentialYieldKgHa: 3600,
    photoperiodSensitive: true,
    durationDays: 150,
    floweringDoy: 293,
  },
  // กข15 — mutant of KDML105, photoperiod sensitive, flowers ~10 d earlier (~10 Oct).
  // ASSUMPTION: same salt curve as KDML105; potential 3,000 kg/ha.
  RD15: {
    saltThresholdDsm: 3.0,
    saltSlopePerDsm: 0.11,
    potentialYieldKgHa: 3000,
    photoperiodSensitive: true,
    durationDays: 140,
    floweringDoy: 284,
  },
  // กข41 — non-sensitive, ~105 d. ASSUMPTION: generic salt curve; potential 5,600 kg/ha.
  RD41: {
    saltThresholdDsm: 3.0,
    saltSlopePerDsm: 0.12,
    potentialYieldKgHa: 5600,
    photoperiodSensitive: false,
    durationDays: 105,
    floweringDoy: null,
  },
  // กข47 — non-sensitive, ~105 d. ASSUMPTION: generic salt curve; potential 5,400 kg/ha.
  RD47: {
    saltThresholdDsm: 3.0,
    saltSlopePerDsm: 0.12,
    potentialYieldKgHa: 5400,
    photoperiodSensitive: false,
    durationDays: 105,
    floweringDoy: null,
  },
  // ปทุมธานี 1 — aromatic, non-sensitive, ~110–120 d.
  // ASSUMPTION: more salt-sensitive (threshold 2.5, slope 13 %); potential 4,800 kg/ha.
  PTT1: {
    saltThresholdDsm: 2.5,
    saltSlopePerDsm: 0.13,
    potentialYieldKgHa: 4800,
    photoperiodSensitive: false,
    durationDays: 115,
    floweringDoy: null,
  },
  // สุพรรณบุรี 1 — non-sensitive, ~120 d. ASSUMPTION: generic salt curve; potential 5,000 kg/ha.
  SPT1: {
    saltThresholdDsm: 3.0,
    saltSlopePerDsm: 0.12,
    potentialYieldKgHa: 5000,
    photoperiodSensitive: false,
    durationDays: 120,
    floweringDoy: null,
  },
};
