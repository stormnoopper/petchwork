/**
 * FAO-56 crop coefficients and stage lengths for rice.
 * Source: Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998).
 * Crop evapotranspiration. FAO Irrigation and Drainage Paper 56.
 * - Table 12 (single Kc): rice Kc_ini 1.05, Kc_mid 1.20, Kc_end 0.90–0.60.
 * - Table 11 (stage lengths): rice, tropics 30/30/60/30 days (total 150).
 * - Table 22: rice depletion fraction p = 0.20.
 */

/** FAO-56 Table 12 — initial stage (flooded field / transplant / establishment). */
export const KC_INI = 1.05;
/** FAO-56 Table 12 — mid-season. */
export const KC_MID = 1.2;
/** FAO-56 Table 12 gives 0.90–0.60; SPEC §9.1 says 0.90–1.05. We use the
 *  common upper bound 0.90 (field still wet at harvest in rainfed Isan). */
export const KC_END = 0.9;

/** FAO-56 Table 11, rice (tropics): 30/30/60/30 of 150 d → fractions of season length. */
export const STAGE_FRACTIONS = {
  ini: 30 / 150,
  dev: 30 / 150,
  mid: 60 / 150,
  late: 30 / 150,
} as const;

/** FAO-56 Table 22 — soil water depletion fraction for no stress, rice. */
export const P_DEPLETION_RICE = 0.2;

/** Kc used in the 30-day pre-season spin-up (bare wet / fallow soil).
 *  FAO-56 Ch.6 Kc_ini for frequently wetted bare soil is ~0.8–1.0.
 *  // ASSUMPTION: 0.8 for the fallow / land-preparation period. */
export const KC_FALLOW = 0.8;
