/**
 * runSeason — ONE daily loop coupling water → salt → yield stress → CH4 (SPEC §9).
 * runSeasonEnsemble — same season window over every year in the weather array → P10/P50/P90.
 */
import type {
  ConfidenceTag,
  FieldProfile,
  Practices,
  SeasonResult,
  WeatherDay,
} from '@rice/contracts';
import {
  AWD_FLOWERING_FLOOD_DAYS,
  DEFAULT_ET0_MM,
  FLOWERING_TO_MATURITY_DAYS,
  FLOWERING_WINDOW_DAYS,
  KC_END,
  KC_FALLOW,
  KC_INI,
  KC_MID,
  SPINUP_DAYS,
  STAGE_FRACTIONS,
  VARIETIES,
} from './constants';
import { daysFromCivil, dayToIso, doyToDay, isoToDay, yearOf } from './dates';
import { computeGhg, type GhgResult } from './ghg';
import {
  baseEce,
  classifySalinity,
  fSalt as fSaltFn,
  saltStep,
  salinityRecommendations,
  type BaseEceResult,
} from './salinity';
import { minConfidence, percentiles } from './util';
import { irrigationDemand, soilWaterParams, waterStep, type SoilWaterParams } from './waterBalance';
import {
  calibrationFactor,
  fNutrient as fNutrientFn,
  fWater as fWaterFn,
  yieldKgHa,
} from './yield';
import { MODEL_VERSION } from './version';

// ---------------------------------------------------------------- inputs

export interface RunSeasonInput {
  profile: FieldProfile;
  practices: Practices;
  weather: readonly WeatherDay[];
  /** calendar year of planting */
  year: number;
  /** include the daily trace (default true) */
  includeDaily?: boolean;
}

export interface EnsembleInput {
  profile: FieldProfile;
  practices: Practices;
  weather: readonly WeatherDay[];
  /** fallback year when no complete season exists in `weather` */
  year?: number;
  includeDaily?: boolean;
}

export interface EnsembleResult {
  /** latest complete year, with yield / ECe percentiles across all years */
  quick: SeasonResult;
  /** per-year results (oldest → newest), each with single-year percentiles */
  years: SeasonResult[];
}

// ---------------------------------------------------------------- weather index

export interface WeatherIndex {
  byDay: Map<number, WeatherDay>;
  minDay: number;
  maxDay: number;
}

export function indexWeather(weather: readonly WeatherDay[]): WeatherIndex {
  const byDay = new Map<number, WeatherDay>();
  let minDay = Infinity;
  let maxDay = -Infinity;
  for (const w of weather) {
    const d = isoToDay(w.date);
    byDay.set(d, w);
    if (d < minDay) minDay = d;
    if (d > maxDay) maxDay = d;
  }
  return { byDay, minDay, maxDay };
}

// ---------------------------------------------------------------- season window

export interface SeasonWindow {
  plantDay: number;
  /** exclusive end (maturity / harvest day) */
  harvestDay: number;
  floweringDay: number;
  lengthDays: number;
}

/** Default planting DOY when neither practices nor grid give one.
 *  // ASSUMPTION: wet 15 Jun (166), dry1 15 Jan (15); dry2 = dry + 60 d. */
const DEFAULT_PLANT_DOY = { wet: 166, dry: 15 } as const;
const DRY2_OFFSET_DAYS = 60;
/** Transplanted crops spend ~20 d in the nursery; field duration of non-sensitive varieties
 *  is shortened accordingly. // ASSUMPTION */
const NURSERY_DAYS = 20;
/** Minimum planting → flowering for photoperiod-sensitive varieties. // ASSUMPTION */
const MIN_VEGETATIVE_DAYS = 60;

export function seasonWindow(
  profile: FieldProfile,
  practices: Practices,
  year: number,
): SeasonWindow {
  let plantDay: number;
  if (practices.plantDate) {
    const m = Number(practices.plantDate.slice(5, 7));
    const d = Number(practices.plantDate.slice(8, 10));
    plantDay = daysFromCivil(year, m, d);
  } else if (practices.season === 'wet') {
    plantDay = doyToDay(year, profile.grid?.plant_doy_wet ?? DEFAULT_PLANT_DOY.wet);
  } else {
    const dry = profile.grid?.plant_doy_dry ?? DEFAULT_PLANT_DOY.dry;
    plantDay = doyToDay(year, dry + (practices.season === 'dry2' ? DRY2_OFFSET_DAYS : 0));
  }
  const v = VARIETIES[practices.variety];
  if (v.photoperiodSensitive && v.floweringDoy != null && practices.season === 'wet') {
    let flowering = doyToDay(year, v.floweringDoy);
    if (flowering - plantDay >= 0) {
      if (flowering - plantDay < MIN_VEGETATIVE_DAYS) flowering = plantDay + MIN_VEGETATIVE_DAYS;
      const harvestDay = flowering + FLOWERING_TO_MATURITY_DAYS;
      return { plantDay, harvestDay, floweringDay: flowering, lengthDays: harvestDay - plantDay };
    }
  }
  // non-sensitive (or sensitive variety outside its window): fixed duration
  const lengthDays = v.durationDays - (practices.establishment === 'transplant' ? NURSERY_DAYS : 0);
  const harvestDay = plantDay + lengthDays;
  return {
    plantDay,
    harvestDay,
    floweringDay: harvestDay - FLOWERING_TO_MATURITY_DAYS,
    lengthDays,
  };
}

