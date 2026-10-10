/**
 * IPCC Tier 1 emission constants for rice.
 * Primary source: IPCC (2019) 2019 Refinement to the 2006 IPCC Guidelines for
 * National Greenhouse Gas Inventories, Vol. 4 (AFOLU), Ch. 5 (Cropland, §5.5 rice)
 * and Ch. 11 (N2O from managed soils, CO2 from urea).
 */

/** Table 5.11 (2019 Ref.) — baseline EF for continuously flooded fields without organic
 *  amendments, South-East Asia: 1.22 kg CH4 ha⁻¹ d⁻¹ (error range 0.80–1.86). */
export const EF_C_KG_CH4_HA_DAY = 1.22;

/** Table 5.12 (2019 Ref.) — scaling factor SF_w for water regime during cultivation
 *  (disaggregated case). */
export const SF_W = {
  continuouslyFlooded: 1.0,
  singleDrainage: 0.71,
  /** multiple drainage periods = AWD */
  multipleDrainage: 0.55,
  /** regular rainfed: flood-prone, water level may rise up to 50 cm */
  rainfedRegular: 0.54,
  /** drought-prone rainfed: drought periods occur during every cropping season */
  rainfedDroughtProne: 0.16,
  deepWater: 0.06,
  upland: 0,
} as const;

/** Table 5.13 (2019 Ref.) — SF_p, water regime before the cultivation period. */
export const SF_P = {
  /** non-flooded pre-season < 180 d */
  nonFloodedShort: 1.0,
  /** non-flooded pre-season > 180 d */
  nonFloodedLong: 0.89,
  /** flooded pre-season (> 30 d) */
  floodedPreSeason: 2.41,
  /** non-flooded pre-season > 365 d */
  nonFloodedOverYear: 0.59,
} as const;

/** Thai rainfed / single-dry-crop paddies sit dry for < 180 d between crops in most cases.
 *  // ASSUMPTION: SF_p = non-flooded < 180 d for every season (no pre-season flooding data). */
export const SF_P_DEFAULT = SF_P.nonFloodedShort;

/** Table 5.14 (2019 Ref.) — conversion factors for organic amendment CFOA.
 *  ROA = t/ha, dry weight for straw, fresh weight for others. */
export const CFOA = {
  strawShortBefore: 1.0, // straw incorporated < 30 d before cultivation
  strawLongBefore: 0.19, // straw incorporated > 30 d before cultivation
  compost: 0.17,
  farmyardManure: 0.21,
  greenManure: 0.45,
} as const;

/** Eq. 5.3 (2019 Ref.) — SF_o = (1 + Σ ROA_i × CFOA_i)^0.59 */
export const SF_O_EXPONENT = 0.59;

/** Table 11.1 (2019 Ref.) — EF1 for flooded rice: 0.004 kg N2O-N / kg N input. */
export const EF1_FLOODED_RICE = 0.004;
/** N2O-N → N2O molecular mass ratio 44/28 (IPCC 2006 Vol.4 Eq. 11.1). */
export const N2O_N_TO_N2O = 44 / 28;

/** IPCC 2006 Vol.4 Ch.11 Eq. 11.13 — urea EF 0.20 t C / t urea. */
export const UREA_EF_C = 0.2;
/** C → CO2 44/12. */
export const C_TO_CO2 = 44 / 12;
/** Urea is 46 % N (CO(NH2)2). // ASSUMPTION: all fertiliser N is applied as urea. */
export const UREA_N_FRACTION = 0.46;

/** IPCC 2006 Vol.4 Ch.11 Table 11.2 (rice): AG_DM (t/ha) = 0.95 × crop_DM + 2.46;
 *  dry matter fraction of harvested rice 0.89. */
export const RICE_RESIDUE = { slope: 0.95, interceptTHa: 2.46, dryMatterFraction: 0.89 } as const;

/** IPCC 2006 Vol.4 Ch.2 Table 2.6 — combustion factor, rice residues: 0.80. */
export const STRAW_COMBUSTION_FACTOR = 0.8;
/** IPCC 2006 Vol.4 Ch.2 Table 2.5 — agricultural residue burning, g / kg dm burnt.
 *  CO2 from residue burning is biogenic and NOT counted (IPCC 2006 Vol.4 §2.4). */
export const STRAW_BURN_EF_G_PER_KG_DM = { ch4: 2.7, n2o: 0.07 } as const;

/** // ASSUMPTION: share of straw left in the field and incorporated when not burnt
 *  (part is grazed / removed in Isan); incorporated > 30 d before next crop. */
export const STRAW_RETAINED_FRACTION = 0.5;

/** IPCC AR6 WG1 (2021) Ch.7 Table 7.15 — GWP100. CH4 non-fossil 27.0 (fossil 29.8), N2O 273. */
export const GWP100_AR6 = { ch4: 27.0, n2o: 273, co2: 1 } as const;
