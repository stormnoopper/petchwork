import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { DATA_LAYERS_BEFORE_ID, IMAGERY, basemapId, buildBasemapStyle } from './basemap';

describe('basemap (D-030)', () => {
  it('defaults to Esri; NEXT_PUBLIC_BASEMAP=eox switches to Sentinel-2 cloudless', () => {
    expect(basemapId(undefined)).toBe('esri');
    expect(basemapId('')).toBe('esri');
    expect(basemapId('nope')).toBe('esri');
    expect(basemapId(' EOX ')).toBe('eox');
  });

  it.each(['esri', 'eox'] as const)('%s style is valid and needs no key', (id) => {
    const style = buildBasemapStyle(id);
    expect(validateStyleMin(style)).toEqual([]);
    const src = style.sources.imagery as { tiles: string[]; attribution: string };
    expect(src.tiles).toEqual(IMAGERY[id].tiles);
    expect(src.attribution).toBeTruthy();
    expect(JSON.stringify(style)).not.toMatch(/key=|token=/i);
  });

  it('labels sit above imagery; data overlays go below the labels', () => {
    const ids = buildBasemapStyle('esri').layers.map((l) => l.id);
    expect(ids.indexOf('imagery')).toBeLessThan(ids.indexOf(DATA_LAYERS_BEFORE_ID));
    expect(ids).toContain('labels-places');
  });

  it('Esri attribution text', () => {
    expect(IMAGERY.esri.attribution).toBe(
      'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    );
  });
});
