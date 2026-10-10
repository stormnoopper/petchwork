'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ResultPanel } from '@/components/results/ResultPanel';
import { RESTORE_PARAM, takeDraft, type FieldDraft } from '@/lib/display/draft';
import { cn } from '@/lib/utils';
import { availabilityFromCoverage } from './layerStyles';
import type { FieldDrawResult } from './types';
import { useAnalyze } from './useAnalyze';
import { mapMessages as m } from './messages';

function MapLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 bg-muted text-base text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {m.loadingMap}
    </div>
  );
}

// Google Maps must never render on the server (SPEC §5.5) — dynamic ssr:false lives in a client component.
const FieldDrawer = dynamic(() => import('./FieldDrawer'), { ssr: false, loading: MapLoading });

/**
 * /map layout (SPEC §5.5): ResultPanel is a single responsive node — bottom sheet (portrait < lg),
 * right panel (landscape < lg) or 400 px left aside (≥ lg). The map keeps the rest.
 */
export function MapScreen() {
  const [field, setField] = useState<FieldDrawResult | null>(null);
  const analysis = useAnalyze(field?.valid ? field.polygon : null);

  // Post-login draft restore (/map?restore=1). FieldDrawer reads initialVertices once on mount,
  // so it is mounted only after the draft has been checked.
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<FieldDraft | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(RESTORE_PARAM) === '1') {
      setDraft(takeDraft());
      url.searchParams.delete(RESTORE_PARAM);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    setReady(true);
  }, []);

  const coverage =
    analysis.status === 'success' && analysis.data.ok ? analysis.data.profile.coverage : null;
  const sheetVisible = analysis.status !== 'idle';

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      {ready ? (
        <ResultPanel
          field={field}
          analysis={analysis}
          initialPractices={draft?.practices}
          restored={draft != null}
        />
      ) : null}
      <main
        className={cn(
          'relative min-w-0 flex-1',
          // keep the map (and its bottom controls) above the 25 % sheet snap
          sheetVisible && 'max-lg:portrait:pb-[25dvh]',
        )}
      >
        {ready ? (
          <FieldDrawer
            onPolygonChange={setField}
            initialVertices={draft?.vertices}
            layerAvailability={availabilityFromCoverage(coverage)}
          />
        ) : (
          <MapLoading />
        )}
      </main>
    </div>
  );
}
