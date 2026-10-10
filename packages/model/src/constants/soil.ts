/**
 * Soil / paddy water-balance parameters (SPEC §9.1).
 */

/** SPEC §9.1 — default bund height (mm). */
export const BUND_HEIGHT_MM = 150;

/** Effective root zone depth for paddy rice (mm). Most rice roots are in the top 0.2–0.4 m
 *  (Yoshida 1981). // ASSUMPTION: 500 mm used as the active water/salt layer. */
export const ROOT_ZONE_MM = 500;

/** Saturated volumetric water content (m³/m³). // ASSUMPTION: 0.45 (typical loam–clay paddy). */
export const THETA_SAT = 0.45;

/** Drainable porosity / specific yield θsat − θfc (m³/m³).
 *  // ASSUMPTION: 0.10 — used to convert a sub-surface water level to storage. */
export const SPECIFIC_YIELD = 0.1;

/** Default available water capacity θfc − θwp (mm per m) when LDD soil is empty.
 *  Derived from clay % (Saxton & Rawls 2006 range ~ 90–180 mm/m).
 *  // ASSUMPTION: piecewise linear on clay %. */
export function awcFromClay(clayPct: number | null): number {
  if (clayPct == null || !Number.isFinite(clayPct)) return 140;
  const c = Math.min(60, Math.max(0, clayPct));
  return 90 + (c / 60) * 90; // 90 mm/m (sand) → 180 mm/m (heavy clay)
}

/** Percolation rate in puddled paddy (mm/d) from clay % when LDD ksat is empty.
 *  Ranges per Bouman et al. (2007) "Rice and water", Adv. Agron. 92: 1–5 mm/d heavy clay,
 *  up to 25 mm/d sandy. // ASSUMPTION: stepwise mapping below. */
export function percolationFromClay(clayPct: number | null): number {
  if (clayPct == null || !Number.isFinite(clayPct)) return 4;
  if (clayPct >= 40) return 1.5;
  if (clayPct >= 25) return 3;
  if (clayPct >= 15) return 5;
  return 8;
}

/** Cap on percolation from LDD ksat: ksat of the subsoil overestimates percolation through
 *  the puddled plough pan. // ASSUMPTION: 15 mm/d (Bouman et al. 2007 upper typical value). */
export const PERCOLATION_MAX_MM_DAY = 15;

/** Max capillary rise (mm/d) when the water table is at the root zone.
 *  FAO-56 Annex 8 / Liu et al. (2006) give 1–5 mm/d for shallow water tables.
 *  // ASSUMPTION: 3 mm/d, linearly → 0 at 3 m depth (SPEC §9.1: 0 if depth > 3 m). */
export const CR_MAX_MM_DAY = 3;
export const CR_ZERO_DEPTH_M = 3;

/** Shallow water table restricts downward percolation (discharge areas).
 *  // ASSUMPTION: percolation × clamp(depth_m / 2, 0.1, 1). */
export const DP_GW_FULL_DEPTH_M = 2;

/** Irrigation management targets (mm ponded water).
 *  // ASSUMPTION: refill to 50 mm when ponding falls below 20 mm (continuous flooding). */
export const IRR_TARGET_MM = 50;
export const IRR_TRIGGER_MM = 20;

/** Safe AWD: re-flood when the perched water level falls 150 mm below the surface
 *  (IRRI / Bouman et al. 2007). Converted to storage with SPECIFIC_YIELD. */
export const AWD_THRESHOLD_LEVEL_MM = -150;
/** Safe AWD keeps the field flooded around flowering (IRRI: 1 wk before → 1 wk after). */
export const AWD_FLOWERING_FLOOD_DAYS = 7;

/** Pre-season spin-up length (days) before planting. // ASSUMPTION. */
export const SPINUP_DAYS = 30;

/** Fill values for missing weather days. // ASSUMPTION: ET0 4 mm/d typical NE Thailand,
 *  rain 0 (conservative). */
export const DEFAULT_ET0_MM = 4;
