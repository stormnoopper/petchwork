'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AttributionControl,
  LngLatBounds,
  Map as MaplibreMap,
  type GeoJSONSource,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { MAX_VERTICES_PHASE1, type LatLng } from '@rice/contracts';
import { Button } from '@/components/ui/button';
import { areaM2 } from '@/lib/geo/area';
import { toGeoJSON } from '@/lib/geo/geojson';
import { prepareInitialVertices, sortCounterClockwise, vertexCentroid } from '@/lib/geo/order';
import { validatePolygon } from '@/lib/geo/validate';
import { cn } from '@/lib/utils';
import { AreaBadge } from './AreaBadge';
import { buildBasemapStyle } from './basemap';
import { LayerToggle, type LayerAvailability } from './LayerToggle';
import { MapControls } from './MapControls';
import { MapContext } from './mapContext';
import { MapMarker } from './MapMarker';
import { fmt, mapMessages as m } from './messages';
import type { FieldDrawResult } from './types';
import { useDebouncedValue } from './useDebouncedValue';
import { VertexMarker } from './VertexMarker';

export type { FieldDrawResult } from './types';
export type { LayerAvailability } from './LayerToggle';

export type FieldDrawerProps = {
  /** Called after every debounced (400 ms) recompute of vertices / area / validation. */
  onPolygonChange?: (result: FieldDrawResult) => void;
  /** Extra status line rendered in the bottom message stack (e.g. analyze progress). */
  status?: ReactNode;
  className?: string;
  /**
   * Restore a previous drawing (e.g. post-login draft). Read once on mount: up to 4 vertices are
   * placed (CCW-sorted when 4), the map fits to them, and onPolygonChange fires as usual.
   */
  initialVertices?: LatLng[];
  /** LDD layer availability for LayerToggle — pass `availabilityFromCoverage(profile.coverage)`.
   *  Default: LDD layers hidden (LDD placeholder, SPEC §12). */
  layerAvailability?: LayerAvailability;
};

const DEFAULT_CENTER: LatLng = { lat: 13.0, lng: 101.0 };
const DEFAULT_ZOOM = 5.5;
const MAX_ZOOM = 20;
const GPS_ZOOM_INITIAL = 16;
const GPS_ZOOM_BUTTON = 17;
const DEBOUNCE_MS = 400;
const N = MAX_VERTICES_PHASE1;

const STROKE = '#4ade80';
const STROKE_ERROR = '#ef4444';
const RESTORE_SINGLE_ZOOM = 17;
const RESTORE_MAX_ZOOM = 18;
// 80 px all round (D-008) plus room for the instruction bar / layer button (top) and the
// undo · reset · locate stack (bottom) so restored corners are never hidden under controls
const RESTORE_PADDING = { top: 140, bottom: 170, left: 80, right: 80 };

const DRAW_SOURCE = 'draw';
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

type GeoStatus = 'idle' | 'locating' | 'denied' | 'unsupported';

/** Polyline (2–3 points) or closed polygon (4 points) as GeoJSON for the `draw` source. */
function drawingFeatures(vertices: readonly LatLng[], error: boolean): GeoJSON.FeatureCollection {
  const ring = vertices.map((v) => [v.lng, v.lat]);
  if (vertices.length === N) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { error },
          geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]!]] },
        },
      ],
    };
  }
  if (vertices.length >= 2) {
    return {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { error }, geometry: { type: 'LineString', coordinates: ring } },
      ],
    };
  }
  return EMPTY_FC;
}

