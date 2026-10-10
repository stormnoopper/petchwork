import { describe, expect, it } from 'vitest';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { MVT_LAYERS, type MvtLayer } from '@rice/contracts';
import thMap from '@/messages/th.map.json';
import {
  GEOLOGY_COLORS,
  GW_COLORS,
  IRRIGATION_COLOR,
  LEGEND,
  SALINE_COLORS,
  WATER_COLOR,
  availabilityFromCoverage,
  geologyColor,
  groundwaterColor,
  fillColorExpr,
  isMahaSarakham,
  lineColorExpr,
  outline,
  rgbaCss,
  pruneEnabled,
  salineColor,
  soilGroupColor,
  tileUrl,
  toggleLayer,
  visibleLayers,
} from './layerStyles';

describe('visibleLayers (LDD placeholder, SPEC §12)', () => {
  it('hides both LDD layers by default', () => {
    expect(visibleLayers()).toEqual(['groundwater', 'geology', 'irrigation', 'water_bodies']);
  });
  it('shows each LDD layer only when its data exists', () => {
    expect(visibleLayers({ soil: true, saline: false })).toEqual([
      'soil_units',
      'groundwater',
      'geology',
      'irrigation',
      'water_bodies',
    ]);
    expect(visibleLayers({ soil: false, saline: true })).toContain('saline_soil');
    expect(visibleLayers({ soil: true, saline: true })).toEqual([...MVT_LAYERS]);
  });
  it('prunes enabled layers that are no longer offered', () => {
    expect(pruneEnabled(['saline_soil', 'geology'], { soil: false, saline: false })).toEqual([
      'geology',
    ]);
    expect(pruneEnabled(['saline_soil', 'geology'], { soil: false, saline: true })).toEqual([
      'saline_soil',
      'geology',
    ]);
  });
  it('maps profile.coverage to availability, missing → none', () => {
    expect(availabilityFromCoverage(undefined)).toEqual({ soil: false, saline: false });
    expect(availabilityFromCoverage({ has_ldd_soil: true, has_ldd_saline: false })).toEqual({
      soil: true,
      saline: false,
    });
  });
});

describe('toggleLayer', () => {
  it('adds/removes and keeps contract order', () => {
    expect(toggleLayer([], 'water_bodies')).toEqual(['water_bodies']);
    expect(toggleLayer(['water_bodies'], 'groundwater')).toEqual(['groundwater', 'water_bodies']);
    expect(toggleLayer(['groundwater', 'water_bodies'], 'groundwater')).toEqual(['water_bodies']);
  });
});

describe('colour ramps', () => {
  it('saline yellow→red by salinity_level; none/unknown transparent', () => {
    expect(salineColor('low')).toEqual(SALINE_COLORS.low);
    expect(salineColor('very_high')).toEqual(SALINE_COLORS.very_high);
    expect(salineColor('none')[3]).toBe(0);
    expect(salineColor(undefined)[3]).toBe(0);
    // red channel never decreases / green decreases along the ramp
    const ramp = (['low', 'moderate', 'high', 'very_high'] as const).map((k) => SALINE_COLORS[k]);
    for (let i = 1; i < ramp.length; i++) expect(ramp[i]![1]).toBeLessThan(ramp[i - 1]![1]);
  });

  it('groundwater by EC thresholds 0.75 / 2 dS/m', () => {
    expect(groundwaterColor(0.3)).toEqual(GW_COLORS.fresh);
    expect(groundwaterColor(0.75)).toEqual(GW_COLORS.fresh);
    expect(groundwaterColor(0.76)).toEqual(GW_COLORS.brackish);
    expect(groundwaterColor(2)).toEqual(GW_COLORS.brackish);
    expect(groundwaterColor(2.01)).toEqual(GW_COLORS.saline);
    expect(groundwaterColor('3.5')).toEqual(GW_COLORS.saline); // numeric may arrive as string
    expect(groundwaterColor(null)).toEqual(GW_COLORS.unknown);
    expect(groundwaterColor('n/a')).toEqual(GW_COLORS.unknown);
  });

  it('geology highlights Maha Sarakham (flag or KTms code)', () => {
    expect(isMahaSarakham({ is_maha_sarakham: true })).toBe(true);
    expect(isMahaSarakham({ unit_code: 'KTms' })).toBe(true);
    expect(isMahaSarakham({ unit_code: ' ktms-1 ' })).toBe(true);
    expect(isMahaSarakham({ unit_code: 'Kkk', is_maha_sarakham: false })).toBe(false);
    expect(isMahaSarakham(undefined)).toBe(false);
    expect(geologyColor({ unit_code: 'KTms' })).toEqual(GEOLOGY_COLORS.ktms);
    expect(geologyColor({ unit_code: 'Qa' })).toEqual(GEOLOGY_COLORS.other);
  });

  it('soil group colours are deterministic', () => {
    expect(soilGroupColor('17')).toEqual(soilGroupColor('17'));
    expect(soilGroupColor(null)[3]).toBeLessThan(100);
  });

  it('outline keeps transparent fills invisible', () => {
    expect(outline([1, 2, 3, 0])[3]).toBe(0);
    expect(outline([1, 2, 3, 50])).toEqual([1, 2, 3, 220]);
  });
});

