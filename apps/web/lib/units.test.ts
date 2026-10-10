import { describe, expect, it } from 'vitest';
import {
  formatRai,
  formatRaiNganWa,
  fromRaiNganWa,
  haToM2,
  m2ToHa,
  m2ToRai,
  raiToHa,
  raiToM2,
  toRaiNganWa,
} from './units';

describe('units', () => {
  it('converts rai ↔ m² ↔ ha', () => {
    expect(raiToM2(1)).toBe(1600);
    expect(m2ToRai(3200)).toBe(2);
    expect(raiToHa(1)).toBeCloseTo(0.16, 10);
    expect(m2ToHa(16_000)).toBeCloseTo(1.6, 10);
    expect(haToM2(1)).toBe(10_000);
  });

  it('splits m² into ไร่-งาน-ตร.ว.', () => {
    // 12 ไร่ 2 งาน 35 ตร.ว. = 19200 + 800 + 140
    expect(toRaiNganWa(20_140)).toEqual({ rai: 12, ngan: 2, wa: 35 });
    expect(fromRaiNganWa({ rai: 12, ngan: 2, wa: 35 })).toBe(20_140);
    expect(toRaiNganWa(0)).toEqual({ rai: 0, ngan: 0, wa: 0 });
  });

  it('rounds ตร.ว. with carry', () => {
    // 399.9 ตร.ว. → 400 ตร.ว. = 1 ไร่ exactly
    expect(toRaiNganWa(1599.6)).toEqual({ rai: 1, ngan: 0, wa: 0 });
    expect(toRaiNganWa(399.0)).toEqual({ rai: 0, ngan: 1, wa: 0 });
  });

  it('formats Thai labels', () => {
    expect(formatRaiNganWa(20_140)).toBe('12 ไร่ 2 งาน 35 ตร.ว.');
    expect(formatRaiNganWa(1600)).toBe('1 ไร่');
    expect(formatRaiNganWa(4840)).toBe('3 ไร่ 10 ตร.ว.');
    expect(formatRaiNganWa(1)).toBe('0 ตร.ว.');
    expect(formatRaiNganWa(1600 * 1234)).toBe('1,234 ไร่');
    expect(formatRai(20_140)).toBe('12.59 ไร่');
  });
});
