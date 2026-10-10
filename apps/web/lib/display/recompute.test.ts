// SPEC §12: toggling AWD ↔ ขังตลอด changes CH4 immediately via the client-side recompute path
// (same call ResultPanel makes: runSeasonEnsemble on the profile + weather already returned).
import { describe, expect, it } from 'vitest';
import { runSeasonEnsemble } from '@rice/model';
import {
  makeWeather,
  practicesIrrigated,
  profileLddEmpty,
} from '../../../../packages/model/src/__fixtures__/fixtures';
import { toDisplayResult } from './results';

describe('client recompute', () => {
  it('AWD lowers CH4 vs continuous flooding without any request', () => {
    const weather = makeWeather(2016, 2025);
    const run = (waterRegime: 'continuous' | 'awd') => {
      const r = runSeasonEnsemble({
        profile: profileLddEmpty,
        practices: { ...practicesIrrigated, waterRegime },
        weather,
        year: 2025,
        includeDaily: false,
      });
      return toDisplayResult(r.quick, r.years, profileLddEmpty.area_rai);
    };
    const cont = run('continuous');
    const awd = run('awd');
    expect(awd.ghg.ch4KgRai).toBeLessThan(cont.ghg.ch4KgRai);
    expect(cont.ghg.awdSavingTRai).toBeGreaterThan(0);
    expect(awd.ghg.awdSavingTRai).toBe(0);
    // LDD placeholder → salinity confidence low
    expect(cont.salinity.confidence.level).toBe('low');
  });
});
