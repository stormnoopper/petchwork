import { describe, expect, it } from 'vitest';
import { SeasonResult } from '@rice/contracts';
import { MODEL_VERSION } from './index';
import { runSeason, runSeasonEnsemble, seasonWindow } from './runSeason';
import {
  makeWeather,
  practicesDefault,
  practicesIrrigated,
  profileCoastal,
  profileLddEmpty,
  profileWithLdd,
} from './__fixtures__/fixtures';

// lib is ES2022 without DOM/node types; performance exists in node ≥16 and browsers
declare const performance: { now(): number };

const weather = makeWeather(2016, 2025);

describe('runSeason', () => {
  it('LDD-empty profile returns a full, contract-valid SeasonResult with low salinity confidence', () => {
    const r = runSeason({
      profile: profileLddEmpty,
      practices: practicesDefault,
      weather,
      year: 2024,
    });
    expect(() => SeasonResult.parse(r)).not.toThrow();
    expect(r.salinity.confidence.level).toBe('low');
    expect(r.salinity.origin).toBe('inland_rock_salt');
    expect(r.modelVersion).toBe(MODEL_VERSION);
    expect(r.yield.kgPerHa.p50).toBeGreaterThan(0);
    expect(r.daily!.length).toBeGreaterThan(90);
  });
  it('LDD profile validates too', () => {
    const r = runSeason({
      profile: profileWithLdd,
      practices: practicesIrrigated,
      weather,
      year: 2024,
    });
    expect(SeasonResult.parse(r)).toBeTruthy();
  });
  it('coastal_intrusion dry season with irrigation runs and is saltier than wet season', () => {
    const dry = runSeason({
      profile: profileCoastal,
      practices: { ...practicesIrrigated, variety: 'PTT1', season: 'dry1' },
      weather,
      year: 2024,
    });
    const wet = runSeason({
      profile: profileCoastal,
      practices: { ...practicesIrrigated, variety: 'PTT1', season: 'wet' },
      weather,
      year: 2024,
    });
    expect(SeasonResult.parse(dry).salinity.origin).toBe('coastal_intrusion');
    expect(dry.salinity.eceDsm.p50).toBeGreaterThan(wet.salinity.eceDsm.p50);
    expect(dry.water.irrigationNeedMm).toBeGreaterThan(wet.water.irrigationNeedMm);
  });
  it('photoperiod-sensitive KDML105 flowers on a fixed date', () => {
    const a = seasonWindow(profileLddEmpty, { ...practicesDefault, plantDate: '2024-06-15' }, 2024);
    const b = seasonWindow(profileLddEmpty, { ...practicesDefault, plantDate: '2024-07-30' }, 2024);
    expect(a.floweringDay).toBe(b.floweringDay);
    expect(a.lengthDays).toBeGreaterThan(b.lengthDays);
  });
  it('salt stress lowers yield', () => {
    const lo = runSeason({
      profile: profileLddEmpty,
      practices: { ...practicesIrrigated, measuredEcSoilDsm: 1 },
      weather,
      year: 2024,
    });
    const hi = runSeason({
      profile: profileLddEmpty,
      practices: { ...practicesIrrigated, measuredEcSoilDsm: 12 },
      weather,
      year: 2024,
    });
    expect(hi.yield.fSalt).toBeLessThan(lo.yield.fSalt);
    expect(hi.yield.kgPerHa.p50).toBeLessThan(lo.yield.kgPerHa.p50);
    expect(hi.salinity.confidence.level).toBe('high');
  });
});

describe('runSeasonEnsemble', () => {
  it('percentiles ordered and contract-valid', () => {
    const { quick, years } = runSeasonEnsemble({
      profile: profileLddEmpty,
      practices: practicesDefault,
      weather,
    });
    expect(years.length).toBeGreaterThanOrEqual(9);
    expect(quick.year).toBe(years[years.length - 1]!.year);
    for (const p of [quick.yield.kgPerHa, quick.salinity.eceDsm]) {
      expect(p.p10).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p90);
    }
    expect(quick.yield.kgPerHa.p90).toBeGreaterThan(quick.yield.kgPerHa.p10); // inter-annual spread
    expect(() => SeasonResult.parse(quick)).not.toThrow();
  });
  it('calibration with last yield moves the median toward the observation', () => {
    const plain = runSeasonEnsemble({
      profile: profileLddEmpty,
      practices: practicesDefault,
      weather,
    }).quick;
    const cal = runSeasonEnsemble({
      profile: profileLddEmpty,
      practices: { ...practicesDefault, lastYieldKgPerRai: 600 },
      weather,
    }).quick;
    expect(cal.yield.kgPerHa.p50).toBeGreaterThan(plain.yield.kgPerHa.p50);
    expect(cal.yield.confidence.level).not.toBe('high');
  });
  it('falls back to a single year when weather does not cover a season', () => {
    const short = weather.filter((w) => w.date >= '2025-07-01' && w.date < '2025-08-01');
    const { quick } = runSeasonEnsemble({
      profile: profileLddEmpty,
      practices: practicesDefault,
      weather: short,
    });
    expect(quick.water.confidence.level).toBe('low');
    expect(() => SeasonResult.parse(quick)).not.toThrow();
  });
  it('performance: 10 years of daily data < 50 ms', () => {
    runSeasonEnsemble({ profile: profileLddEmpty, practices: practicesDefault, weather }); // warm-up
    const t0 = performance.now();
    const n = 5;
    for (let k = 0; k < n; k++)
      runSeasonEnsemble({ profile: profileLddEmpty, practices: practicesIrrigated, weather });
    const ms = (performance.now() - t0) / n;
    expect(ms).toBeLessThan(50);
  });
});
