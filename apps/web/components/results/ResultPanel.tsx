'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, MapPin, RotateCcw } from 'lucide-react';
import type { AnalyzeResponse, FieldProfile, Practices, SeasonResult } from '@rice/contracts';
import { runSeasonEnsemble } from '@rice/model';
import { Button } from '@/components/ui/button';
import type { FieldDrawResult } from '@/components/map/types';
import type { AnalyzeState } from '@/components/map/useAnalyze';
import { fmt } from '@/lib/display/fmt';
import { locationLabel } from '@/lib/display/location';
import { defaultPracticesFor } from '@/lib/display/practices';
import { toDisplayResult, toYearSeries } from '@/lib/display/results';
import { formatRaiNganWa } from '@/lib/units';
import th from '@/messages/th.json';
import { ResponsivePanel } from './BottomSheet';
import { DataFooter, SourcesList } from './DataFooter';
import { PracticesForm } from './PracticesForm';
import { GhgCard, ResultSummary, SalinityCard, WaterCard, YieldCard } from './ResultCards';
import { SaveFieldButton } from './SaveFieldButton';
import { YearlyChartsLazy } from './YearlyChartsLazy';
import type { Snap } from './sheet';

const t = th.results;

type OkResponse = Extract<AnalyzeResponse, { ok: true }>;
type ErrResponse = Extract<AnalyzeResponse, { ok: false }>;

export type ResultPanelProps = {
  field: FieldDrawResult | null;
  analysis: AnalyzeState & { retry: () => void };
  /** practices restored from a post-login draft (marks the form as user-edited) */
  initialPractices?: Practices;
  /** show the "draft restored" notice */
  restored?: boolean;
};

/** Client-side recompute (SPEC §5.1 step 10): same profile + weather, new practices — no request. */
function useRecompute(data: OkResponse | null, practices: Practices) {
  return useMemo(() => {
    if (!data) return null;
    let quick: SeasonResult = data.quick;
    let years: SeasonResult[] = [];
    let failed = false;
    try {
      const r = runSeasonEnsemble({
        profile: data.profile,
        practices,
        weather: data.weather,
        year: data.quick.year,
        includeDaily: false,
      });
      quick = r.quick;
      years = r.years;
    } catch {
      failed = true;
    }
    return {
      display: toDisplayResult(quick, years, data.profile.area_rai),
      series: toYearSeries(years),
      failed,
    };
  }, [data, practices]);
}