/** FAO-56 single-Kc curve: constant ini, linear dev, constant mid, linear late. */
export function kcAt(dayInSeason: number, lengthDays: number): number {
  const f = dayInSeason / lengthDays;
  const a = STAGE_FRACTIONS.ini;
  const b = a + STAGE_FRACTIONS.dev;
  const c = b + STAGE_FRACTIONS.mid;
  if (f < a) return KC_INI;
  if (f < b) return KC_INI + ((f - a) / (b - a)) * (KC_MID - KC_INI);
  if (f < c) return KC_MID;
  return KC_MID + Math.min(1, (f - c) / (1 - c)) * (KC_END - KC_MID);
}

// ---------------------------------------------------------------- core simulation

interface Context {
  profile: FieldProfile;
  practices: Practices;
  wx: WeatherIndex;
  soil: SoilWaterParams;
  base: BaseEceResult;
  irrigationAccess: boolean;
  fillEt0: number;
}

function makeContext(
  profile: FieldProfile,
  practices: Practices,
  weather: readonly WeatherDay[] | WeatherIndex,
): Context {
  const wx = 'byDay' in weather ? weather : indexWeather(weather);
  const et0n = profile.grid?.et0_normal_mm;
  return {
    profile,
    practices,
    wx,
    soil: soilWaterParams(profile),
    base: baseEce(profile, practices),
    // SPEC §9.1: irrigation only with irrigation-zone / irrigated source; a 'rainfed' regime never irrigates
    irrigationAccess:
      (practices.waterSource === 'irrigated' || profile.in_irrigation_zone) &&
      practices.waterRegime !== 'rainfed',
    fillEt0: et0n != null && et0n > 0 ? et0n / 365 : DEFAULT_ET0_MM,
  };
}

export interface SeasonSim {
  year: number;
  window: SeasonWindow;
  /** storage at planting / at harvest (mm) */
  wStart: number;
  wEnd: number;
  sum: { p: number; i: number; cr: number; etc: number; eta: number; dp: number; ro: number };
  irrigationNeedMm: number;
  deficitDays: number;
  floodedDays: number;
  missingDays: number;
  fWater: number;
  fSalt: number;
  fNutrient: number;
  /** before calibration */
  yieldKgHa: number;
  eceMeanDsm: number;
  eceDaily: number[];
  daily: { date: string; wMm: number; eceDsm: number; lai: number | null }[] | null;
}

