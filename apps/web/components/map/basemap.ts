import type { StyleSpecification } from 'maplibre-gl';

/**
 * Free basemap for /map (D-030) — no API key, no paid service.
 * Imagery provider is chosen by `NEXT_PUBLIC_BASEMAP=esri|eox` (default esri).
 * Pure module (no maplibre runtime import) so it is unit-testable and tree-shakes.
 */

export type BasemapId = 'esri' | 'eox';

type RasterProvider = {
  tiles: string[];
  /** highest zoom the provider really serves; MapLibre over-zooms beyond it */
  maxzoom: number;
  attribution: string;
};

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_ATTRIBUTION =
  'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export const IMAGERY: Record<BasemapId, RasterProvider> = {
  esri: {
    tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
    // z19 returns "Map data not yet available" placeholders in rural Thailand → over-zoom z18.
    maxzoom: 18,
    attribution: ESRI_ATTRIBUTION,
  },
  eox: {
    tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'],
    // Sentinel-2 is 10 m/px — nothing new past z16
    maxzoom: 16,
    attribution:
      'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)',
  },
};

/** Free Esri reference overlays (transparent PNG) so farmers can read village and road names. */
export const LABEL_OVERLAYS = [
  { id: 'labels-roads', path: 'Reference/World_Transportation', maxzoom: 19 },
  { id: 'labels-places', path: 'Reference/World_Boundaries_and_Places', maxzoom: 19 },
] as const;

/** Data overlays (MVT, LayerToggle) are inserted below this layer: imagery → data → labels → drawing. */
export const DATA_LAYERS_BEFORE_ID: string = LABEL_OVERLAYS[0].id;

export function basemapId(raw: string | undefined = process.env.NEXT_PUBLIC_BASEMAP): BasemapId {
  return raw?.trim().toLowerCase() === 'eox' ? 'eox' : 'esri';
}

/** Complete MapLibre style built in code — no external style JSON / glyphs / sprites needed. */
export function buildBasemapStyle(id: BasemapId = basemapId()): StyleSpecification {
  const imagery = IMAGERY[id];
  const style: StyleSpecification = {
    version: 8,
    sources: {
      imagery: {
        type: 'raster',
        tiles: imagery.tiles,
        tileSize: 256,
        maxzoom: imagery.maxzoom,
        attribution: imagery.attribution,
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#1f2a1f' } },
      { id: 'imagery', type: 'raster', source: 'imagery' },
    ],
  };
  for (const o of LABEL_OVERLAYS) {
    style.sources[o.id] = {
      type: 'raster',
      tiles: [`${ESRI}/${o.path}/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: o.maxzoom,
      // Esri attribution is already shown for the imagery; add it here when imagery is EOX
      ...(id === 'esri' ? {} : { attribution: 'Labels © Esri' }),
    };
    style.layers.push({ id: o.id, type: 'raster', source: o.id });
  }
  return style;
}
