import { AnalyzeResponse } from '@rice/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { analyzeErrorStatus, analyzeMessageTh, apiErrorBody, buildAnalyzeError, pgErrorCode } from './errors';

describe('analyze error mapping', () => {
  it('Thai messages per code', () => {
    expect(analyzeMessageTh('OUTSIDE_THAILAND')).toBe('รองรับเฉพาะพื้นที่ในประเทศไทย');
    expect(analyzeMessageTh('PROVINCE_NOT_ENABLED', 'ขอนแก่น')).toBe('จังหวัดขอนแก่นยังไม่เปิดให้ประเมิน');
    expect(analyzeMessageTh('PROVINCE_NOT_ENABLED')).toContain('ยังไม่เปิดให้ประเมิน');
    expect(analyzeMessageTh('INVALID_POLYGON')).toContain('ไม่ถูกต้อง');
    expect(analyzeMessageTh('INTERNAL')).toContain('ลองใหม่');
  });

  it('statuses', () => {
    expect(analyzeErrorStatus('OUTSIDE_THAILAND')).toBe(422);
    expect(analyzeErrorStatus('PROVINCE_NOT_ENABLED')).toBe(422);
    expect(analyzeErrorStatus('INVALID_POLYGON')).toBe(422);
    expect(analyzeErrorStatus('INVALID_POLYGON', true)).toBe(400);
    expect(analyzeErrorStatus('INTERNAL')).toBe(500);
  });

  it('buildAnalyzeError conforms to AnalyzeResponse', () => {
    const e = buildAnalyzeError('PROVINCE_NOT_ENABLED', {
      provinceCode: '40',
      provinceNameTh: 'ขอนแก่น',
      enabledProvinces: [{ code: '44', name_th: 'มหาสารคาม' }],
    });
    expect(AnalyzeResponse.parse(e)).toEqual(e);
    expect(e).toMatchObject({ ok: false, error: 'PROVINCE_NOT_ENABLED', province_code: '40' });
    const plain = buildAnalyzeError('OUTSIDE_THAILAND');
    expect(plain).not.toHaveProperty('province_code');
    expect(plain).not.toHaveProperty('enabled_provinces');
  });
});

describe('generic API errors', () => {
  it('maps pg codes', () => {
    expect(pgErrorCode({ code: '42501' })).toBe('NOT_FOUND');
    expect(pgErrorCode({ code: '22023' })).toBe('BAD_REQUEST');
    expect(pgErrorCode({ code: '22P02' })).toBe('BAD_REQUEST');
    expect(pgErrorCode({ code: '23505' })).toBe('CONFLICT');
    expect(pgErrorCode({ code: 'XX000' })).toBe('INTERNAL');
    expect(pgErrorCode(null)).toBe('INTERNAL');
  });

  it('includes zod issues with paths', () => {
    const r = z.object({ name: z.string() }).safeParse({});
    expect(r.success).toBe(false);
    const body = apiErrorBody('BAD_REQUEST', r.error!.issues);
    expect(body).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
    expect(body.issues?.[0]?.path).toBe('name');
  });
});
