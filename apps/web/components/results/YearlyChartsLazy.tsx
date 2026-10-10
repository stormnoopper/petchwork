'use client';
import dynamic from 'next/dynamic';
import th from '@/messages/th.json';
import type { YearlyChartsProps } from './YearlyCharts';

/** Recharts stays out of the initial bundle and off the server (SPEC §5.5). */
export const YearlyChartsLazy = dynamic<YearlyChartsProps>(() => import('./YearlyCharts'), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center rounded-lg bg-muted text-base text-muted-foreground">
      {th.results.chart.loading}
    </div>
  ),
});