/** Owns the MapLibre map (imagery basemap, no API key — D-030). */
function useMaplibre(container: React.RefObject<HTMLDivElement | null>, restored: LatLng[]) {
  const [map, setMap] = useState<MaplibreMap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let instance: MaplibreMap;
    try {
      instance = new MaplibreMap({
        container: el,
        style: buildBasemapStyle(),
        center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
        zoom: DEFAULT_ZOOM,
        maxZoom: MAX_ZOOM,
        maxPitch: 0,
        // one-finger pan + pinch zoom; no rotate / pitch (farmers lose north otherwise)
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: false,
        locale: { 'AttributionControl.ToggleAttribution': 'ที่มาของแผนที่' },
      });
    } catch (err) {
      console.error('[map] MapLibre init failed', err);
      setFailed(true);
      return;
    }
    instance.touchZoomRotate.disableRotation();
    instance.keyboard.disableRotation();
    // phones: collapsible "i" (starts collapsed below); wider screens: always-visible text line
    const compact = window.matchMedia('(max-width: 639px)').matches;
    instance.addControl(new AttributionControl({ compact }), 'bottom-left');
    // tile failures (offline, 404 outside coverage) are expected noise — don't spam the console
    instance.on('error', (e: { error?: Error; sourceId?: string }) => {
      if (e.sourceId) return;
      console.error('[map]', e.error);
    });

    if (restored.length === 1) {
      instance.jumpTo({ center: [restored[0]!.lng, restored[0]!.lat], zoom: RESTORE_SINGLE_ZOOM });
    } else if (restored.length > 1) {
      const b = new LngLatBounds();
      restored.forEach((p) => b.extend([p.lng, p.lat]));
      instance.fitBounds(b, { padding: RESTORE_PADDING, maxZoom: RESTORE_MAX_ZOOM, duration: 0 });
    }

    instance.on('load', () => {
      // MapLibre opens the compact attribution initially; start collapsed on phones ("i" toggles it)
      if (compact) {
        el.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      }
      instance.addSource(DRAW_SOURCE, { type: 'geojson', data: EMPTY_FC });
      const color = ['case', ['get', 'error'], STROKE_ERROR, STROKE] as never;
      instance.addLayer({
        id: 'draw-fill',
        type: 'fill',
        source: DRAW_SOURCE,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': color, 'fill-opacity': 0.25 },
      });
      instance.addLayer({
        id: 'draw-line',
        type: 'line',
        source: DRAW_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': color, 'line-width': 3 },
      });
      // dev/e2e handle (queryRenderedFeatures in Playwright); never exposed in production builds
      if (process.env.NODE_ENV !== 'production') {
        (window as unknown as { __riceMap?: MaplibreMap }).__riceMap = instance;
      }
      setMap(instance);
    });

    return () => {
      setMap(null);
      instance.remove();
    };
    // restored is read once on mount (initialVertices contract)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  return { map, failed };
}

