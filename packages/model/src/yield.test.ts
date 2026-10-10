import { describe, expect, it } from 'vitest';
import { calibrationFactor, fNutrient, fWater, yieldKgHa } from './yield';

describe('yield', () => {
  it('fNutrient saturates and is monotone', () => {
    expect(fNutrient(0)).toBeCloseTo(0.55, 9);
    expect(fNutrient(10)).toBeGreaterThan(fNutrient(5));
    expect(fNutrient(100)).toBeLessThanOrEqual(1);
    expect(fNutrient(10, 2)).toBeGreaterThan(fNutrient(10));
  });
  it('fWater ratio clamp', () => {
    expect(fWater(50, 100)).toBe(0.5);
    expect(fWater(0, 0)).toBe(1);
  });
  it('Y = Ypot × factors', () => {
    expect(yieldKgHa('RD41', 1, 1, 1)).toBe(5600);
    expect(yieldKgHa('RD41', 0.5, 0.8, 1)).toBeCloseTo(2240, 9);
  });
  it('calibration blends half-way toward observation', () => {
    expect(calibrationFactor(3000, null)).toBe(1);
    // obs 400 kg/rai = 2500 kg/ha vs model 2000 → r 1.25 → 1.125
    expect(calibrationFactor(2000, 400)).toBeCloseTo(1.125, 9);
  });
});
