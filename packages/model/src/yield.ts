/**
 * Yield (SPEC §9.2):  Y = Y_pot × f_water × f_salt × f_nutrient
 */
import type { Variety } from '@rice/contracts';
import { HA_PER_RAI } from '@rice/contracts';
import {
  CALIBRATION_RATIO_MAX,
  CALIBRATION_RATIO_MIN,
  CALIBRATION_WEIGHT,
  F_NUTRIENT_K_PER_KG_N_HA,
  F_NUTRIENT_ZERO_N,
  FYM_N_AVAILABLE,
  FYM_N_FRACTION,
  VARIETIES,
} from './constants';
import { clamp } from './util';

/** kg/rai → kg/ha */
export const perRaiToPerHa = (x: number): number => x / HA_PER_RAI;

/** Plant-available N (kg/ha) from mineral N (kg/rai) and fresh FYM (t/rai). */
export function availableNKgHa(nKgPerRai: number, organicTPerRai = 0): number {
  const mineral = perRaiToPerHa(nKgPerRai);
  const organic = perRaiToPerHa(organicTPerRai) * 1000 * FYM_N_FRACTION * FYM_N_AVAILABLE;
  return mineral + organic;
}

/** Saturating N response 0..1. */
export function fNutrient(nKgPerRai: number, organicTPerRai = 0): number {
  const n = availableNKgHa(nKgPerRai, organicTPerRai);
  return clamp(
    F_NUTRIENT_ZERO_N + (1 - F_NUTRIENT_ZERO_N) * (1 - Math.exp(-F_NUTRIENT_K_PER_KG_N_HA * n)),
    0,
    1,
  );
}

/** f_water = ΣETa / ΣETc over flowering ± 20 d (1 when no demand). */
export function fWater(sumEta: number, sumEtc: number): number {
  return sumEtc > 0 ? clamp(sumEta / sumEtc, 0, 1) : 1;
}

export function yieldKgHa(variety: Variety, fw: number, fs: number, fn: number): number {
  return VARIETIES[variety].potentialYieldKgHa * fw * fs * fn;
}

/**
 * Calibration hook (simple ratio blend). Returns a multiplier for model yields:
 *   r = clamp(Y_obs / Y_ref, 0.5, 2);  factor = 1 + α (r − 1),  α = 0.5
 * Y_ref = the model's own reference yield (single run: that year; ensemble: median).
 * Returns 1 when no observation or no reference.
 */
export function calibrationFactor(modelRefKgHa: number, lastYieldKgPerRai: number | null): number {
  if (lastYieldKgPerRai == null || lastYieldKgPerRai <= 0 || modelRefKgHa <= 0) return 1;
  const r = clamp(
    perRaiToPerHa(lastYieldKgPerRai) / modelRefKgHa,
    CALIBRATION_RATIO_MIN,
    CALIBRATION_RATIO_MAX,
  );
  return 1 + CALIBRATION_WEIGHT * (r - 1);
}
