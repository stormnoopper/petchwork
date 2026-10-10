'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map,
  Polygon,
  Polyline,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { MAX_VERTICES_PHASE1, type LatLng } from '@rice/contracts';
import { Button } from '@/components/ui/button';
import { areaM2 } from '@/lib/geo/area';
import { toGeoJSON } from '@/lib/geo/geojson';
import { prepareInitialVertices, sortCounterClockwise, vertexCentroid } from '@/lib/geo/order';
import { validatePolygon } from '@/lib/geo/validate';
import { cn } from '@/lib/utils';
import { AreaBadge } from './AreaBadge';
import { LayerToggle, type LayerAvailability } from './LayerToggle';
import { MapControls } from './MapControls';
import { MissingApiKey } from './MissingApiKey';
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
const DEFAULT_ZOOM = 6;
const GPS_ZOOM_INITIAL = 16;
const GPS_ZOOM_BUTTON = 17;
const DEBOUNCE_MS = 400;
const N = MAX_VERTICES_PHASE1;

const STROKE = '#4ade80';
const STROKE_ERROR = '#ef4444';
const RESTORE_SINGLE_ZOOM = 17;
const RESTORE_MAX_ZOOM = 18;

export default function FieldDrawer(props: FieldDrawerProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return (
      <div className={cn('relative h-full w-full', props.className)}>
        <MissingApiKey />
      </div>
    );
  }
  return (
    <APIProvider apiKey={apiKey} libraries={['geometry', 'marker']} language="th" region="TH">
      <DrawerMap {...props} />
    </APIProvider>
  );
}

type GeoStatus = 'idle' | 'locating' | 'denied' | 'unsupported';

function DrawerMap({
  onPolygonChange,
  status,
  className,
  initialVertices,
  layerAvailability,
}: FieldDrawerProps) {
  const map = useMap();
  // Loads google.maps.geometry so areaM2() can use spherical.computeArea; re-run memo when ready.
  const geometry = useMapsLibrary('geometry');

  // initialVertices is read once (restore); later prop changes are ignored on purpose.
  const [restored] = useState(() => prepareInitialVertices(initialVertices));
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
          map.panTo(p);
          map.setZoom(zoom);
        },
        () => setGeo(silent ? 'idle' : 'denied'),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    },
    [map],
  );

  // Initial attempt: zoom to the user if they allow it, otherwise stay on the whole country.
  // When restoring a draft, fit to the restored vertices instead.
  const triedInitialGps = useRef(false);
  useEffect(() => {
    if (!map || triedInitialGps.current) return;
    triedInitialGps.current = true;
    if (restored.length === 0) {
      locate(GPS_ZOOM_INITIAL, true);
      return;
    }
    if (restored.length === 1) {
      map.setCenter(restored[0]!);
      map.setZoom(RESTORE_SINGLE_ZOOM);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    restored.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 80);
    google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > RESTORE_MAX_ZOOM) map.setZoom(RESTORE_MAX_ZOOM);
    });
  }, [map, locate, restored]);

  // ---------------------------------------------------------------- editing
  const handleMapClick = useCallback((ev: MapMouseEvent) => {
    const p = ev.detail.latLng;
    if (!p) return;
    setVertices((prev) => {
      if (prev.length >= N) return prev;
      const next = [...prev, { lat: p.lat, lng: p.lng }];
      return next.length === N ? sortCounterClockwise(next) : next;
    });
  }, []);

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
    void geometry; // dependency: recompute with computeArea once the library is loaded
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
  }, [settled, confirmed, geometry]);

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
  const path = useMemo(() => vertices.map((v) => ({ lat: v.lat, lng: v.lng })), [vertices]);

  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      <Map
        className="h-full w-full"
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'}
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={DEFAULT_ZOOM}
        mapTypeId="hybrid"
        gestureHandling="greedy"
        clickableIcons={false}
        streetViewControl={false}
        fullscreenControl={false}
        mapTypeControl={false}
        cameraControl={false}
        onClick={handleMapClick}
      >
        {count >= 2 && !complete && (
          <Polyline
            path={path}
            strokeColor={STROKE}
            strokeOpacity={1}
            strokeWeight={3}
            clickable={false}
          />
        )}
        {complete && (
          <Polygon
            paths={path}
            strokeColor={blocking ? STROKE_ERROR : STROKE}
            strokeOpacity={1}
            strokeWeight={3}
            fillColor={blocking ? STROKE_ERROR : STROKE}
            fillOpacity={0.25}
            clickable={false}
          />
        )}
        {vertices.map((v, i) => (
          <VertexMarker key={i} index={i} position={v} onMove={handleMove} />
        ))}
        {showSettled && (
          <AreaBadge position={vertexCentroid(settled)} areaM2={result.areaM2} invalid={blocking} />
        )}
        {userPos && (
          <AdvancedMarker
            position={userPos}
            clickable={false}
            zIndex={1}
            anchorLeft="-50%"
            anchorTop="-50%"
            title={m.youAreHere}
          >
            <div className="pointer-events-none size-5 rounded-full border-[3px] border-white bg-blue-600 shadow-md" />
          </AdvancedMarker>
        )}
      </Map>

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

      {/* bottom: messages (left) + controls (right) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
