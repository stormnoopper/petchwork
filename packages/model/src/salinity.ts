/**
 * Salinity (SPEC §9.4): base ECe by salt origin, daily salt balance coupled with the water
 * balance, Maas–Hoffman yield factor, display classes and recommendations.
 *
 * Salt is tracked as S = ECe × V_sat (dS/m·mm), i.e. EC is used as a concentration proxy
 * (linear EC–TDS, FAO-29). ECe = S / V_sat; the soil-solution EC is S / (V_sat + W), so
 * drying concentrates and ponding dilutes the solution.
 *   S_t = S_{t-1} + CR_t·C_gw + I_t·C_irr − DP_t·C_soil,t·LE
 * (rain carries no salt; LE = leaching efficiency; SPEC formula has LE = 1.)
 */
import type {
  ConfidenceTag,
  FieldProfile,
  Practices,
  SalinityClass,
  SalinityOrigin,
  SeasonResult,
  Variety,
} from '@rice/contracts';
import {
  BACKGROUND_ECE_DSM,
  COASTAL_DIST_ZERO_KM,
  COASTAL_DRY_IRR_EC_ADD,
  COASTAL_MAX_ECE_ADD_DSM,
  CR_ZERO_DEPTH_M,
  DEFAULT_GW_DEPTH_M,
  DEFAULT_GW_EC,
  DEFAULT_GW_EC_KTMS,
  DEFAULT_IRR_EC,
  GENERIC_RICE_SALT,
  GW_ECE_FACTOR,
  GW_USABLE_EC_DSM,
  KTMS_DEPTH_SCALE_M,
  KTMS_ECE_ADD_DSM,
  LDD_LEVEL_ECE_DSM,
  LEACHING_EFFICIENCY,
  SALINITY_CLASS_BOUNDS_DSM,
  SI_HIGH,
  SI_LOW,
  SI_MAX_ECE_ADD_DSM,
  VARIETIES,
} from './constants';
import { clamp } from './util';
import type { WaterFluxes } from './waterBalance';

export type SalinityRecommendation = SeasonResult['salinity']['recommendations'][number];

/** Weight of LDD map vs. indicator estimate when LDD saline data exist. // ASSUMPTION: 0.7 */
export const LDD_BLEND_WEIGHT = 0.7;

export interface BaseEceResult {
  eceDsm: number;
  origin: SalinityOrigin;
  confidence: ConfidenceTag;
  /** groundwater EC used for capillary-rise salt input (dS/m) */
  gwEcDsm: number;
  /** true when DGR provided groundwater EC */
  gwEcMeasured: boolean;
  /** irrigation water EC, wet / dry season (dS/m) */
  irrEcWetDsm: number;
  irrEcDryDsm: number;
  usedLdd: boolean;
}

function siAdd(si: number | null | undefined): number {
  if (si == null || !Number.isFinite(si)) return 0;
  return SI_MAX_ECE_ADD_DSM * clamp((si - SI_LOW) / (SI_HIGH - SI_LOW), 0, 1);
}

function coastalFactor(distKm: number | null | undefined): number {
  if (distKm == null || !Number.isFinite(distKm)) return 0;
  return clamp(1 - distKm / COASTAL_DIST_ZERO_KM, 0, 1);
}

/** Area-weighted Maha Sarakham (KTms) rock-salt factor 0..1. */
function ktmsFactor(profile: FieldProfile): { weight: number; factor: number } {
  let weight = 0;
  let factor = 0;
  for (const g of profile.geology) {
    if (!g.is_maha_sarakham) continue;
    weight += g.w;
    const depthF =
      g.rock_salt_depth_m == null ? 0.5 : clamp(1 - g.rock_salt_depth_m / KTMS_DEPTH_SCALE_M, 0, 1);
    factor += g.w * depthF;
  }
  return { weight: Math.min(1, weight), factor: Math.min(1, factor) };
}

/** LDD saline-soil level → ECe, area-weighted; uncovered area counts as 'none'. */
function lddEce(profile: FieldProfile): number {
  let sw = 0;
  let sv = 0;
  for (const s of profile.saline) {
    sw += s.w;
    sv += s.w * LDD_LEVEL_ECE_DSM[s.salinity_level];
  }
  const rest = Math.max(0, 1 - sw);
  return (sv + rest * LDD_LEVEL_ECE_DSM.none) / Math.max(1, sw + rest);
}

/**
 * Base (pre-season) ECe by salt origin (SPEC §9.4 v2).
 * Priority: user-measured soil EC (high) → LDD map blended with indicators (profile tag) →
 * indicators only (Sentinel-2 SI + DGR groundwater + KTms / coast distance; low, 'fallback').
 */
