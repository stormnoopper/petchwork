'use client';
import { LocateFixed, RotateCcw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mapMessages as m } from './messages';

type Props = {
  count: number;
  locating: boolean;
  onUndo: () => void;
  onReset: () => void;
  onLocate: () => void;
};

const big = 'h-12 min-w-12 gap-2 rounded-full px-4 text-base shadow-lg shadow-black/30 [&_svg:not([class*=size-])]:size-5';

/** Floating bottom-right controls (≥ 44px touch targets, ≥ 8px apart — SPEC §5.5). */
export function MapControls({ count, locating, onUndo, onReset, onLocate }: Props) {
  return (
    <div className="pointer-events-auto flex flex-col items-end gap-3">
      <Button type="button" variant="outline" className={big} onClick={onLocate} disabled={locating}>
        <LocateFixed aria-hidden />
        {locating ? m.locating : m.myLocation}
      </Button>
      <div className="flex gap-3">
        <Button type="button" variant="outline" className={big} onClick={onUndo} disabled={count === 0}>
          <Undo2 aria-hidden />
          {m.undo}
        </Button>
        <Button type="button" variant="outline" className={big} onClick={onReset} disabled={count === 0}>
          <RotateCcw aria-hidden />
          {m.reset}
        </Button>
      </div>
    </div>
  );
}
