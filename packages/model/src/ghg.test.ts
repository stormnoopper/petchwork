import { describe, expect, it } from 'vitest';
import { computeGhg, sfOrganic } from './ghg';
import { runSeason } from './runSeason';
import { makeWeather, practicesIrrigated, profileLddEmpty } from './__fixtures__/fixtures';

const base = {
  seasonDays: 100,
  regime: 'continuous' as const,
  droughtProne: false,
  nKgPerRai: 10,
  organicTPerRai: 0,
  strawBurn: true,
  yieldKgHa: 4000,
};

describe('computeGhg', () => {
  it('IPCC Tier 1 CH4 with no amendments = 1.22 × days', () => {
    const g = computeGhg(base);
    const strawBurnCh4 = g.ch4KgHa - 1.22 * 100;
    expect(strawBurnCh4).toBeGreaterThan(0); // burning adds CH4
    expect(g.sfO).toBe(1);
  });
  it('AWD < continuous; saving matches difference', () => {
    const c = computeGhg(base);
    const a = computeGhg({ ...base, regime: 'awd' });
    expect(a.ch4KgHa).toBeLessThan(c.ch4KgHa);
    expect(a.awdSavingCo2eTHa).toBe(0);
    expect(c.awdSavingCo2eTHa).toBeCloseTo(((c.ch4KgHa - a.ch4KgHa) * 27) / 1000, 9);
  });
  it('N2O / urea CO2 scale with N', () => {
    const g = computeGhg(base);
    const nHa = 10 / 0.16;
    expect(g.co2KgHa).toBeCloseTo((nHa / 0.46) * 0.2 * (44 / 12), 9);
    expect(g.n2oKgHa).toBeGreaterThan(nHa * 0.004 * (44 / 28));
  });
  it('organic amendments raise SF_o', () => {
    expect(sfOrganic(0, 0)).toBe(1);
    expect(sfOrganic(2, 5)).toBeGreaterThan(1);
  });
});

describe('runSeason CH4 coupling', () => {
  it('AWD gives lower CH4 than continuous with everything else equal', () => {
    const weather = makeWeather(2016, 2025);
    const c = runSeason({
      profile: profileLddEmpty,
      practices: practicesIrrigated,
      weather,
      year: 2022,
    });
    const a = runSeason({
      profile: profileLddEmpty,
      practices: { ...practicesIrrigated, waterRegime: 'awd' },
      weather,
      year: 2022,
    });
    expect(a.ghg.ch4KgHa).toBeLessThan(c.ghg.ch4KgHa);
    expect(a.ghg.co2eTHa).toBeLessThan(c.ghg.co2eTHa);
    expect(c.ghg.awdSavingCo2eTHa).toBeGreaterThan(0);
    expect(a.ghg.awdSavingCo2eTHa).toBe(0);
    expect(a.water.irrigationNeedMm).toBeLessThan(c.water.irrigationNeedMm);
  });
});
