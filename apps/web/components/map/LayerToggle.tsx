'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ErrorEvent, Map as MaplibreMap } from 'maplibre-gl';
import { Check, Layers, Loader2, X } from 'lucide-react';
import { MVT_LAYERS, type MvtLayer } from '@rice/contracts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DATA_LAYERS_BEFORE_ID } from './basemap';
import {
  LEGEND,
  NO_LDD,
  cssColor,
  fillColorExpr,
  lineColorExpr,
  lineWidth,
  pruneEnabled,
  tileUrl,
  toggleLayer,
  visibleLayers,
  type LayerAvailability,
} from './layerStyles';
import { useMap } from './mapContext';
import { mapMessages as m } from './messages';

export type { LayerAvailability } from './layerStyles';

type Props = {
  /** LDD data availability (from `profile.coverage.has_ldd_*`). Default: both hidden (LDD placeholder). */
  lddAvailable?: LayerAvailability;
  className?: string;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const legendText = m.layers.legend as Record<string, string>;

/**
 * SPEC §5.3 map layer switcher. All layers off by default; each layer is a native MapLibre
 * vector source (our `/api/tiles` MVT) added the first time it is switched on and hidden
 * (not removed) when switched off. Must render inside FieldDrawer's MapContext.
 */
export function LayerToggle({ lddAvailable = NO_LDD, className }: Props) {
  const [open, setOpen] = useState(false);
  const [rawEnabled, setEnabled] = useState<MvtLayer[]>([]);
  const offered = useMemo(() => visibleLayers(lddAvailable), [lddAvailable]);
  // LDD may disappear after a new analyze → never render a layer that is no longer offered.
  const enabled = useMemo(() => pruneEnabled(rawEnabled, lddAvailable), [rawEnabled, lddAvailable]);
  const load = useMvtLayers(enabled);
  const lddHidden = !lddAvailable.soil || !lddAvailable.saline;

  return (
    <div className={cn('pointer-events-auto relative flex flex-col items-end gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-controls="map-layer-panel"
        onClick={() => setOpen((o) => !o)}
        className="h-12 min-w-12 gap-2 rounded-full px-4 text-base shadow-lg shadow-black/30 [&_svg:not([class*=size-])]:size-5"
      >
        {load === 'loading' ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Layers aria-hidden />
        )}
        {m.layers.button}
        {enabled.length > 0 && (
          <span className="rounded-full bg-green-700 px-2 text-sm font-semibold text-white tabular-nums">
            {enabled.length}
          </span>
        )}
      </Button>

      {open && (
        <div
          id="map-layer-panel"
          role="dialog"
          aria-label={m.layers.title}
          className="absolute top-full right-0 z-10 mt-2 flex max-h-[min(60dvh,32rem)] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl bg-background text-foreground shadow-xl shadow-black/30"
        >
          <div className="flex items-center justify-between gap-2 border-b py-1 pr-1 pl-4">
            <h2 className="text-base font-semibold">{m.layers.title}</h2>
            <Button
              type="button"
              variant="ghost"
              className="size-11 rounded-full [&_svg:not([class*=size-])]:size-5"
              aria-label={m.layers.close}
              onClick={() => setOpen(false)}
            >
              <X aria-hidden />
            </Button>
          </div>
          <div className="overflow-y-auto overscroll-contain px-2 py-2">
            <p className="px-2 pb-2 text-sm text-muted-foreground">{m.layers.hint}</p>
            <ul className="flex flex-col gap-1">
              {offered.map((layer) => {
                const on = enabled.includes(layer);
                return (
                  <li key={layer}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() =>
                        setEnabled((prev) => toggleLayer(pruneEnabled(prev, lddAvailable), layer))
                      }
                      className={cn(
                        'flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-base outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                        on && 'font-semibold',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md border-2',
                          on
                            ? 'border-green-700 bg-green-700 text-white'
                            : 'border-muted-foreground/60',
                        )}
                        aria-hidden
                      >
                        {on && <Check className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">{m.layers.names[layer]}</span>
                      <Swatches layer={layer} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {lddHidden && (
              <p className="px-2 pt-2 text-sm text-muted-foreground">{m.layers.lddHidden}</p>
            )}
            {load === 'loading' && (
              <p role="status" className="flex items-center gap-2 px-2 pt-2 text-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {m.layers.loading}
              </p>
            )}
            {load === 'error' && (
              <p role="alert" className="px-2 pt-2 text-sm text-red-700">
                {m.layers.loadError}
              </p>
            )}
          </div>
        </div>
      )}

      {!open && enabled.length > 0 && <Legend enabled={enabled} />}
    </div>
  );
}

function Swatches({ layer }: { layer: MvtLayer }) {
  const colors = LEGEND[layer].flatMap((r) => r.colors).slice(0, 4);
  return (
    <span className="flex shrink-0 gap-0.5" aria-hidden>
      {colors.map((c, i) => (
        <span
          key={i}
          className="size-3 rounded-sm ring-1 ring-black/10"
          style={{ background: cssColor(c) }}
        />
      ))}
    </span>
  );
}

/** Compact legend for the enabled layers (shown while the panel is closed). */
function Legend({ enabled }: { enabled: MvtLayer[] }) {
  return (
    <section
      aria-label={m.layers.legendTitle}
      className="max-h-[40dvh] w-[min(16rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg bg-white/95 px-3 py-2 text-sm text-foreground shadow-lg"
    >
      {enabled.map((layer) => (
        <div key={layer} className="py-1">
          <div className="font-semibold">{m.layers.names[layer]}</div>
          <ul>
            {LEGEND[layer].map((row) => (
              <li key={row.key} className="flex items-center gap-2">
                <span className="flex shrink-0 gap-0.5" aria-hidden>
                  {row.colors.map((c, i) => (
                    <span
                      key={i}
                      className="size-3 rounded-sm ring-1 ring-black/10"
                      style={{ background: cssColor(c) }}
                    />
                  ))}
                </span>
                <span className="min-w-0">{legendText[row.key]}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

const POLYGON: unknown = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const POINT: unknown = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]];

const sourceId = (l: MvtLayer) => `mvt-${l}`;
const styleLayerIds = (l: MvtLayer) => [`mvt-${l}-fill`, `mvt-${l}-line`, `mvt-${l}-point`];

/** Adds source + fill/line/point layers for `layer`, keeping contract order below the labels. */
function addMvtLayer(map: MaplibreMap, layer: MvtLayer) {
  map.addSource(sourceId(layer), {
    type: 'vector',
    tiles: [tileUrl(layer, window.location.origin)],
    minzoom: 0,
    maxzoom: 14, // server simplifies per zoom; MapLibre over-zooms beyond 14
  });
  // next contract layer already on the map (if any) → insert below it; else below the labels
  const after = MVT_LAYERS.slice(MVT_LAYERS.indexOf(layer) + 1).find((l) => map.getSource(sourceId(l)));
  const before = after ? styleLayerIds(after)[0] : DATA_LAYERS_BEFORE_ID;
  const [fillId, lineId, pointId] = styleLayerIds(layer) as [string, string, string];
  const common = { source: sourceId(layer), 'source-layer': layer } as const;
  map.addLayer(
    {
      id: fillId,
      type: 'fill',
      ...common,
      filter: POLYGON as never,
      paint: { 'fill-color': fillColorExpr(layer) as never, 'fill-antialias': false },
    },
    before,
  );
  map.addLayer(
    {
      id: lineId,
      type: 'line',
      ...common,
      filter: ['!', POINT] as never,
      paint: { 'line-color': lineColorExpr(layer) as never, 'line-width': lineWidth(layer) },
    },
    before,
  );
  map.addLayer(
    {
      id: pointId,
      type: 'circle',
      ...common,
      filter: POINT as never,
      paint: {
        'circle-radius': 4,
        'circle-color': fillColorExpr(layer) as never,
        'circle-stroke-color': lineColorExpr(layer) as never,
        'circle-stroke-width': 1,
      },
    },
    before,
  );
}

/**
 * Keeps the native MVT layers in sync with `enabled`. 'loading' until the map is idle after a
 * change; 'error' when one of our tile requests failed (204 = empty tile, not an error).
 */
function useMvtLayers(enabled: MvtLayer[]): LoadState {
  const map = useMap();
  const [state, setState] = useState<LoadState>('idle');

  useEffect(() => {
    if (!map) return;
    for (const layer of MVT_LAYERS) {
      const on = enabled.includes(layer);
      if (on && !map.getSource(sourceId(layer))) addMvtLayer(map, layer);
      for (const id of styleLayerIds(layer)) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      }
    }
    if (enabled.length === 0) {
      setState('idle');
      return;
    }
    setState('loading');
    let failed = false;
    const onError = (e: ErrorEvent & { sourceId?: string }) => {
      if (e.sourceId?.startsWith('mvt-')) failed = true;
    };
    const onIdle = () => setState(failed ? 'error' : 'ready');
    map.on('error', onError);
    map.once('idle', onIdle);
    return () => {
      map.off('error', onError);
      map.off('idle', onIdle);
    };
  }, [map, enabled]);

  return state;
}
