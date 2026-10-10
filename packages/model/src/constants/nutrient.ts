/**
 * Nitrogen response & calibration (SPEC §9.2).
 * f_nutrient = F0 + (1 − F0)·(1 − exp(−k·N_ha))  (Mitscherlich-type saturating response).
 * - F0: relative yield without N fertiliser — indigenous soil N supply gives ~50–65 % of
 *   attainable yield in Asian lowland rice (Dobermann & Fairhurst 2000, Rice: Nutrient
 *   Disorders & Nutrient Management, IRRI). // ASSUMPTION: 0.55 (poor Isan sandy soils).
 * - k: 90 % of the response reached at 90 kg N/ha → k = ln(10)/90.
 *   // ASSUMPTION (Rice Dept. recommends ~6–15 kg N/rai = 37–94 kg N/ha).
 */
export const F_NUTRIENT_ZERO_N = 0.55;
export const F_NUTRIENT_K_PER_KG_N_HA = Math.LN10 / 90;

/** Farmyard manure: ~0.5 % N on fresh weight, ~30 % available in the first season
 *  (Dobermann & Fairhurst 2000). // ASSUMPTION: organicTPerRai is fresh FYM. */
export const FYM_N_FRACTION = 0.005;
export const FYM_N_AVAILABLE = 0.3;

/** Calibration with the user's last yield: factor = 1 + α·(clamp(Y_obs/Y_model) − 1).
 *  // ASSUMPTION: α = 0.5 (equal trust in model and one farmer-reported season),
 *  ratio clamped to 0.5–2. */
export const CALIBRATION_WEIGHT = 0.5;
export const CALIBRATION_RATIO_MIN = 0.5;
export const CALIBRATION_RATIO_MAX = 2;
