'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Marker } from 'maplibre-gl';
import type { LatLng } from '@rice/contracts';
import { useMap } from './mapContext';

type Props = {
  position: LatLng;
  children: ReactNode;
  draggable?: boolean;
  zIndex?: number;
  /** let taps fall through to the map (labels / badges) */
  passThrough?: boolean;
  title?: string;
  onDrag?: (p: LatLng) => void;
  onDragEnd?: (p: LatLng) => void;
};

/** React wrapper around a MapLibre `Marker` (centre-anchored); children are portalled into its element. */
export function MapMarker({
  position,
  children,
  draggable = false,
  zIndex,
  passThrough = false,
  title,
  onDrag,
  onDragEnd,
}: Props) {
  const map = useMap();
  const [el] = useState(() => document.createElement('div'));
  const marker = useRef<Marker | null>(null);
  const handlers = useRef({ onDrag, onDragEnd });
  useEffect(() => {
    handlers.current = { onDrag, onDragEnd };
  }, [onDrag, onDragEnd]);

  useEffect(() => {
    if (!map) return;
    const m = new Marker({ element: el, anchor: 'center', draggable })
      .setLngLat([position.lng, position.lat])
      .addTo(map);
    const read = (): LatLng => {
      const p = m.getLngLat();
      return { lat: p.lat, lng: p.lng };
    };
    m.on('drag', () => handlers.current.onDrag?.(read()));
    m.on('dragend', () => handlers.current.onDragEnd?.(read()));
    marker.current = m;
    return () => {
      m.remove();
      marker.current = null;
    };
    // position is synced by the effect below; recreate only when the map / drag mode changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, el, draggable]);

  useEffect(() => {
    marker.current?.setLngLat([position.lng, position.lat]);
  }, [position.lat, position.lng]);

  useEffect(() => {
    el.style.zIndex = zIndex == null ? '' : String(zIndex);
    el.style.pointerEvents = passThrough ? 'none' : '';
    if (title) el.title = title;
    else el.removeAttribute('title');
  }, [el, zIndex, passThrough, title]);

  return createPortal(children, el);
}
