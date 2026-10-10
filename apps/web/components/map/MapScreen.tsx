'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FieldDrawResult } from './types';
import { useAnalyze, type AnalyzeState } from './useAnalyze';
import { mapMessages as m } from './messages';

// Google Maps must never render on the server (SPEC §5.5) — dynamic ssr:false lives in a client component.
const FieldDrawer = dynamic(() => import('./FieldDrawer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center gap-2 bg-muted text-base text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {m.loadingMap}
    </div>
  ),
});

/** /map layout: full-screen map on mobile; 400px left slot + map on desktop (SPEC §5.5). */
export function MapScreen() {
  const [field, setField] = useState<FieldDrawResult | null>(null);
  const analysis = useAnalyze(field?.valid ? field.polygon : null);

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <aside
        aria-label={m.pageTitle}
        className="hidden overflow-y-auto border-r bg-background lg:flex lg:w-[400px] lg:shrink-0 lg:flex-col lg:gap-4 lg:p-4"
      >
        {/* TODO(frontend-ui): replace with <ResultPanel field={field} analysis={analysis} /> (task 1.x).
            Mobile: bottom sheet (Drawer) — see SPEC §5.5. `field` + `analysis` are the inputs. */}
        <p className="text-base text-muted-foreground">{m.panelPlaceholder}</p>
        <AnalyzeStatus analysis={analysis} />
      </aside>
      <main className="relative min-w-0 flex-1">
        <FieldDrawer
          onPolygonChange={setField}
          status={
            <div className="lg:hidden">
              <AnalyzeStatus analysis={analysis} />
            </div>
          }
        />
      </main>
    </div>
  );
}

function AnalyzeStatus({ analysis }: { analysis: AnalyzeState & { retry: () => void } }) {
  if (analysis.status === 'idle') return null;
  if (analysis.status === 'loading') {
    return (
      <div role="status" className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-base text-foreground shadow-lg">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        {m.analyze.loading}
      </div>
    );
  }
  if (analysis.status === 'error') {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-white/95 px-3 py-2 text-base text-foreground shadow-lg">
        <span className="min-w-0">{m.analyze[analysis.error]}</span>
        <Button type="button" variant="outline" className="h-11 shrink-0 px-4 text-base" onClick={analysis.retry}>
          {m.analyze.retry}
        </Button>
      </div>
    );
  }
  const d = analysis.data;
  return (
    <div role="status" className="rounded-lg bg-white/95 px-3 py-2 text-base text-foreground shadow-lg">
      {d.ok ? m.analyze.done : d.message_th}
    </div>
  );
}
