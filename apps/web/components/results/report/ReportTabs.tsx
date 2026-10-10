'use client';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import th from '@/messages/th.json';

const KEYS = ['overview', 'forecast', 'alternatives'] as const;
type Key = (typeof KEYS)[number];

/**
 * Mobile: tabs ภาพรวม / พยากรณ์ / ทางเลือก. ≥ lg: every panel visible as a dashboard grid
 * (the tab list is hidden). Print: overview only (A4 one page).
 */
export function ReportTabs({ panels }: { panels: Record<Key, ReactNode> }) {
  const uid = useId();
  const [active, setActive] = useState<Key>('overview');
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = KEYS.indexOf(active);
    let next: Key | null = null;
    if (e.key === 'ArrowRight') next = KEYS[(i + 1) % KEYS.length]!;
    if (e.key === 'ArrowLeft') next = KEYS[(i + KEYS.length - 1) % KEYS.length]!;
    if (e.key === 'Home') next = KEYS[0];
    if (e.key === 'End') next = KEYS[KEYS.length - 1]!;
    if (next) {
      e.preventDefault();
      setActive(next);
      document.getElementById(`${uid}-tab-${next}`)?.focus();
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={th.fields.report.tabs.overview}
        className="sticky top-16 z-10 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1 lg:hidden print:hidden"
      >
        {KEYS.map((k) => (
          <button
            key={k}
            id={`${uid}-tab-${k}`}
            type="button"
            role="tab"
            aria-selected={active === k}
            aria-controls={`${uid}-panel-${k}`}
            tabIndex={active === k ? 0 : -1}
            onClick={() => setActive(k)}
            onKeyDown={onKey}
            className={cn(
              'min-h-11 rounded-lg px-2 text-base font-medium',
              active === k
                ? 'bg-background shadow-sm'
                : 'text-foreground/80 hover:bg-background/60',
            )}
          >
            {th.fields.report.tabs[k]}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {KEYS.map((k) => (
          <section
            key={k}
            id={`${uid}-panel-${k}`}
            role="tabpanel"
            aria-labelledby={`${uid}-tab-${k}`}
            className={cn(
              'min-w-0',
              active === k ? 'block' : 'hidden lg:block',
              k === 'overview' ? 'lg:col-span-2 print:block' : 'print:hidden',
            )}
          >
            <h2 className="sr-only lg:not-sr-only lg:mb-3 lg:text-xl lg:font-bold print:sr-only">
              {th.fields.report.tabs[k]}
            </h2>
            {panels[k]}
          </section>
        ))}
      </div>
    </div>
  );
}
