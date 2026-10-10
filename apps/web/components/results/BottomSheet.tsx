'use client';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import th from '@/messages/th.json';
import { releaseSnap, nextSnap, type Snap } from './sheet';

const t = th.results.sheet;

/**
 * Non-modal responsive container (SPEC §5.5) — one DOM node, layout switched by media queries so
 * state (practices, scroll) survives rotation:
 * - portrait < lg: bottom sheet, snaps 25 / 50 / 90 % (tablet portrait capped at 60 %), no backdrop
 *   → the map above stays interactive;
 * - landscape < lg: right panel, 45 % wide (360 px on tablets, i.e. landscape with height ≥ 600 px);
 * - ≥ lg: left aside 400 px.
 * Custom instead of components/ui/drawer (Base UI Drawer) because that primitive is a portal popup
 * that cannot morph into an in-flow side panel without remounting.
 */
export function ResponsivePanel({
  label,
  hidden,
  snap,
  onSnapChange,
  children,
}: {
  label: string;
  /** hide on < lg (nothing to show yet); desktop always shows the aside */
  hidden: boolean;
  snap: Snap;
  onSnapChange: (s: Snap) => void;
  children: ReactNode;
}) {
  const drag = useRef<{ y0: number; t0: number; h0: number; moved: boolean } | null>(null);
  const [dragPx, setDragPx] = useState<number | null>(null);

  const viewportH = () => (typeof window === 'undefined' ? 800 : window.innerHeight);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, t0: performance.now(), h0: snap * viewportH(), moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (Math.abs(dy) > 6) d.moved = true;
    if (d.moved) setDragPx(Math.min(0.92 * viewportH(), Math.max(0.15 * viewportH(), d.h0 - dy)));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragPx(null);
    if (!d) return;
    if (!d.moved) {
      onSnapChange(nextSnap(snap));
      return;
    }
    const dy = e.clientY - d.y0;
    const v = dy / Math.max(1, performance.now() - d.t0);
    onSnapChange(releaseSnap(snap, (d.h0 - dy) / viewportH(), v));
  };

  const style = {
    '--sheet-h': dragPx != null ? `${dragPx}px` : `${snap * 100}dvh`,
  } as CSSProperties;

  return (
    <aside
      aria-label={label}
      style={style}
      data-snap={snap}
      className={cn(
        // portrait: bottom sheet
        'fixed inset-x-0 bottom-0 z-30 flex h-(--sheet-h) flex-col rounded-t-2xl border-t bg-background shadow-[0_-8px_24px_rgba(0,0,0,0.18)] md:max-h-[60dvh]',
        dragPx == null && 'transition-[height] duration-300 ease-out',
        // landscape phone / tablet: right panel
        'max-lg:landscape:static max-lg:landscape:order-last max-lg:landscape:h-dvh max-lg:landscape:max-h-none max-lg:landscape:w-[45%] max-lg:landscape:shrink-0 max-lg:landscape:rounded-none max-lg:landscape:border-t-0 max-lg:landscape:border-l max-lg:landscape:shadow-none',
        'max-lg:[@media(orientation:landscape)_and_(min-height:600px)]:w-[360px]',
        // desktop: left aside
        'lg:static lg:order-first lg:h-dvh lg:max-h-none lg:w-[400px] lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-r lg:shadow-none',
        hidden && 'max-lg:hidden',
      )}
    >
      <button
        type="button"
        aria-label={snap === 0.9 ? t.collapse : t.expand}
        title={t.handle}
        className="flex h-11 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing max-lg:landscape:hidden lg:hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragPx(null);
        }}
      >
        <span className="h-1.5 w-12 rounded-full bg-neutral-400" aria-hidden />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-lg:landscape:pt-4 lg:pt-4">
        {children}
      </div>
    </aside>
  );
}