function simulate(ctx: Context, year: number, includeDaily: boolean): SeasonSim {
  const { practices, soil, base, wx } = ctx;
  const win = seasonWindow(ctx.profile, practices, year);
  const regime = practices.waterRegime;
  const start = win.plantDay - SPINUP_DAYS;
  const cIrrSeason = practices.season === 'wet' ? base.irrEcWetDsm : base.irrEcDryDsm;

  let w = -soil.sdMm; // field capacity at start of spin-up
  let wShadow = 0;
  let s = base.eceDsm * soil.vSatMm;
  let wStart = w;
  const sum = { p: 0, i: 0, cr: 0, etc: 0, eta: 0, dp: 0, ro: 0 };
  let need = 0;
  let deficitDays = 0;
  let floodedDays = 0;
  let missingDays = 0;
  let winEta = 0;
  let winEtc = 0;
  let eceSum = 0;
  const eceDaily: number[] = [];
  const daily: SeasonSim['daily'] = includeDaily ? [] : null;

  for (let d = start; d < win.harvestDay; d++) {
    const inSeason = d >= win.plantDay;
    if (d === win.plantDay) {
      wStart = w;
      wShadow = w;
    }
    const day = wx.byDay.get(d);
    if (!day && inSeason) missingDays++;
    const rain = day ? day.rain_mm : 0;
    const et0 = day ? day.et0_mm : ctx.fillEt0;
    const t = d - win.plantDay;
    const etc = (inSeason ? kcAt(t, win.lengthDays) : KC_FALLOW) * et0;

    let irr = 0;
    if (inSeason) {
      const keepFlooded = Math.abs(d - win.floweringDay) <= AWD_FLOWERING_FLOOD_DAYS;
      const demand = irrigationDemand(w, regime, keepFlooded, soil);
      if (ctx.irrigationAccess) {
        irr = demand;
        need += demand;
      } else {
        // shadow balance: irrigation the regime would require if water were available
        const dSh = irrigationDemand(wShadow, regime, keepFlooded, soil);
        need += dSh;
        wShadow = waterStep(wShadow, rain, dSh, etc, soil).w;
      }
    }

    const f = waterStep(w, rain, irr, etc, soil);
    s = saltStep(s, w, f, base.gwEcDsm, cIrrSeason, soil.vSatMm);
    w = f.w;
    const ece = s / soil.vSatMm;

    if (inSeason) {
      sum.p += f.p;
      sum.i += f.i;
      sum.cr += f.cr;
      sum.etc += f.etc;
      sum.eta += f.eta;
      sum.dp += f.dp;
      sum.ro += f.ro;
      if (f.ks < 1) deficitDays++;
      if (w > 0) floodedDays++;
      if (Math.abs(d - win.floweringDay) <= FLOWERING_WINDOW_DAYS) {
        winEta += f.eta;
        winEtc += f.etc;
      }
      eceSum += ece;
      eceDaily.push(ece);
      if (daily) daily.push({ date: dayToIso(d), wMm: w, eceDsm: ece, lai: null });
    }
  }

  const eceMeanDsm = eceDaily.length > 0 ? eceSum / eceDaily.length : base.eceDsm;
  const fw = fWaterFn(winEta, winEtc);
  const fs = fSaltFn(eceMeanDsm, practices.variety);
  const fn = fNutrientFn(practices.nKgPerRai, practices.organicTPerRai);
  return {
    year,
    window: win,
    wStart,
    wEnd: w,
    sum,
    irrigationNeedMm: need,
    deficitDays,
    floodedDays,
    missingDays,
    fWater: fw,
    fSalt: fs,
    fNutrient: fn,
    yieldKgHa: yieldKgHa(practices.variety, fw, fs, fn),
    eceMeanDsm,
    eceDaily,
    daily,
  };
}

/** Low-level single-year simulation (exposed for tests / diagnostics). */
export function simulateSeason(input: RunSeasonInput): SeasonSim {
  return simulate(
    makeContext(input.profile, input.practices, input.weather),
    input.year,
    input.includeDaily ?? true,
  );
}

// ---------------------------------------------------------------- result assembly

/** Rainfed is IPCC "drought-prone" when the field was ponded less than half the season.
 *  // ASSUMPTION (IPCC 2019 Table 5.12 defines the classes qualitatively). */
const DROUGHT_PRONE_FLOODED_FRACTION = 0.5;

function toResult(
  ctx: Context,
  sim: SeasonSim,
  yieldPct: { p10: number; p50: number; p90: number },
  ecePct: { p10: number; p50: number; p90: number },
  calibrated: boolean,
  yieldForGhg: number,
): SeasonResult {
  const { practices, base, soil } = ctx;
  const len = sim.window.lengthDays;

  // water
  const missingFrac = len > 0 ? sim.missingDays / len : 1;
  const wxConf: ConfidenceTag =
    missingFrac > 0.1
      ? { level: 'low', source: 'weather incomplete' }
      : { level: 'medium', source: 'ERA5-Land/obs' };
  const waterConf = minConfidence(soil.confidence, wxConf);
  const availableMm = Math.max(0, sim.sum.p - sim.sum.ro + sim.sum.i + sim.sum.cr);

  // ghg
  const ghg: GhgResult = computeGhg({
    seasonDays: len,
    regime: practices.waterRegime,
    droughtProne: sim.floodedDays < DROUGHT_PRONE_FLOODED_FRACTION * len,
    nKgPerRai: practices.nKgPerRai,
    organicTPerRai: practices.organicTPerRai,
    strawBurn: practices.strawBurn,
    yieldKgHa: yieldForGhg,
  });
  const regimeUnsupported = practices.waterRegime !== 'rainfed' && !ctx.irrigationAccess;
  const ghgConf: ConfidenceTag = regimeUnsupported
    ? { level: 'low', source: 'IPCC 2019 Tier 1 (declared regime without irrigation access)' }
    : { level: 'medium', source: 'IPCC 2019 Tier 1' };

  // salinity
  const cls = classifySalinity(Math.max(base.eceDsm, ecePct.p50));
  const recommendations = salinityRecommendations({
    cls,
    origin: base.origin,
    fSalt: sim.fSalt,
    gwEcDsm: base.gwEcDsm,
    hasIrrigation: ctx.irrigationAccess,
    irrEcDsm: practices.season === 'wet' ? base.irrEcWetDsm : base.irrEcDryDsm,
  });

  const yieldConf: ConfidenceTag = calibrated
    ? { level: 'medium', source: 'variety table + user yield calibration' }
    : { level: 'low', source: 'variety table (Phase 1)' };

  const result: SeasonResult = {
    modelVersion: MODEL_VERSION,
    season: practices.season,
    year: sim.year,
    water: {
      availableMm,
      irrigationNeedMm: sim.irrigationNeedMm,
      deficitDays: sim.deficitDays,
      confidence: waterConf,
    },
    yield: {
      kgPerHa: yieldPct,
      fWater: sim.fWater,
      fSalt: sim.fSalt,
      fNutrient: sim.fNutrient,
      // level = weakest of yield table, water and salinity inputs; source names the yield method
      confidence: {
        level: minConfidence(yieldConf, minConfidence(waterConf, base.confidence)).level,
        source: yieldConf.source,
      },
    },
    ghg: {
      ch4KgHa: ghg.ch4KgHa,
      n2oKgHa: ghg.n2oKgHa,
      co2KgHa: ghg.co2KgHa,
      co2eTHa: ghg.co2eTHa,
      awdSavingCo2eTHa: ghg.awdSavingCo2eTHa,
      confidence: ghgConf,
    },
    salinity: {
      eceDsm: ecePct,
      baseEceDsm: base.eceDsm,
      class: cls,
      origin: base.origin,
      recommendations,
      confidence: base.confidence,
    },
  };
  if (sim.daily) result.daily = sim.daily;
  return result;
}

