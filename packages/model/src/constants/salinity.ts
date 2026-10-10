/**
 * Salinity constants (SPEC §9.4).
 */
import type { SalinityLevel } from '@rice/contracts';

/** Display classes for ECe (dS/m), adapted from USDA Salinity Laboratory (Richards 1954,
 *  Agriculture Handbook 60) / FAO Soils Bulletin 39: 0–2 non-saline, 2–4 very slightly,
 *  4–8 moderately, > 8 strongly saline. Upper bounds are exclusive. */
export const SALINITY_CLASS_BOUNDS_DSM = { slight: 2, moderate: 4, severe: 8 } as const;

/** LDD saline-soil map level → representative ECe (dS/m).
 *  LDD NE saline-soil classes are defined by % salt-crust area, not ECe; mapping follows
 *  the ECe ranges reported for those classes by LDD / Arunin (1984).
 *  // ASSUMPTION: point values below (midpoints of reported ranges). */
export const LDD_LEVEL_ECE_DSM: Record<SalinityLevel, number> = {
  very_high: 16,
  high: 10,
  moderate: 6,
  low: 3,
  none: 1,
};

/** Background ECe for non-saline paddy soil. // ASSUMPTION: 0.8 dS/m. */
export const BACKGROUND_ECE_DSM = 0.8;

/** Sentinel-2 salinity index SI = sqrt(Blue × Red) (Khan et al. 2005), reflectance 0–1.
 *  // ASSUMPTION: linear map SI ≤ 0.15 → +0, SI ≥ 0.35 → +6 dS/m. ETL must store this
 *  convention in ref.grid_cells.si_dry_season. */
export const SI_LOW = 0.15;
export const SI_HIGH = 0.35;
export const SI_MAX_ECE_ADD_DSM = 6;

/** Saline groundwater contribution: ECe add = gwEC × factor × shallowness,
 *  shallowness = clamp((3 − depth_m)/3, 0, 1) (capillary rise vanishes below ~3 m, SPEC §9.1).
 *  // ASSUMPTION: factor 0.5. */
export const GW_ECE_FACTOR = 0.5;

/** Maha Sarakham Formation (KTms) rock-salt presence add (dS/m), scaled by area weight and
 *  by rock-salt depth (shallower → stronger; 0 beyond 200 m).
 *  // ASSUMPTION: +2 dS/m at full weight and shallow salt. */
export const KTMS_ECE_ADD_DSM = 2;
export const KTMS_DEPTH_SCALE_M = 200;

/** Coastal intrusion: + up to 8 dS/m at the coast, linearly → 0 at 50 km.
 *  // ASSUMPTION (to be refined with ThaiWater river salinity). */
export const COASTAL_MAX_ECE_ADD_DSM = 8;
export const COASTAL_DIST_ZERO_KM = 50;

/** Default groundwater EC when DGR data are missing (dS/m).
 *  // ASSUMPTION: 3.0 over KTms (brackish typical of Isan saline areas), 0.5 otherwise. */
export const DEFAULT_GW_EC_KTMS = 3.0;
export const DEFAULT_GW_EC = 0.5;
/** Default groundwater depth when DGR missing (m). // ASSUMPTION: 5 m (no capillary rise). */
export const DEFAULT_GW_DEPTH_M = 5;

/** Irrigation water EC default (dS/m). Wet season / inland canal water ≈ 0.3–0.5.
 *  // ASSUMPTION: 0.4 inland; coastal dry season 0.4 + up to 3 dS/m near the coast
 *  (sea-water intrusion into canals, SPEC §9.4: C_irr high in the dry season). */
export const DEFAULT_IRR_EC = 0.4;
export const COASTAL_DRY_IRR_EC_ADD = 3;

/** Groundwater usable for irrigation only if EC < 0.75 dS/m (SPEC §9.1; FAO-29 Table 1
 *  "no restriction" class, Ayers & Westcot 1985). */
export const GW_USABLE_EC_DSM = 0.75;

/** Fraction of percolating solution concentration that actually leaves the root zone
 *  (leaching efficiency; FAO-29 §2.4 gives 0.3–1.0, lower for cracking clays).
 *  // ASSUMPTION: 0.5. */
export const LEACHING_EFFICIENCY = 0.5;
