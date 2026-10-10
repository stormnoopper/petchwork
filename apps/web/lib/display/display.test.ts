import { describe, expect, it } from 'vitest';
import { DEFAULT_PRACTICES, type FieldProfile, type SeasonResult } from '@rice/contracts';
import { attributionLines, formatDataVersions, usesThaiWater } from './attribution';
import { confidenceLabel, confidenceTone, lowestConfidence } from './confidence';
import {
  DRAFT_TTL_MS,
  loginUrlForDraft,
  parseDraft,
  saveDraft,
  serializeDraft,
  takeDraft,
} from './draft';
import { fmt, formatAdaptive, formatRange } from './fmt';
import { verticesToPolygon, verticesToSvgPoints } from './geometry';
import {
  defaultPracticesFor,
  parseNumberInput,
  practicesFromRow,
  withWaterSource,
} from './practices';
import { toDisplayResult, toYearSeries } from './results';
import { kgHaToKgRai, mmToM3PerRai, percentilesOf, quantile, tHaToTRai } from './units';
import { parseCreatedField } from './created-field';
import {
  DEFAULT_SNAP,
  nearestSnap,
  nextSnap,
  releaseSnap,
  snapForStatus,
} from '@/components/results/sheet';

const V = [
  { lat: 16.2, lng: 103.2 },
  { lat: 16.2, lng: 103.21 },
  { lat: 16.21, lng: 103.21 },
  { lat: 16.21, lng: 103.2 },
];

describe('display units', () => {
  it('kg/ha → กก./ไร่ (×0.16)', () => expect(kgHaToKgRai(2500)).toBeCloseTo(400));
  it('t/ha → ตัน/ไร่', () => expect(tHaToTRai(5)).toBeCloseTo(0.8));
  it('mm → ลบ.ม./ไร่ (×1.6)', () => {
    expect(mmToM3PerRai(100)).toBeCloseTo(160);
    expect(mmToM3PerRai(1)).toBeCloseTo(1.6);
  });
  it('quantile / percentiles', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.1)).toBeCloseTo(1);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
    expect(percentilesOf([5])).toEqual({ p10: 5, p50: 5, p90: 5 });
  });
});

describe('fmt', () => {
  it('interpolates and keeps unknown keys', () => expect(fmt('{a} {b}', { a: 1 })).toBe('1 {b}'));
  it('adaptive precision', () => {
    expect(formatAdaptive(0.0342)).toBe('0.034');
    expect(formatAdaptive(1.234)).toBe('1.23');
    expect(formatAdaptive(1234.5)).toBe('1,235');
  });
  it('range collapses equal ends', () => {
    expect(formatRange(1.001, 1.002)).toBe('1');
    expect(formatRange(300, 440)).toBe('300–440');
  });
});

describe('confidence mapping', () => {
  it('Thai labels', () => {
    expect(confidenceLabel('high')).toBe('สูง');
    expect(confidenceLabel('medium')).toBe('กลาง');
    expect(confidenceLabel('low')).toBe('ต่ำ');
  });
  it('tones differ per level', () => {
    const tones = new Set((['high', 'medium', 'low'] as const).map(confidenceTone));
    expect(tones.size).toBe(3);
  });
  it('lowest wins', () => {
    expect(
      lowestConfidence([
        { level: 'high', source: 'a' },
        { level: 'low', source: 'b' },
      ]),
    ).toEqual({ level: 'low', source: 'b' });
    expect(lowestConfidence([])).toBeNull();
  });
});

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