/** Single season for `year`. Yield percentiles collapse to one value; ECe percentiles are
 *  over the daily ECe of that season. */
export function runSeason(input: RunSeasonInput): SeasonResult {
  const ctx = makeContext(input.profile, input.practices, input.weather);
  const sim = simulate(ctx, input.year, input.includeDaily ?? true);
  const cf = calibrationFactor(sim.yieldKgHa, input.practices.lastYieldKgPerRai);
  const y = sim.yieldKgHa * cf;
  return toResult(ctx, sim, { p10: y, p50: y, p90: y }, percentiles(sim.eceDaily), cf !== 1, y);
}

/** Years whose season window (incl. spin-up) is ≥ 90 % covered by `weather`. */
export function availableYears(
  profile: FieldProfile,
  practices: Practices,
  wx: WeatherIndex,
): number[] {
  if (wx.byDay.size === 0) return [];
  const out: number[] = [];
  for (let y = yearOf(wx.minDay) - 1; y <= yearOf(wx.maxDay); y++) {
    const win = seasonWindow(profile, practices, y);
    const a = win.plantDay - SPINUP_DAYS;
    let have = 0;
    for (let d = a; d < win.harvestDay; d++) if (wx.byDay.has(d)) have++;
    if (have >= 0.9 * (win.harvestDay - a)) out.push(y);
  }
  return out;
}

/**
 * Runs the same season window over every available year → P10/P50/P90 of yield and of
 * season-mean ECe. `quick` = latest year's result carrying the ensemble percentiles.
 * Calibration uses the ensemble median as the model reference.
 */
export function runSeasonEnsemble(input: EnsembleInput): EnsembleResult {
  const ctx = makeContext(input.profile, input.practices, input.weather);
  const years = availableYears(input.profile, input.practices, ctx.wx);
  if (years.length === 0) {
    const y = input.year ?? (ctx.wx.byDay.size > 0 ? yearOf(ctx.wx.maxDay) : undefined);
    if (y === undefined) throw new Error('runSeasonEnsemble: no weather and no fallback year');
    const r = runSeason({ ...input, year: y });
    return { quick: r, years: [r] };
  }
  const includeDaily = input.includeDaily ?? true;
  const sims = years.map((y, k) => simulate(ctx, y, includeDaily && k === years.length - 1));
  const raw = sims.map((s) => s.yieldKgHa);
  const cf = calibrationFactor(percentiles(raw).p50, input.practices.lastYieldKgPerRai);
  const calibrated = cf !== 1;

  const yearResults = sims.map((s) => {
    const y = s.yieldKgHa * cf;
    return toResult(ctx, s, { p10: y, p50: y, p90: y }, percentiles(s.eceDaily), calibrated, y);
  });
  const latest = sims[sims.length - 1]!;
  const yLatest = latest.yieldKgHa * cf;
  const quick = toResult(
    ctx,
    latest,
    percentiles(raw.map((v) => v * cf)),
    percentiles(sims.map((s) => s.eceMeanDsm)),
    calibrated,
    yLatest,
  );
  return { quick, years: yearResults };
}
