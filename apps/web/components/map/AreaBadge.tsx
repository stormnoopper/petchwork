'use client';
import { AdvancedMarker } from '@vis.gl/react-google-maps';
import type { LatLng } from '@rice/contracts';
import { formatRaiNganWa } from '@/lib/units';
import { cn } from '@/lib/utils';
import { mapMessages as m } from './messages';

type Props = { position: LatLng; areaM2: number; invalid?: boolean };

/** Floating area label at the polygon centroid, e.g. "12 ไร่ 2 งาน 35 ตร.ว." */
export function AreaBadge({ position, areaM2, invalid }: Props) {
  return (
    <AdvancedMarker position={position} clickable={false} zIndex={10} anchorLeft="-50%" anchorTop="-50%">
      <div
        className={cn(
          'pointer-events-none rounded-full px-3 py-1.5 text-center text-base font-semibold whitespace-nowrap shadow-lg shadow-black/30',
          invalid ? 'bg-red-600 text-white' : 'bg-white/95 text-green-900',
        )}
        aria-label={`${m.areaLabel} ${formatRaiNganWa(areaM2)}`}
      >
        {formatRaiNganWa(areaM2)}
      </div>
    </AdvancedMarker>
  );
}
