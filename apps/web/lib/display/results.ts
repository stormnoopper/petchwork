/**
 * SeasonResult (SI, per ha) → display model (per ไร่) shared by ResultPanel and /fields/[id].
 * Ranges for water / GHG come from the per-year ensemble members; yield / ECe use the
 * percentiles the model already computes across years.
 */
import type {
  ConfidenceTag,
  Percentiles,
  SalinityClass,
  SalinityOrigin,
  SeasonResult,
} from '@rice/contracts';
import { kgHaToKgRai, mmToM3PerRai, percentilesMap, percentilesOf, tHaToTRai } from './units';

export type Range = { lo: number; hi: number };

export type DisplayResult = {
  year: number;
  season: SeasonResult['season'];
  modelVersion: string;
  /** number of seasons in the ensemble (≥1) */
  nYears: number;
  water: {
    availableM3Rai: number;
    availableRange: Range;
    needM3Rai: number;
    needRange: Range;
    deficitDays: number;
    deficitRange: Range;
    confidence: ConfidenceTag;
  };
  yield: {
    kgRai: Percentiles;
    /** whole-field P50, tonnes (null when area unknown) */
    fieldTonnes: number | null;
    /** % reduction caused by salt (1 − fSalt) */
    saltLossPct: number;
    confidence: ConfidenceTag;
  };
  ghg: {
    co2eTRai: number;
    co2eRange: Range;
    ch4KgRai: number;
    n2oKgRai: number;
    awdSavingTRai: number;
    fieldCo2eT: number | null;
    confidence: ConfidenceTag;
  };
  salinity: {
    eceDsm: Percentiles;
    baseEceDsm: number;
    class: SalinityClass;
    origin: SalinityOrigin;
    recommendations: SeasonResult['salinity']['recommendations'];
    confidence: ConfidenceTag;
  };
};

export type YearPoint = { year: number; yieldKgRai: number; eceDsm: number };

const range = (values: number[], fallback: number): Range => {
  if (values.length === 0) return { lo: fallback, hi: fallback };
  const p = percentilesOf(values);
  return { lo: p.p10, hi: p.p90 };
};

export function toDisplayResult(
  quick: SeasonResult,
  years: readonly SeasonResult[] = [],
  areaRai: number | null = null,
): DisplayResult {
  const ys = years.length > 0 ? years : [quick];
  const yieldKgRai = percentilesMap(quick.yield.kgPerHa, kgHaToKgRai);
  const co2eTRai = tHaToTRai(quick.ghg.co2eTHa);
  const hasArea = areaRai != null && Number.isFinite(areaRai) && areaRai > 0;
  return {
    year: quick.year,
    season: quick.season,
    modelVersion: quick.modelVersion,
    nYears: ys.length,
    water: {
      availableM3Rai: mmToM3PerRai(quick.water.availableMm),
      availableRange: range(
        ys.map((y) => mmToM3PerRai(y.water.availableMm)),
        mmToM3PerRai(quick.water.availableMm),
      ),
      needM3Rai: mmToM3PerRai(quick.water.irrigationNeedMm),
      needRange: range(
        ys.map((y) => mmToM3PerRai(y.water.irrigationNeedMm)),
        mmToM3PerRai(quick.water.irrigationNeedMm),
      ),
      deficitDays: quick.water.deficitDays,
      deficitRange: range(
        ys.map((y) => y.water.deficitDays),
        quick.water.deficitDays,
      ),
      confidence: quick.water.confidence,
    },
    yield: {
      kgRai: yieldKgRai,
      fieldTonnes: hasArea ? (yieldKgRai.p50 * areaRai) / 1000 : null,
      saltLossPct: Math.max(0, Math.min(100, (1 - quick.yield.fSalt) * 100)),
      confidence: quick.yield.confidence,
    },
    ghg: {
      co2eTRai,
      co2eRange: range(
        ys.map((y) => tHaToTRai(y.ghg.co2eTHa)),
        co2eTRai,
      ),
      ch4KgRai: kgHaToKgRai(quick.ghg.ch4KgHa),
      n2oKgRai: kgHaToKgRai(quick.ghg.n2oKgHa),
      awdSavingTRai: tHaToTRai(quick.ghg.awdSavingCo2eTHa),
      fieldCo2eT: hasArea ? co2eTRai * areaRai : null,
      confidence: quick.ghg.confidence,
    },
    salinity: {
      eceDsm: quick.salinity.eceDsm,
      baseEceDsm: quick.salinity.baseEceDsm,
      class: quick.salinity.class,
      origin: quick.salinity.origin,
      recommendations: quick.salinity.recommendations,
      confidence: quick.salinity.confidence,
    },
  };
}

/** Per-year series for the small charts, sorted by year. */
export function toYearSeries(years: readonly SeasonResult[]): YearPoint[] {
  return years
    .map((y) => ({
      year: y.year,
      yieldKgRai: kgHaToKgRai(y.yield.kgPerHa.p50),
      eceDsm: y.salinity.eceDsm.p50,
    }))
    .sort((a, b) => a.year - b.year);
}
