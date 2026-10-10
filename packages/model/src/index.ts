// @rice/model — pure TS crop/water/salt/GHG model (SPEC §9). SI units, no I/O.
export { MODEL_VERSION } from './version';
export * as constants from './constants';
export { VARIETIES, GENERIC_RICE_SALT } from './constants';
export type { VarietyParams } from './constants';
export {
  capillaryRiseRate,
  irrigationDemand,
  ksWater,
  soilWaterParams,
  waterStep,
  type SoilWaterParams,
  type WaterFluxes,
} from './waterBalance';
export {
  baseEce,
  classifySalinity,
  fSalt,
  saltStep,
  salinityRecommendations,
  type BaseEceResult,
  type SalinityRecommendation,
  type SaltTolerance,
} from './salinity';
export {
  availableNKgHa,
  calibrationFactor,
  fNutrient,
  fWater,
  perRaiToPerHa,
  yieldKgHa,
} from './yield';
export {
  awdSavingCo2eTHa,
  computeGhg,
  sfOrganic,
  sfWater,
  strawDryMatterTHa,
  type GhgInput,
  type GhgResult,
} from './ghg';
export {
  availableYears,
  indexWeather,
  kcAt,
  runSeason,
  runSeasonEnsemble,
  seasonWindow,
  simulateSeason,
  type EnsembleInput,
  type EnsembleResult,
  type RunSeasonInput,
  type SeasonSim,
  type SeasonWindow,
  type WeatherIndex,
} from './runSeason';
