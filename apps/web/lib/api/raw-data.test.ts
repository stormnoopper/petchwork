import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/anon', () => ({ createAnonClient: vi.fn() }));

const { cellText, parseRawTable, toCsv } = await import('./raw-data');

describe('parseRawTable', () => {
  it('accepts allow-listed tables (raw or URL-encoded)', () => {
    expect(parseRawTable('ref.admin_boundaries')).toBe('ref.admin_boundaries');
    expect(parseRawTable('obs.weather_daily')).toBe('obs.weather_daily');
  });
  it('rejects user / internal tables', () => {
    for (const t of ['app.users', 'app.fields', 'sim.model_runs', 'obs.sat_indices', 'meta.api_clients', '']) {
      expect(parseRawTable(t)).toBeNull();
    }
  });
});

describe('toCsv', () => {
  it('starts with a UTF-8 BOM, escapes quotes/commas/newlines and keeps Thai text', () => {
    const csv = toCsv(['a', 'b', 'c'], [
      { a: 'กรุงเทพ', b: 'x,"y"', c: null },
      { a: 1.5, b: 'line\nbreak', c: { k: 1 } },
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'a,b,c',
      'กรุงเทพ,"x,""y""",',
      '1.5,"line\nbreak","{""k"":1}"',
      '',
    ]);
  });
});

describe('cellText', () => {
  it('renders null as empty and objects as JSON', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(false)).toBe('false');
    expect(cellText([1, 2])).toBe('[1,2]');
  });
});
