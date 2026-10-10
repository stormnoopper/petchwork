'use client';
import { createContext, useContext } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';

/** The MapLibre map owned by FieldDrawer; null until the style has loaded. */
export const MapContext = createContext<MaplibreMap | null>(null);

export function useMap(): MaplibreMap | null {
  return useContext(MapContext);
}