export function baseEce(profile: FieldProfile, practices: Practices): BaseEceResult {
  const origin: SalinityOrigin = profile.coverage.salinity_origin ?? 'none';
  const grid = profile.grid;
  const ktms = ktmsFactor(profile);
  const gwEcData = profile.groundwater.ec_dsm_weighted;
  const inlandLike = origin === 'inland_rock_salt' || origin === 'mixed';
  const gwEcDsm =
    gwEcData ?? (inlandLike && ktms.weight >= 0.5 ? DEFAULT_GW_EC_KTMS : DEFAULT_GW_EC);
  const gwDepthM = profile.groundwater.depth_m_weighted ?? DEFAULT_GW_DEPTH_M;
  const shallow = clamp((CR_ZERO_DEPTH_M - gwDepthM) / CR_ZERO_DEPTH_M, 0, 1);

  const si = siAdd(grid?.si_dry_season);
  const gw = gwEcDsm * GW_ECE_FACTOR * shallow;
  const coast = COASTAL_MAX_ECE_ADD_DSM * coastalFactor(grid?.coast_dist_km);
  const rock = KTMS_ECE_ADD_DSM * ktms.factor;

  const inland = BACKGROUND_ECE_DSM + si + gw + rock;
  const coastal = BACKGROUND_ECE_DSM + si + gw + coast;
  let indicator: number;
  switch (origin) {
    case 'inland_rock_salt':
      indicator = inland;
      break;
    case 'coastal_intrusion':
      indicator = coastal;
      break;
    case 'mixed':
      indicator = Math.max(inland, coastal);
      break;
    default:
      indicator = BACKGROUND_ECE_DSM + si + gw;
  }

  const coastalIrr = origin === 'coastal_intrusion' || origin === 'mixed';
  const irrEcWetDsm = practices.measuredEcWaterDsm ?? DEFAULT_IRR_EC;
  const irrEcDryDsm =
    practices.measuredEcWaterDsm ??
    DEFAULT_IRR_EC + (coastalIrr ? COASTAL_DRY_IRR_EC_ADD * coastalFactor(grid?.coast_dist_km) : 0);

  const common = { origin, gwEcDsm, gwEcMeasured: gwEcData != null, irrEcWetDsm, irrEcDryDsm };

  if (practices.measuredEcSoilDsm != null) {
    return {
      ...common,
      eceDsm: practices.measuredEcSoilDsm,
      confidence: { level: 'high', source: 'user_measured' },
      usedLdd: false,
    };
  }
  if (profile.saline.length > 0) {
    const ece = LDD_BLEND_WEIGHT * lddEce(profile) + (1 - LDD_BLEND_WEIGHT) * indicator;
    return { ...common, eceDsm: ece, confidence: profile.confidence.salinity, usedLdd: true };
  }
  return {
    ...common,
    eceDsm: indicator,
    confidence: { level: 'low', source: 'fallback' },
    usedLdd: false,
  };
}

export interface SaltTolerance {
  saltThresholdDsm: number;
  saltSlopePerDsm: number;
}

/** Maas–Hoffman relative yield, clamped 0..1 (SPEC §9.2). `'generic'` = 3.0 dS/m, 12 %. */
export function fSalt(
  eceDsm: number,
  variety: Variety | 'generic' | SaltTolerance = 'generic',
): number {
  const t: SaltTolerance =
    variety === 'generic'
      ? GENERIC_RICE_SALT
      : typeof variety === 'string'
        ? VARIETIES[variety]
        : variety;
  return clamp(1 - t.saltSlopePerDsm * Math.max(0, eceDsm - t.saltThresholdDsm), 0, 1);
}

/** 4-class display classification (USDA Handbook 60 / FAO bounds 2, 4, 8 dS/m). */
export function classifySalinity(eceDsm: number): SalinityClass {
  if (eceDsm < SALINITY_CLASS_BOUNDS_DSM.slight) return 'non_saline';
  if (eceDsm < SALINITY_CLASS_BOUNDS_DSM.moderate) return 'slight';
  if (eceDsm < SALINITY_CLASS_BOUNDS_DSM.severe) return 'moderate';
  return 'severe';
}

export interface RecommendationInput {
  cls: SalinityClass;
  origin: SalinityOrigin;
  fSalt: number;
  gwEcDsm: number;
  hasIrrigation: boolean;
  irrEcDsm: number;
}

/** Rule-based recommendations (Phase 1). */
export function salinityRecommendations(x: RecommendationInput): SalinityRecommendation[] {
  const out: SalinityRecommendation[] = [];
  const saline = x.cls !== 'non_saline';
  if (x.fSalt < 0.95) out.push('salt_tolerant_variety');
  if (x.cls === 'moderate' || x.cls === 'severe') out.push('gypsum');
  if (saline && (x.origin === 'inland_rock_salt' || x.origin === 'mixed'))
    out.push('trees_on_recharge');
  if (saline && x.hasIrrigation && x.irrEcDsm < GW_USABLE_EC_DSM) out.push('leaching');
  if (x.gwEcDsm >= GW_USABLE_EC_DSM) out.push('avoid_saline_gw');
  if (out.length === 0) out.push('none');
  return out;
}

/** One daily salt step coupled with the water fluxes of the same day. */
export function saltStep(
  s: number,
  wPrev: number,
  f: WaterFluxes,
  cGw: number,
  cIrr: number,
  vSatMm: number,
): number {
  const v = Math.max(0.1 * vSatMm, vSatMm + wPrev);
  const cSoil = s / v;
  const sIn = s + f.cr * cGw + f.i * cIrr;
  const out = Math.min(sIn, f.dp * cSoil * LEACHING_EFFICIENCY);
  return sIn - out;
}