describe('draft (de)serialization', () => {
  const practices = {
    ...DEFAULT_PRACTICES,
    waterSource: 'irrigated' as const,
    waterRegime: 'awd' as const,
  };
  it('round-trips', () => {
    const now = 1_000_000;
    const d = parseDraft(serializeDraft(V, practices, now), now + 1000);
    expect(d?.vertices).toEqual(V);
    expect(d?.practices.waterRegime).toBe('awd');
  });
  it('rejects garbage, bad schema and expired drafts', () => {
    expect(parseDraft('not json')).toBeNull();
    expect(
      parseDraft(
        JSON.stringify({ v: 1, savedAt: 0, vertices: [{ lat: 999, lng: 0 }], practices: {} }),
        1,
      ),
    ).toBeNull();
    expect(parseDraft(serializeDraft(V, practices, 0), DRAFT_TTL_MS + 1)).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });
  it('fills missing practice keys from defaults', () => {
    const raw = JSON.stringify({ v: 1, savedAt: 5, vertices: V, practices: { variety: 'RD6' } });
    expect(parseDraft(raw, 10)?.practices).toEqual({ ...DEFAULT_PRACTICES, variety: 'RD6' });
  });
  it('save → take clears every storage; a throwing storage is tolerated', () => {
    const a = memStore();
    const b = memStore();
    const broken = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    expect(saveDraft(V, practices, [broken, a, b])).toBe(true);
    expect(takeDraft([broken, a, b])?.vertices).toEqual(V);
    expect(a.m.size + b.m.size).toBe(0);
    expect(saveDraft(V, practices, [broken])).toBe(false);
  });
  it('login url encodes the restore target', () => {
    expect(loginUrlForDraft()).toBe('/login?next=%2Fmap%3Frestore%3D1');
  });
});

const profile = {
  in_irrigation_zone: true,
  coverage: { default_variety: 'RD15', has_ldd_soil: false, has_ldd_saline: false },
  data_versions: { dmr_rock_250k: 'seed', dgr_groundwater: 'seed' },
  grid: { river_ec_dry_dsm: null },
} as unknown as FieldProfile;

describe('practices', () => {
  it('region defaults', () => {
    expect(defaultPracticesFor(profile)).toMatchObject({
      variety: 'RD15',
      waterSource: 'irrigated',
      waterRegime: 'continuous',
    });
    expect(defaultPracticesFor(null)).toEqual(DEFAULT_PRACTICES);
  });
  it('water source keeps regime consistent', () => {
    const irr = withWaterSource(DEFAULT_PRACTICES, 'irrigated');
    expect(irr.waterRegime).toBe('continuous');
    expect(withWaterSource({ ...irr, waterRegime: 'awd' }, 'rainfed').waterRegime).toBe('rainfed');
  });
  it('number input clamps, blank → null', () => {
    expect(parseNumberInput('150', 0, 100)).toBe(100);
    expect(parseNumberInput('2,5', 0, 10)).toBe(2.5);
    expect(parseNumberInput('', 0, 10)).toBeNull();
    expect(parseNumberInput('abc', 0, 10)).toBeNull();
  });
  it('maps a stored row, ignoring invalid columns', () => {
    const p = practicesFromRow({
      variety: 'RD6',
      water_regime: 'awd',
      water_source: 'irrigated',
      n_kg_rai: '12.5',
      season: 'bogus',
    });
    expect(p).toMatchObject({ variety: 'RD6', waterRegime: 'awd', nKgPerRai: 12.5, season: 'wet' });
    expect(practicesFromRow(null)).toEqual(DEFAULT_PRACTICES);
  });
});

describe('attribution & versions', () => {
  it('ThaiWater detection', () => {
    expect(usesThaiWater(profile)).toBe(false);
    expect(usesThaiWater({ ...profile, data_versions: { thaiwater: '2026-10' } })).toBe(true);
    expect(attributionLines(profile, ['คลังข้อมูลน้ำแห่งชาติ (สสน.)', 'x', 'x'])).toEqual([
      'คลังข้อมูลน้ำแห่งชาติ (สสน.)',
      'x',
    ]);
  });
  it('version label', () => {
    expect(formatDataVersions({ a: 'seed', b: 'seed' })).toBe('seed');
    expect(formatDataVersions({ dmr: 'v2', dgr: 'v1' })).toBe('dgr v1 · dmr v2');
    expect(formatDataVersions({})).toBe('–');
  });
});

describe('geometry', () => {
  it('fits a square into the box', () => {
    const pts = verticesToSvgPoints(V, 200, 200, 10)
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(pts).toHaveLength(4);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(10 - 0.1);
      expect(x).toBeLessThanOrEqual(190.1);
      expect(y).toBeGreaterThanOrEqual(9.9);
      expect(y).toBeLessThanOrEqual(190.1);
    }
    // north is up: the first vertex (south) has a larger y than the third (north)
    expect(pts[0]![1]!).toBeGreaterThan(pts[2]![1]!);
  });
  it('closed GeoJSON ring', () => {
    const g = verticesToPolygon(V);
    expect(g.coordinates[0]).toHaveLength(5);
    expect(g.coordinates[0]![0]).toEqual(g.coordinates[0]![4]);
  });
});

