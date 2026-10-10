import { describe, expect, it } from 'vitest';
import { baseEce, classifySalinity, fSalt, salinityRecommendations } from './salinity';
import {
  practicesDefault,
  profileCoastal,
  profileLddEmpty,
  profileWithLdd,
} from './__fixtures__/fixtures';

describe('fSalt (Maas–Hoffman)', () => {
  it('ECe 5 dS/m generic → 0.76 (SPEC §12)', () => {
    expect(fSalt(5, 'generic')).toBeCloseTo(0.76, 10);
    expect(fSalt(5)).toBeCloseTo(0.76, 10);
  });
  it('clamps to 0..1', () => {
    expect(fSalt(0)).toBe(1);
    expect(fSalt(3)).toBe(1);
    expect(fSalt(50)).toBe(0);
  });
  it('per-variety params', () => {
    expect(fSalt(5, 'PTT1')).toBeLessThan(fSalt(5, 'KDML105'));
  });
});

describe('classifySalinity', () => {
  it('bounds 2 / 4 / 8', () => {
    expect(classifySalinity(1.99)).toBe('non_saline');
    expect(classifySalinity(2)).toBe('slight');
    expect(classifySalinity(4)).toBe('moderate');
    expect(classifySalinity(8)).toBe('severe');
  });
});

describe('baseEce', () => {
  it('LDD empty → fallback indicators with low confidence', () => {
    const b = baseEce(profileLddEmpty, practicesDefault);
    expect(b.origin).toBe('inland_rock_salt');
    expect(b.confidence).toEqual({ level: 'low', source: 'fallback' });
    expect(b.usedLdd).toBe(false);
    expect(b.eceDsm).toBeGreaterThan(1);
  });
  it('LDD present → uses profile salinity confidence', () => {
    const b = baseEce(profileWithLdd, practicesDefault);
    expect(b.usedLdd).toBe(true);
    expect(b.confidence.level).toBe('medium');
  });
  it('user-measured soil EC overrides with high confidence', () => {
    const b = baseEce(profileLddEmpty, { ...practicesDefault, measuredEcSoilDsm: 7.5 });
    expect(b.eceDsm).toBe(7.5);
    expect(b.confidence.level).toBe('high');
  });
  it('coastal_intrusion: closer to coast → higher ECe and saltier dry-season irrigation water', () => {
    const near = baseEce(profileCoastal, practicesDefault);
    const far = baseEce(
      { ...profileCoastal, grid: { ...profileCoastal.grid!, coast_dist_km: 80 } },
      practicesDefault,
    );
    expect(near.origin).toBe('coastal_intrusion');
    expect(near.eceDsm).toBeGreaterThan(far.eceDsm);
    expect(near.irrEcDryDsm).toBeGreaterThan(near.irrEcWetDsm);
    expect(near.confidence.level).toBe('low');
  });
  it('mixed takes the worse of inland and coastal; none is lowest', () => {
    const mk = (o: 'mixed' | 'none' | 'inland_rock_salt') =>
      baseEce(
        { ...profileLddEmpty, coverage: { ...profileLddEmpty.coverage, salinity_origin: o } },
        practicesDefault,
      ).eceDsm;
    expect(mk('mixed')).toBeGreaterThanOrEqual(mk('inland_rock_salt'));
    expect(mk('none')).toBeLessThan(mk('inland_rock_salt'));
  });
});

describe('recommendations', () => {
  it('non-saline, fresh gw → none', () => {
    expect(
      salinityRecommendations({
        cls: 'non_saline',
        origin: 'none',
        fSalt: 1,
        gwEcDsm: 0.3,
        hasIrrigation: false,
        irrEcDsm: 0.4,
      }),
    ).toEqual(['none']);
  });
  it('severe inland → tolerant variety, gypsum, trees, avoid saline gw', () => {
    const r = salinityRecommendations({
      cls: 'severe',
      origin: 'inland_rock_salt',
      fSalt: 0.4,
      gwEcDsm: 4,
      hasIrrigation: false,
      irrEcDsm: 0.4,
    });
    expect(r).toEqual(['salt_tolerant_variety', 'gypsum', 'trees_on_recharge', 'avoid_saline_gw']);
  });
});