describe('labels & URLs', () => {
  it('every contract layer has a Thai name and legend texts', () => {
    const legend = thMap.layers.legend as Record<string, string>;
    for (const l of MVT_LAYERS) {
      expect(thMap.layers.names[l]).toBeTruthy();
      for (const row of LEGEND[l]) expect(legend[row.key]).toBeTruthy();
    }
  });
  it('tile URL template matches /api/tiles/{layer}/{z}/{x}/{y}', () => {
    expect(tileUrl('saline_soil')).toBe('/api/tiles/saline_soil/{z}/{x}/{y}');
    // MapLibre fetches from a worker → absolute URL
    expect(tileUrl('geology', 'http://localhost:3000')).toBe(
      'http://localhost:3000/api/tiles/geology/{z}/{x}/{y}',
    );
  });
});

// ------------------------------------------------------------------ MapLibre expressions
// Evaluated with MapLibre's own style-spec engine and compared with the JS ramp helpers,
// so the map and the legend / tests can never drift apart.

type Rgba = [number, number, number, number];

function evalColor(expr: unknown, properties: Record<string, unknown>): Rgba {
  if (typeof expr === 'string') return parseCss(expr);
  const compiled = createExpression(expr, {
    type: 'color',
    'property-type': 'data-driven',
    expression: { interpolated: false, parameters: ['zoom', 'feature'] },
    transition: false,
  } as never);
  if (compiled.result !== 'success') throw new Error(JSON.stringify(compiled.value));
  const c = compiled.value.evaluate({ zoom: 10 }, { type: 3, properties } as never) as {
    r: number;
    g: number;
    b: number;
    a: number;
  };
  // style-spec colours are premultiplied 0–1 floats
  if (c.a === 0) return [0, 0, 0, 0];
  return [
    Math.round((c.r / c.a) * 255),
    Math.round((c.g / c.a) * 255),
    Math.round((c.b / c.a) * 255),
    Math.round(c.a * 255),
  ];
}

function parseCss(css: string): Rgba {
  const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(css);
  if (!m) throw new Error(css);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Math.round(Number(m[4]) * 255)];
}

const close = (a: Rgba, b: Rgba) => {
  if (b[3] === 0) return expect(a[3]).toBe(0);
  a.forEach((v, i) => expect(Math.abs(v - b[i]!)).toBeLessThanOrEqual(1));
};

describe('MapLibre colour expressions match the JS ramps', () => {
  it('rgbaCss converts 0–255 alpha', () => {
    expect(rgbaCss([1, 2, 3, 255])).toBe('rgba(1, 2, 3, 1)');
    expect(rgbaCss([0, 0, 0, 0])).toBe('rgba(0, 0, 0, 0)');
  });

  const cases: [MvtLayer, Record<string, unknown>, Rgba][] = [
    ['saline_soil', { salinity_level: 'low' }, salineColor('low')],
    ['saline_soil', { salinity_level: 'very_high' }, salineColor('very_high')],
    ['saline_soil', { salinity_level: 'none' }, salineColor('none')],
    ['saline_soil', {}, salineColor(undefined)],
    ['groundwater', { ec_dsm: 0.3 }, groundwaterColor(0.3)],
    ['groundwater', { ec_dsm: 0.75 }, groundwaterColor(0.75)],
    ['groundwater', { ec_dsm: 0.76 }, groundwaterColor(0.76)],
    ['groundwater', { ec_dsm: 2 }, groundwaterColor(2)],
    ['groundwater', { ec_dsm: 2.01 }, groundwaterColor(2.01)],
    ['groundwater', { ec_dsm: '3.5' }, groundwaterColor('3.5')],
    ['groundwater', { ec_dsm: 'n/a' }, groundwaterColor('n/a')],
    ['groundwater', {}, groundwaterColor(null)],
    ['geology', { is_maha_sarakham: true }, geologyColor({ is_maha_sarakham: true })],
    ['geology', { is_maha_sarakham: 't' }, geologyColor({ is_maha_sarakham: 't' })],
    ['geology', { unit_code: 'KTms' }, geologyColor({ unit_code: 'KTms' })],
    ['geology', { unit_code: ' ktms-1 ' }, geologyColor({ unit_code: ' ktms-1 ' })],
    ['geology', { unit_code: 'Qa' }, geologyColor({ unit_code: 'Qa' })],
    ['geology', { unit_code: 'Kkk', is_maha_sarakham: false }, GEOLOGY_COLORS.other as never],
    ['geology', { unit_code: 'Qa-KTms' }, geologyColor({ unit_code: 'Qa-KTms' })],
    ['soil_units', { soil_group: '17' }, soilGroupColor('17')],
    ['soil_units', { soil_group: 4 }, soilGroupColor(4)],
    ['soil_units', {}, soilGroupColor(null)],
    ['irrigation', {}, IRRIGATION_COLOR],
    ['water_bodies', {}, WATER_COLOR],
  ];

  it.each(cases)('%s %j', (layer, props, expected) => {
    close(evalColor(fillColorExpr(layer), props), [...expected] as Rgba);
    close(evalColor(lineColorExpr(layer), props), outline([...expected] as Rgba));
  });
});