const tag = { level: 'medium' as const, source: 'x' };
function season(year: number, yieldKgHa: number, co2e: number, availMm: number): SeasonResult {
  return {
    modelVersion: '0.1.0',
    season: 'wet',
    year,
    water: { availableMm: availMm, irrigationNeedMm: 0, deficitDays: 3, confidence: tag },
    yield: {
      kgPerHa: { p10: yieldKgHa, p50: yieldKgHa, p90: yieldKgHa },
      fWater: 1,
      fSalt: 0.76,
      fNutrient: 1,
      confidence: tag,
    },
    ghg: {
      ch4KgHa: 100,
      n2oKgHa: 1,
      co2KgHa: 0,
      co2eTHa: co2e,
      awdSavingCo2eTHa: 1,
      confidence: tag,
    },
    salinity: {
      eceDsm: { p10: 4, p50: 5, p90: 6 },
      baseEceDsm: 4,
      class: 'moderate',
      origin: 'inland_rock_salt',
      recommendations: ['gypsum'],
      confidence: { level: 'low', source: 'fallback' },
    },
  };
}

describe('toDisplayResult', () => {
  it('converts to per-rai units and ranges across years', () => {
    const years = [
      season(2023, 2000, 2, 500),
      season(2024, 3000, 3, 600),
      season(2025, 2500, 2.5, 700),
    ];
    const r = toDisplayResult(
      { ...years[2]!, yield: { ...years[2]!.yield, kgPerHa: { p10: 2100, p50: 2500, p90: 2900 } } },
      years,
      10,
    );
    expect(r.yield.kgRai.p50).toBeCloseTo(400);
    expect(r.yield.fieldTonnes).toBeCloseTo(4);
    expect(r.yield.saltLossPct).toBeCloseTo(24);
    expect(r.water.availableM3Rai).toBeCloseTo(1120);
    expect(r.water.availableRange.lo).toBeGreaterThan(800);
    expect(r.ghg.co2eTRai).toBeCloseTo(0.4);
    expect(r.ghg.ch4KgRai).toBeCloseTo(16);
    expect(r.ghg.awdSavingTRai).toBeCloseTo(0.16);
    expect(r.salinity.confidence.level).toBe('low');
    expect(r.nYears).toBe(3);
  });
  it('year series sorted', () => {
    expect(
      toYearSeries([season(2025, 1000, 1, 1), season(2023, 2000, 1, 1)]).map((p) => p.year),
    ).toEqual([2023, 2025]);
  });
});

describe('bottom sheet snaps', () => {
  it('nearest / cycle / flick', () => {
    expect(nearestSnap(0.3)).toBe(0.25);
    expect(nearestSnap(0.8)).toBe(0.9);
    expect(nextSnap(0.9)).toBe(0.25);
    expect(releaseSnap(0.25, 0.3, -1)).toBe(0.5);
    expect(releaseSnap(0.5, 0.45, 1)).toBe(0.25);
    expect(releaseSnap(0.5, 0.85, 0.1)).toBe(0.9);
  });

  it('defaults to 25% on new analysis and keeps the user snap otherwise (SPEC §5.5)', () => {
    expect(DEFAULT_SNAP).toBe(0.25);
    // new polygon → loading resets; the result arriving does not auto-expand
    expect(snapForStatus(0.9, 'loading')).toBe(0.25);
    expect(snapForStatus(0.25, 'success')).toBe(0.25);
    // user dragged up while the result was showing; a later error/success keeps it
    expect(snapForStatus(0.5, 'success')).toBe(0.5);
    expect(snapForStatus(0.9, 'error')).toBe(0.9);
  });
});

describe('parseCreatedField', () => {
  const field = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'x',
    vertices: [],
    area_rai: 1,
    province_code: null,
    district_code: null,
    subdistrict_code: null,
    is_demo: false,
    created_at: '2026-10-10T00:00:00Z',
  };
  it('accepts the { field } envelope and a bare Field', () => {
    expect(parseCreatedField({ field, practices_saved: true })?.id).toBe(field.id);
    expect(parseCreatedField(field)?.id).toBe(field.id);
    expect(parseCreatedField({ ok: false })).toBeNull();
    expect(parseCreatedField(null)).toBeNull();
  });
});
