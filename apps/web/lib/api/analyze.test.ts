import { AnalyzeResponse, DEFAULT_PRACTICES, type FieldProfile, type PolygonGeoJSON } from '@rice/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWeather, profileLddEmpty } from '../../../../packages/model/src/__fixtures__/fixtures';
import { analyze, effectivePractices, resetAnalyzeCaches, weatherRange, type RpcClient } from './analyze';

const polygon: PolygonGeoJSON = {
  type: 'Polygon',
  coordinates: [
    [
      [103.247, 16.048],
      [103.253, 16.048],
      [103.253, 16.052],
      [103.247, 16.052],
      [103.247, 16.048],
    ],
  ],
};

const profile: FieldProfile = {
  ...profileLddEmpty,
  grid: { ...profileLddEmpty.grid!, weather_grid_id: 3804431 },
  data_versions: { dmr_rock_250k: 'seed', thaiwater: 'seed' },
};
const weather = makeWeather(2016, 2025);

function mockClient(handlers: Record<string, (args?: Record<string, unknown>) => { data: unknown; error: null | { message: string; code?: string } }>) {
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
    const h = handlers[fn];
    if (!h) throw new Error(`unexpected rpc ${fn}`);
    return h(args);
  });
  return { client: { rpc } as RpcClient, rpc };
}

const NOW = new Date('2026-10-10T00:00:00Z');
const silent = () => {};

beforeEach(() => resetAnalyzeCaches());

describe('weatherRange', () => {
  it('covers the last 10 full years', () => {
    expect(weatherRange(NOW)).toEqual({ from: '2016-01-01', to: '2025-12-31', lastYear: 2025 });
  });
});

describe('effectivePractices', () => {
  it('defaults: province variety, irrigated when in irrigation zone, user wins', () => {
    const p = { ...profile, in_irrigation_zone: true, coverage: { ...profile.coverage, default_variety: 'RD6' as const } };
    expect(effectivePractices(p)).toMatchObject({ variety: 'RD6', waterSource: 'irrigated', waterRegime: 'continuous' });
    expect(effectivePractices(p, { variety: 'RD15', waterRegime: 'awd' })).toMatchObject({
      variety: 'RD15',
      waterSource: 'irrigated',
      waterRegime: 'awd',
    });
    expect(effectivePractices(p, { waterSource: 'rainfed' })).toMatchObject({ waterRegime: 'rainfed' });
  });

  it('falls back to DEFAULT_PRACTICES outside irrigation zone', () => {
    const p = { ...profile, in_irrigation_zone: false, coverage: { ...profile.coverage, default_variety: null } };
    expect(effectivePractices(p)).toEqual(DEFAULT_PRACTICES);
  });
});

describe('analyze()', () => {
  it('400 INVALID_POLYGON on bad body without calling the DB', async () => {
    const { client, rpc } = mockClient({});
    const out = await analyze(client, { polygon: { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] } }, { log: silent });
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ ok: false, error: 'INVALID_POLYGON' });
    expect(rpc).not.toHaveBeenCalled();
    expect((await analyze(client, undefined, { log: silent })).status).toBe(400);
  });

  it('ok:true with profile, 10y weather, quick result and attribution; then cache hit', async () => {
    const { client, rpc } = mockClient({
      analyze_polygon: () => ({ data: profile, error: null }),
      weather_series: (a) => {
        expect(a).toEqual({ p_grid_id: 3804431, p_from: '2016-01-01', p_to: '2025-12-31' });
        return { data: weather, error: null };
      },
    });
    const out = await analyze(client, { polygon }, { now: NOW, log: silent });
    expect(out.status).toBe(200);
    expect(out.cache).toBe('miss');
    const body = AnalyzeResponse.parse(out.body);
    if (!body.ok) throw new Error('expected ok');
    expect(body.weather).toHaveLength(weather.length);
    expect(body.quick.season).toBe('wet');
    expect(body.attribution).toContain('คลังข้อมูลน้ำแห่งชาติ (สสน.)');
    expect(body.attribution).toContain('กรมทรัพยากรธรณี');

    const again = await analyze(client, { polygon }, { now: NOW, log: silent });
    expect(again.cache).toBe('hit');
    expect(rpc).toHaveBeenCalledTimes(2);

    // different practices → new model run but weather comes from its own cache
    const awd = await analyze(client, { polygon, practices: { waterRegime: 'awd' } }, { now: NOW, log: silent });
    expect(awd.cache).toBe('miss');
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls.filter(([fn]) => fn === 'weather_series')).toHaveLength(1);
  });

  it('PROVINCE_NOT_ENABLED → 422 + Thai message + enabled provinces', async () => {
    const { client } = mockClient({
      analyze_polygon: () => ({
        data: { ok: false, error: 'PROVINCE_NOT_ENABLED', province_code: '40', province_name_th: 'ขอนแก่น' },
        error: null,
      }),
      enabled_provinces: () => ({ data: [{ province_code: '44', name_th: 'มหาสารคาม' }], error: null }),
    });
    const out = await analyze(client, { polygon }, { log: silent });
    expect(out.status).toBe(422);
    expect(out.body).toEqual({
      ok: false,
      error: 'PROVINCE_NOT_ENABLED',
      message_th: 'จังหวัดขอนแก่นยังไม่เปิดให้ประเมิน',
      province_code: '40',
      enabled_provinces: [{ code: '44', name_th: 'มหาสารคาม' }],
    });
  });

  it('OUTSIDE_THAILAND → 422', async () => {
    const { client } = mockClient({
      analyze_polygon: () => ({ data: { ok: false, error: 'OUTSIDE_THAILAND' }, error: null }),
      enabled_provinces: () => ({ data: [], error: null }),
    });
    const out = await analyze(client, { polygon }, { log: silent });
    expect(out.status).toBe(422);
    expect(out.body).toMatchObject({ ok: false, error: 'OUTSIDE_THAILAND', message_th: 'รองรับเฉพาะพื้นที่ในประเทศไทย' });
  });

  it('RPC transport error / bad shape → 500 INTERNAL, not cached', async () => {
    const { client, rpc } = mockClient({ analyze_polygon: () => ({ data: null, error: { message: 'boom' } }) });
    expect((await analyze(client, { polygon }, { log: silent })).status).toBe(500);
    expect((await analyze(client, { polygon }, { log: silent })).status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(2);

    const bad = mockClient({ analyze_polygon: () => ({ data: { ok: true }, error: null }) });
    const out = await analyze(bad.client, { polygon }, { log: silent });
    expect(out).toMatchObject({ status: 500, body: { ok: false, error: 'INTERNAL' } });
  });
});
