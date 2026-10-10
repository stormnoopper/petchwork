'use client';
import type { LatLng } from '@rice/contracts';
import { MapMarker } from './MapMarker';
import { fmt, mapMessages as m } from './messages';

type Props = {
  index: number;
  position: LatLng;
  onMove: (index: number, pos: LatLng, final: boolean) => void;
};

/** Numbered, draggable corner marker — green circle, white number, 48px touch target. */
export function VertexMarker({ index, position, onMove }: Props) {
  const n = index + 1;
  return (
    <MapMarker
      position={position}
      draggable
      zIndex={20 + index}
      title={fmt(m.markerLabel, { n })}
      onDrag={(p) => onMove(index, p, false)}
      onDragEnd={(p) => onMove(index, p, true)}
    >
      <div
        data-vertex={n}
        className="flex size-12 cursor-grab touch-none items-center justify-center rounded-full border-[3px] border-white bg-green-700 text-xl font-bold text-white shadow-lg shadow-black/40 select-none active:cursor-grabbing"
      >
        {n}
      </div>
    </MapMarker>
  );
}
