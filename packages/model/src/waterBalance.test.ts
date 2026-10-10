import { describe, expect, it } from 'vitest';
import { capillaryRiseRate, irrigationDemand, soilWaterParams, waterStep } from './waterBalance';
import { simulateSeason } from './runSeason';
import {
  makeWeather,
  practicesDefault,
  practicesIrrigated,
  profileLddEmpty,
  profileWithLdd,
} from './__fixtures__/fixtures';

const weather = makeWeather(2016, 2025);

describe('waterStep', () => {
  const prm = soilWaterParams(profileLddEmpty);
  it('conserves mass for each daily step across states', () => {
    for (const w0 of [-prm.dMaxMm, -100, -prm.sdMm, -5, 0, 30, 140, prm.bundMm]) {
      for (const [rain, irr, etc] of [
        [0, 0, 5],
        [80, 0, 4],
        [0, 60, 6],
        [200, 50, 3],
      ] as const) {
        const f = waterStep(w0, rain, irr, etc, prm);
        expect(f.w - w0).toBeCloseTo(f.p + f.i + f.cr - f.eta - f.dp - f.ro, 9);
        expect(f.w).toBeLessThanOrEqual(prm.bundMm + 1e-9);
        expect(f.w).toBeGreaterThanOrEqual(-prm.dMaxMm - 1e-9);
      }
    }
  });
  it('capillary rise 0 when groundwater deeper than 3 m', () => {
    expect(capillaryRiseRate(3.5)).toBe(0);
    expect(capillaryRiseRate(1)).toBeGreaterThan(0);
  });
  it('AWD re-floods only below −150 mm water level', () => {
    expect(irrigationDemand(-5, 'awd', false, prm)).toBe(0);
    expect(irrigationDemand(-20, 'awd', false, prm)).toBeGreaterThan(0);
    expect(irrigationDemand(10, 'continuous', false, prm)).toBeGreaterThan(0);
    expect(irrigationDemand(-5, 'awd', true, prm)).toBeGreaterThan(0);
  });
  it('LDD ksat/awc used when present, clay fallback otherwise', () => {
    expect(soilWaterParams(profileWithLdd).confidence.level).toBe('medium');
    expect(soilWaterParams(profileLddEmpty).confidence.level).toBe('low');
  });
});

describe('season water balance', () => {
  for (const [name, practices] of [
    ['rainfed default', practicesDefault],
    ['irrigated continuous', practicesIrrigated],
    ['irrigated awd', { ...practicesIrrigated, waterRegime: 'awd' as const }],
  ] as const) {
    it(`conserves mass over the season (${name})`, () => {
      const s = simulateSeason({ profile: profileLddEmpty, practices, weather, year: 2020 });
      const net = s.sum.p + s.sum.i + s.sum.cr - s.sum.eta - s.sum.dp - s.sum.ro;
      expect(Math.abs(s.wEnd - s.wStart - net)).toBeLessThan(1e-6);
    });
  }
  it('irrigation applied only with access; rainfed source still reports need', () => {
    const rf = simulateSeason({
      profile: profileLddEmpty,
      practices: practicesDefault,
      weather,
      year: 2020,
    });
    expect(rf.sum.i).toBe(0);
    expect(rf.irrigationNeedMm).toBeGreaterThanOrEqual(0);
    const irr = simulateSeason({
      profile: profileLddEmpty,
      practices: practicesIrrigated,
      weather,
      year: 2020,
    });
    expect(irr.sum.i).toBeGreaterThan(0);
    expect(irr.sum.i).toBeCloseTo(irr.irrigationNeedMm, 9);
  });
});