export function ResultPanel({
  field,
  analysis,
  initialPractices,
  restored = false,
}: ResultPanelProps) {
  const data = analysis.status === 'success' && analysis.data.ok ? analysis.data : null;
  const profile = data?.profile ?? null;

  const [practices, setPractices] = useState<Practices>(
    () => initialPractices ?? defaultPracticesFor(null),
  );
  const [touched, setTouched] = useState(Boolean(initialPractices));
  const [seenProfile, setSeenProfile] = useState<FieldProfile | null>(null);
  if (profile && profile !== seenProfile) {
    // new analysis → apply region defaults unless the user already edited the form
    setSeenProfile(profile);
    if (!touched) setPractices(defaultPracticesFor(profile));
  }

  const [snap, setSnap] = useState<Snap>(0.25);
  const [lastStatus, setLastStatus] = useState(analysis.status);
  if (analysis.status !== lastStatus) {
    setLastStatus(analysis.status);
    if (analysis.status === 'loading') setSnap(0.25);
    else if (analysis.status === 'success' && lastStatus === 'loading') setSnap(0.5);
  }

  const computed = useRecompute(data, practices);
  const hidden = analysis.status === 'idle';

  return (
    <ResponsivePanel label={t.panelTitle} hidden={hidden} snap={snap} onSnapChange={setSnap}>
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{t.panelTitle}</h2>
          {computed ? <ResultSummary r={computed.display} /> : null}
          {profile ? (
            <p className="flex items-start gap-1 text-base text-muted-foreground">
              <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
              <span>
                {locationLabel(profile)} · {fmt(t.area, { area: formatRaiNganWa(profile.area_m2) })}
              </span>
            </p>
          ) : field && field.areaM2 > 0 ? (
            <p className="text-base text-muted-foreground">
              {fmt(t.area, { area: formatRaiNganWa(field.areaM2) })}
            </p>
          ) : null}
        </header>

        {restored ? (
          <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-base">
            {t.save.restored}
          </p>
        ) : null}

        {analysis.status === 'idle' ? (
          <p className="text-base text-muted-foreground">{t.placeholder}</p>
        ) : null}
        {analysis.status === 'loading' ? <ResultSkeleton /> : null}
        {analysis.status === 'error' ? (
          <ErrorBox message={t.errors[analysis.error]} onRetry={analysis.retry} />
        ) : null}
        {analysis.status === 'success' && !analysis.data.ok ? (
          <DomainError data={analysis.data} onRetry={analysis.retry} />
        ) : null}

        {data && computed ? (
          <>
            {computed.failed ? (
              <p role="status" className="text-sm text-destructive">
                {t.errors.compute}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {fmt(t.seasonYear, {
                season: t.practices.seasons[computed.display.season],
                year: computed.display.year,
                n: computed.display.nYears,
              })}
              {touched ? ` · ${t.recomputed}` : ''}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 max-lg:landscape:grid-cols-1 lg:grid-cols-1">
              <WaterCard r={computed.display.water} />
              <YieldCard r={computed.display.yield} />
              <GhgCard r={computed.display.ghg} waterRegime={practices.waterRegime} />
              <SalinityCard r={computed.display.salinity} />
            </div>
            <PracticesForm
              value={practices}
              onChange={(p) => {
                setTouched(true);
                setPractices(p);
              }}
              onReset={() => {
                setTouched(false);
                setPractices(defaultPracticesFor(profile));
              }}
            />
            {field?.valid && field.polygon ? (
              <SaveFieldButton
                vertices={field.vertices}
                polygon={field.polygon}
                practices={practices}
                defaultName={fmt(t.save.defaultName, {
                  place:
                    data.profile.admin.subdistrict_name_th ?? data.profile.admin.province_name_th,
                })}
              />
            ) : null}
            <section aria-label={t.chart.title} className="flex flex-col gap-2">
              <h3 className="text-base font-semibold">{t.chart.title}</h3>
              <YearlyChartsLazy
                data={computed.series}
                band={{
                  lo: computed.display.yield.kgRai.p10,
                  hi: computed.display.yield.kgRai.p90,
                }}
              />
            </section>
            <SourcesList profile={data.profile} />
            <DataFooter
              profile={data.profile}
              attribution={data.attribution}
              modelVersion={computed.display.modelVersion}
            />
          </>
        ) : null}
      </div>
    </ResponsivePanel>
  );
}

function ResultSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{t.loading}</span>
      <div className="grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <p className="text-base text-muted-foreground" aria-hidden>
        {t.loading}
      </p>
      {[0, 1].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

function ErrorBox({
  message,
  onRetry,
  children,
}: {
  message: string;
  onRetry?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
    >
      <p className="flex items-start gap-2 text-base">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <span>{message}</span>
      </p>
      {children}
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 self-start px-4 text-base"
          onClick={onRetry}
        >
          <RotateCcw className="size-4" aria-hidden />
          {t.errors.retry}
        </Button>
      ) : null}
    </div>
  );
}

function DomainError({ data, onRetry }: { data: ErrResponse; onRetry: () => void }) {
  const message = data.message_th || t.errors[data.error];
  const provinces = data.enabled_provinces ?? [];
  return (
    <ErrorBox message={message} onRetry={data.error === 'INTERNAL' ? onRetry : undefined}>
      {data.error === 'PROVINCE_NOT_ENABLED' && provinces.length > 0 ? (
        <div>
          <p className="text-base font-medium">{t.errors.enabledProvinces}</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {provinces.map((p) => (
              <li key={p.code} className="rounded-full border bg-background px-3 py-1 text-base">
                {p.name_th}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ErrorBox>
  );
}