export default function FieldDrawer({
  onPolygonChange,
  status,
  className,
  initialVertices,
  layerAvailability,
}: FieldDrawerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // initialVertices is read once (restore); later prop changes are ignored on purpose.
  const [restored] = useState(() => prepareInitialVertices(initialVertices));
  const { map, failed } = useMaplibre(containerRef, restored);

  const [vertices, setVertices] = useState<LatLng[]>(restored);
  const [confirmed, setConfirmed] = useState(false);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [geo, setGeo] = useState<GeoStatus>('idle');

  // ---------------------------------------------------------------- GPS
  const locate = useCallback(
    (zoom: number, silent: boolean) => {
      if (!map) return;
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        if (!silent) setGeo('unsupported');
        return;
      }
      setGeo('locating');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserPos(p);
          setGeo('idle');
          map.flyTo({ center: [p.lng, p.lat], zoom });
        },
        () => setGeo(silent ? 'idle' : 'denied'),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    },
    [map],
  );

  // Initial attempt: zoom to the user if they allow it, otherwise stay on the whole country.
  // A restored draft is already framed by useMaplibre (fitBounds) — no GPS jump then.
  const triedInitialGps = useRef(false);
  useEffect(() => {
    if (!map || triedInitialGps.current) return;
    triedInitialGps.current = true;
    if (restored.length === 0) locate(GPS_ZOOM_INITIAL, true);
  }, [map, locate, restored]);

  // ---------------------------------------------------------------- editing
  useEffect(() => {
    if (!map) return;
    const onClick = (ev: MapMouseEvent) => {
      // taps on a marker (or right after dragging one) must not add a vertex
      const target = ev.originalEvent.target;
      if (target instanceof Element && target.closest('.maplibregl-marker')) return;
      const p = ev.lngLat;
      setVertices((prev) => {
        if (prev.length >= N) return prev;
        const next = [...prev, { lat: p.lat, lng: p.lng }];
        return next.length === N ? sortCounterClockwise(next) : next;
      });
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map]);

  const handleMove = useCallback((index: number, pos: LatLng, final: boolean) => {
    setVertices((prev) => {
      const next = prev.map((v, i) => (i === index ? pos : v));
      return final && next.length === N ? sortCounterClockwise(next) : next;
    });
  }, []);

  const undo = useCallback(() => {
    setVertices((prev) => prev.slice(0, -1));
    setConfirmed(false);
  }, []);

  const reset = useCallback(() => {
    setVertices([]);
    setConfirmed(false);
  }, []);

  // ---------------------------------------------------------------- debounced recompute
  const settled = useDebouncedValue(vertices, DEBOUNCE_MS);

  const result = useMemo<FieldDrawResult>(() => {
    const area = areaM2(settled);
    const v = validatePolygon(settled, area);
    const complete = settled.length === N;
    return {
      vertices: settled,
      polygon: complete ? toGeoJSON(settled) : null,
      areaM2: area,
      valid: complete && v.ok && (!v.needsConfirm || confirmed),
      warnings: v.warnings,
      errors: v.errors,
      needsConfirm: v.needsConfirm && !confirmed,
    };
  }, [settled, confirmed]);

  const cbRef = useRef(onPolygonChange);
  useEffect(() => {
    cbRef.current = onPolygonChange;
  }, [onPolygonChange]);
  useEffect(() => {
    cbRef.current?.(result);
  }, [result]);

  // ---------------------------------------------------------------- render
  const count = vertices.length;
  const complete = count === N;
  const showSettled = complete && settled.length === N;
  const blocking = showSettled && result.errors.includes('selfIntersecting');

  // polyline from point 2, closed polygon at 4 (red while self-intersecting)
  useEffect(() => {
    const src = map?.getSource<GeoJSONSource>(DRAW_SOURCE);
    src?.setData(drawingFeatures(vertices, blocking));
  }, [map, vertices, blocking]);

  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      {/* wrapper: MapLibre sets `position: relative` on the container itself; `isolate` keeps
          marker z-indexes inside the map so they never paint over the panels / layer dialog */}
      <div className="absolute inset-0 isolate">
        <div ref={containerRef} className="h-full w-full" data-testid="map-canvas" />
      </div>
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted p-6 text-center text-base">
          <p role="alert">{m.mapLoadError}</p>
        </div>
      )}

      <MapContext.Provider value={map}>
        {vertices.map((v, i) => (
          <VertexMarker key={i} index={i} position={v} onMove={handleMove} />
        ))}
        {showSettled && (
          <AreaBadge position={vertexCentroid(settled)} areaM2={result.areaM2} invalid={blocking} />
        )}
        {userPos && (
          <MapMarker position={userPos} zIndex={1} passThrough title={m.youAreHere}>
            <div className="pointer-events-none size-5 rounded-full border-[3px] border-white bg-blue-600 shadow-md" />
          </MapMarker>
        )}

        {/* top: instruction bar + layer toggle (right, below the bar so it never covers it) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex justify-center">
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-black/75 py-2 pr-2 pl-4 text-base text-white shadow-lg"
            >
              <span className="min-w-0">{complete ? m.instructionDone : m.instruction}</span>
              <span
                data-testid="vertex-counter"
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums',
                  complete ? 'bg-green-600' : 'bg-white/20',
                )}
              >
                {fmt(m.counter, { n: count })}
              </span>
            </div>
          </div>
          <div className="flex justify-end">
            <LayerToggle lddAvailable={layerAvailability} />
          </div>
        </div>

        {/* bottom: messages (left) + controls (right); bottom padding leaves room for the attribution */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-3 pb-[max(2.75rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex max-w-md min-w-0 flex-1 flex-col gap-2">
            {geo === 'denied' && <Notice tone="warn">{m.geoDenied}</Notice>}
            {geo === 'unsupported' && <Notice tone="warn">{m.geoUnsupported}</Notice>}
            {showSettled && (
              <ValidationNotices
                result={result}
                onConfirm={() => setConfirmed(true)}
                confirmed={confirmed}
              />
            )}
            {status}
          </div>
          <MapControls
            count={count}
            locating={geo === 'locating'}
            onUndo={undo}
            onReset={reset}
            onLocate={() => locate(GPS_ZOOM_BUTTON, false)}
          />
        </div>
      </MapContext.Provider>
    </div>
  );
}

function ValidationNotices({
  result,
  confirmed,
  onConfirm,
}: {
  result: FieldDrawResult;
  confirmed: boolean;
  onConfirm: () => void;
}) {
  const errors = result.errors.filter((k) => k !== 'incomplete');
  const areaWarn = result.warnings.some((k) => k === 'areaTooSmall' || k === 'areaTooLarge');
  return (
    <>
      {errors.map((k) => (
        <Notice key={k} tone="error">
          {m.validation[k]}
        </Notice>
      ))}
      {result.warnings.map((k) => (
        <Notice key={k} tone="warn">
          {m.validation[k]}
        </Notice>
      ))}
      {areaWarn &&
        errors.length === 0 &&
        (confirmed ? (
          <Notice tone="ok">{m.confirmed}</Notice>
        ) : (
          <Button
            type="button"
            className="h-12 self-start rounded-full px-5 text-base shadow-lg"
            onClick={onConfirm}
          >
            {m.confirmArea}
          </Button>
        ))}
    </>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: 'error' | 'warn' | 'ok' | 'info';
  children: ReactNode;
}) {
  const Icon = tone === 'error' ? XCircle : tone === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg px-3 py-2 text-base shadow-lg',
        tone === 'error' && 'bg-red-600 text-white',
        tone === 'warn' && 'bg-amber-300 text-amber-950',
        tone === 'ok' && 'bg-green-700 text-white',
        tone === 'info' && 'bg-white/95 text-foreground',
      )}
    >
      {tone !== 'info' && <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />}
      <span className="min-w-0">{children}</span>
    </div>
  );
}
