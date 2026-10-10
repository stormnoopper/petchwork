'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { Check, Layers, Loader2, X } from 'lucide-react';
import type { MvtLayer } from '@rice/contracts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DeckOverlayHandle } from './deckOverlay';
import {
  LEGEND,
  NO_LDD,
  cssColor,
  pruneEnabled,
  toggleLayer,
  visibleLayers,
  type LayerAvailability,
} from './layerStyles';
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
 * SPEC §5.3 map layer switcher. All layers off by default; deck.gl is imported lazily the
 * first time a layer is enabled. Must render inside <APIProvider> (uses `useMap()`).
 */
export function LayerToggle({ lddAvailable = NO_LDD, className }: Props) {
  const [open, setOpen] = useState(false);
  const [rawEnabled, setEnabled] = useState<MvtLayer[]>([]);
  const offered = useMemo(() => visibleLayers(lddAvailable), [lddAvailable]);
  // LDD may disappear after a new analyze → never render a layer that is no longer offered.
  const enabled = useMemo(() => pruneEnabled(rawEnabled, lddAvailable), [rawEnabled, lddAvailable]);
  const load = useDeckOverlay(enabled);
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

/** Creates the deck.gl GoogleMapsOverlay on first use (lazy import) and keeps its layers in sync. */
function useDeckOverlay(enabled: MvtLayer[]): LoadState {
  const map = useMap();
  const [state, setState] = useState<LoadState>('idle');
  const handle = useRef<DeckOverlayHandle | null>(null);
  const latest = useRef(enabled);
  const started = useRef(false);

  useEffect(() => {
    latest.current = enabled;
    if (handle.current) {
      handle.current.update(enabled);
      return;
    }
    if (enabled.length === 0) {
      setState((s) => (s === 'loading' ? 'idle' : s));
      return;
    }
    if (!map || started.current) return;
    started.current = true;
    setState('loading');
    let cancelled = false;
    import('./deckOverlay')
      .then(({ createOverlay }) => {
        if (cancelled) return;
        handle.current = createOverlay(map, latest.current);
        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        started.current = false; // allow a retry on the next toggle
        setState('error');
      });
    return () => {
      cancelled = true;
      if (!handle.current) started.current = false;
    };
  }, [map, enabled]);

  useEffect(
    () => () => {
      handle.current?.destroy();
      handle.current = null;
    },
    [],
  );

  return state;
}
