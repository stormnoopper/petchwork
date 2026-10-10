import { describe, expect, it } from 'vitest';
import { MVT_LAYERS } from '@rice/contracts';
import thMap from '@/messages/th.map.json';
import {
  GEOLOGY_COLORS,
  GW_COLORS,
  LEGEND,
  SALINE_COLORS,
  availabilityFromCoverage,
  geologyColor,
  groundwaterColor,
  isMahaSarakham,
  outline,
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
  });
});
