import { describe, expect, it } from 'vitest';
import { EnqueueRunRequest, polygonToEwkt, practicesToRow, toField, UpdateFieldRequest } from './fields';
import { safeNext } from '@/lib/auth/safe-next';
import { TileParams } from './tiles';

const polygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [103.247, 16.048],
      [103.253, 16.048],
      [103.253, 16.052],
      [103.247, 16.048],
    ] as [number, number][],
  ],
};

describe('fields helpers', () => {
  it('polygonToEwkt', () => {
    expect(polygonToEwkt(polygon)).toBe('SRID=4326;POLYGON((103.247 16.048,103.253 16.048,103.253 16.052,103.247 16.048))');
  });

  it('practicesToRow maps camelCase → snake columns', () => {
    expect(practicesToRow('f1', { variety: 'RD6', plantDate: '2025-07-01', waterRegime: 'awd', nKgPerRai: 12 })).toEqual({
      field_id: 'f1',
      season_year: 2025,
      season: null,
      variety: 'RD6',
      plant_date: '2025-07-01',
      establishment: null,
      water_source: null,
      water_regime: 'awd',
      n_kg_rai: 12,
      organic_t_rai: null,
      straw_burn: null,
    });
  });

  it('toField coerces numeric area', () => {
    const f = toField({
      id: '00000000-0000-0000-0000-000000000001',
      name: 'x',
      vertices: [{ lat: 16, lng: 103 }],
      area_rai: '12.5',
      province_code: '44',
      district_code: null,
      subdistrict_code: null,
      is_demo: true,
      created_at: '2026-10-10T00:00:00Z',
    });
    expect(f.area_rai).toBe(12.5);
  });

  it('UpdateFieldRequest requires vertices+polygon together and something to update', () => {
    expect(UpdateFieldRequest.safeParse({ name: 'ใหม่' }).success).toBe(true);
    expect(UpdateFieldRequest.safeParse({}).success).toBe(false);
    expect(UpdateFieldRequest.safeParse({ polygon }).success).toBe(false);
    const vertices = [
      { lat: 16.048, lng: 103.247 },
      { lat: 16.048, lng: 103.253 },
      { lat: 16.052, lng: 103.253 },
    ];
    expect(UpdateFieldRequest.safeParse({ polygon, vertices }).success).toBe(true);
  });

  it('EnqueueRunRequest validates scenario ids', () => {
    expect(EnqueueRunRequest.safeParse({ scenario_id: 'awd' }).success).toBe(true);
    expect(EnqueueRunRequest.safeParse({ scenario_id: 'nope' }).success).toBe(false);
  });
});

describe('safeNext', () => {
  it('allows only same-origin paths', () => {
    expect(safeNext('/fields/1?x=1')).toBe('/fields/1?x=1');
    expect(safeNext(null)).toBe('/map');
    expect(safeNext('//evil.com')).toBe('/map');
    expect(safeNext('/\\evil.com')).toBe('/map');
    expect(safeNext('https://evil.com')).toBe('/map');
    expect(safeNext('', '/')).toBe('/');
  });
});

describe('TileParams', () => {
  it('accepts whitelisted layers and in-range tiles', () => {
    expect(TileParams.parse({ layer: 'geology', z: '10', x: '805', y: '470.pbf' })).toEqual({
      layer: 'geology',
      z: 10,
      x: 805,
      y: 470,
    });
  });
  it('rejects unknown layers and out-of-range coords', () => {
    expect(TileParams.safeParse({ layer: 'users', z: '1', x: '0', y: '0' }).success).toBe(false);
    expect(TileParams.safeParse({ layer: 'geology', z: '1', x: '2', y: '0' }).success).toBe(false);
    expect(TileParams.safeParse({ layer: 'geology', z: '23', x: '0', y: '0' }).success).toBe(false);
    expect(TileParams.safeParse({ layer: 'geology', z: '-1', x: '0', y: '0' }).success).toBe(false);
  });
});

describe('demo field id', () => {
  it('FieldId accepts DEMO_FIELD_ID (contracts z.uuid() would not)', async () => {
    const { DEMO_FIELD_ID } = await import('@rice/contracts');
    const { FieldId } = await import('./fields');
    expect(FieldId.safeParse(DEMO_FIELD_ID).success).toBe(true);
    expect(FieldId.safeParse('not-a-uuid').success).toBe(false);
  });
});
