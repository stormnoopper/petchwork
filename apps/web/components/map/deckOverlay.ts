'use client';
/**
 * deck.gl glue — imported ONLY via dynamic `import('./deckOverlay')` from MvtOverlay
 * the first time a layer is switched on, so deck.gl stays out of the initial /map bundle.
 */
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { MVTLayer } from '@deck.gl/geo-layers';
import type { MvtLayer } from '@rice/contracts';
import {
  IRRIGATION_COLOR,
  WATER_COLOR,
  geologyColor,
  groundwaterColor,
  outline,
  salineColor,
  soilGroupColor,
  tileUrl,
  type RGBA,
} from './layerStyles';

type Props = Record<string, unknown>;
type Feature = { properties?: Props };

const fillOf: Record<MvtLayer, (f: Feature) => RGBA> = {
  saline_soil: (f) => salineColor(f.properties?.salinity_level),
  soil_units: (f) => soilGroupColor(f.properties?.soil_group),
  groundwater: (f) => groundwaterColor(f.properties?.ec_dsm),
  geology: (f) => geologyColor(f.properties),
  irrigation: () => IRRIGATION_COLOR,
  water_bodies: () => WATER_COLOR,
};

// Accessors are module-level constants so deck.gl does not re-evaluate attributes on every toggle.
const lineOf = Object.fromEntries(
  (Object.keys(fillOf) as MvtLayer[]).map((l) => [l, (f: Feature) => outline(fillOf[l](f))]),
) as Record<MvtLayer, (f: Feature) => RGBA>;

const noop = () => {};

export function buildLayers(enabled: readonly MvtLayer[]) {
  return enabled.map(
    (layer) =>
      new MVTLayer<Props>({
        id: `mvt-${layer}`,
        data: tileUrl(layer),
        minZoom: 0,
        maxZoom: 14, // server simplifies per zoom; overzoom beyond 14
        pickable: false, // never steal taps from vertex placement
        filled: true,
        stroked: true,
        getFillColor: fillOf[layer] as never,
        getLineColor: lineOf[layer] as never,
        lineWidthUnits: 'pixels',
        getLineWidth: layer === 'water_bodies' ? 2 : 1,
        pointRadiusUnits: 'pixels',
        getPointRadius: 4,
        // 204 → empty buffer → no features (handled by MVTLoader). 4xx/5xx/route missing: just skip the tile.
        onTileError: noop,
        // parse on the main thread: loaders.gl workers would otherwise be fetched from a CDN
        loadOptions: { core: { worker: false } },
      }),
  );
}

export function createOverlay(map: google.maps.Map, enabled: readonly MvtLayer[]) {
  // interleaved:false — works with raster/hybrid basemaps and keeps markers & clicks on top.
  const overlay = new GoogleMapsOverlay({ interleaved: false, layers: buildLayers(enabled) });
  overlay.setMap(map);
  return {
    update: (next: readonly MvtLayer[]) => overlay.setProps({ layers: buildLayers(next) }),
    destroy: () => {
      overlay.setMap(null);
      overlay.finalize();
    },
  };
}

export type DeckOverlayHandle = ReturnType<typeof createOverlay>;
