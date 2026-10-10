/**
 * Daily paddy water balance (SPEC §9.1):
 *   W_t = W_{t-1} + P_t + I_t + CR_t − ETa_t − DP_t − RO_t
 *
 * State W (mm) is water storage relative to a saturated soil surface:
 *   W > 0  → ponded depth (mm), capped by the bund height (overflow = RO)
 *   W < 0  → storage deficit below saturation in the root zone, floor −dMax (wilting point)
 * ETa = Ks × ETc (FAO-56 Eq. 84 water-stress coefficient); SPEC writes ETc — the
 * actual flux is used so mass is conserved when the soil dries.
 */
import type { ConfidenceTag, FieldProfile, Practices } from '@rice/contracts';
import {
  AWD_THRESHOLD_LEVEL_MM,
  BUND_HEIGHT_MM,
  CR_MAX_MM_DAY,
  CR_ZERO_DEPTH_M,
  DEFAULT_GW_DEPTH_M,
  DP_GW_FULL_DEPTH_M,
  IRR_TARGET_MM,
  IRR_TRIGGER_MM,
  P_DEPLETION_RICE,
  PERCOLATION_MAX_MM_DAY,
  ROOT_ZONE_MM,
  SPECIFIC_YIELD,
  THETA_SAT,
  awcFromClay,
  percolationFromClay,
} from './constants';
import { clamp, weightedMean } from './util';

type WaterRegimeT = Practices['waterRegime'];

export interface SoilWaterParams {
  bundMm: number;
  /** max depletion from saturation (mm) → W ≥ −dMaxMm */
  dMaxMm: number;
  /** gravitational (drainable) storage: percolation stops when W ≤ −sdMm */
  sdMm: number;
  /** readily available water measured from saturation: Ks = 1 while depletion ≤ rawMm */
  rawMm: number;
  /** percolation rate when saturated / ponded (mm/d) */
  percMmDay: number;
  /** capillary rise rate when the root zone is unsaturated (mm/d) */
  crMmDay: number;
  /** saturated solution volume of the root zone (mm) — used by the salt balance */
  vSatMm: number;
  gwDepthM: number;
  confidence: ConfidenceTag;
}

/** SPEC §9.1 — CR as a function of groundwater depth: linear from CR_MAX at the surface to
 *  0 at 3 m, 0 below. */
export function capillaryRiseRate(gwDepthM: number): number {
  if (!Number.isFinite(gwDepthM) || gwDepthM >= CR_ZERO_DEPTH_M) return 0;
  return CR_MAX_MM_DAY * clamp(1 - gwDepthM / CR_ZERO_DEPTH_M, 0, 1);
}

/** Derive bucket parameters from the field profile (LDD soil → SoilGrids clay fallback). */
export function soilWaterParams(profile: FieldProfile, bundMm = BUND_HEIGHT_MM): SoilWaterParams {
  const hasSoil = profile.soil.length > 0;
  const clay = profile.grid?.clay_pct ?? null;
  const awcLdd = hasSoil ? weightedMean(profile.soil, (s) => s.awc_mm_m) : null;
  const ksatLdd = hasSoil ? weightedMean(profile.soil, (s) => s.ksat_mm_day) : null;
  const awcMmM = clamp(awcLdd ?? awcFromClay(clay), 30, 250);
  const perc0 =
    ksatLdd != null ? Math.min(ksatLdd, PERCOLATION_MAX_MM_DAY) : percolationFromClay(clay);

  const gwDepthM = profile.groundwater.depth_m_weighted ?? DEFAULT_GW_DEPTH_M;
  const percMmDay = perc0 * clamp(gwDepthM / DP_GW_FULL_DEPTH_M, 0.1, 1);

  const root = ROOT_ZONE_MM / 1000;
  const sdMm = root * SPECIFIC_YIELD * 1000;
  const dMaxMm = sdMm + root * awcMmM;
  const rawMm = sdMm + P_DEPLETION_RICE * (dMaxMm - sdMm);

  const usedLdd = awcLdd != null || ksatLdd != null;
  const confidence: ConfidenceTag = usedLdd
    ? profile.confidence.soil
    : { level: 'low', source: clay != null ? 'SoilGrids 250m (fallback)' : 'fallback' };

  return {
    bundMm,
    dMaxMm,
    sdMm,
    rawMm,
    percMmDay,
    crMmDay: capillaryRiseRate(gwDepthM),
    vSatMm: ROOT_ZONE_MM * THETA_SAT,
    gwDepthM,
    confidence,
  };
}

/** Water-stress coefficient (FAO-56 Eq. 84, depletion measured from saturation). */
export function ksWater(w: number, p: SoilWaterParams): number {
  const depletion = w < 0 ? -w : 0;
  if (depletion <= p.rawMm) return 1;
  return clamp((p.dMaxMm - depletion) / (p.dMaxMm - p.rawMm), 0, 1);
}

/** Storage equivalent of the AWD re-flood water level (−150 mm level × specific yield). */
export function awdThresholdStorageMm(): number {
  return AWD_THRESHOLD_LEVEL_MM * SPECIFIC_YIELD;
}

/**
 * Irrigation the regime asks for today (mm), given storage at the start of the day.
 * - continuous (or AWD during the flowering flood window): refill to 50 mm when < 20 mm
 * - awd: re-flood to 50 mm once the water level reaches −150 mm
 * - rainfed: supplemental amount that would bring the field back to the stress-free limit
 */
export function irrigationDemand(
  w: number,
  regime: WaterRegimeT,
  keepFlooded: boolean,
  p: SoilWaterParams,
): number {
  if (regime === 'continuous' || (regime === 'awd' && keepFlooded)) {
    return w < IRR_TRIGGER_MM ? IRR_TARGET_MM - w : 0;
  }
  if (regime === 'awd') return w <= awdThresholdStorageMm() ? IRR_TARGET_MM - w : 0;
  const depletion = -w;
  return depletion > p.rawMm ? depletion - p.rawMm : 0;
}

export interface WaterFluxes {
  p: number;
  i: number;
  cr: number;
  etc: number;
  eta: number;
  dp: number;
  ro: number;
  ks: number;
  /** storage at end of day */
  w: number;
}

/** One daily step. Exactly conserves mass: w_out − w_in = p + i + cr − eta − dp − ro. */
export function waterStep(
  w: number,
  rain: number,
  irr: number,
  etc: number,
  prm: SoilWaterParams,
): WaterFluxes {
  const p = rain > 0 ? rain : 0;
  const i = irr > 0 ? irr : 0;
  const ks = ksWater(w, prm);
  let eta = etc * ks;
  const cr = w < 0 ? Math.min(prm.crMmDay, -w) : 0;
  const dp = w > -prm.sdMm ? Math.min(prm.percMmDay, w + prm.sdMm) : 0;
  let wn = w + p + i + cr - eta - dp;
  if (wn < -prm.dMaxMm) {
    // not enough water left: actual ET limited by what is available
    const short = -prm.dMaxMm - wn;
    eta = Math.max(0, eta - short);
    wn = w + p + i + cr - eta - dp;
  }
  const ro = wn > prm.bundMm ? wn - prm.bundMm : 0;
  wn -= ro;
  return { p, i, cr, etc, eta, dp, ro, ks, w: wn };
}
