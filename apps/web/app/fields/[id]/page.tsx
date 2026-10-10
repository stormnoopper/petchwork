import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, MapPin } from 'lucide-react';
import { ScenarioId } from '@rice/contracts';
import { MODEL_VERSION } from '@rice/model';
import { buttonVariants } from '@/components/ui/button';
import { DataFooter, SourcesList } from '@/components/results/DataFooter';
import { GhgCard, SalinityCard, WaterCard, YieldCard } from '@/components/results/ResultCards';
import { YearlyChartsLazy } from '@/components/results/YearlyChartsLazy';
import { PolygonThumb } from '@/components/results/report/PolygonThumb';
import { ReportActions } from '@/components/results/report/ReportActions';
import { ReportTabs } from '@/components/results/report/ReportTabs';
import { buildAttribution } from '@/lib/api/attribution';
import { fmt, formatNumber, formatThaiDate } from '@/lib/display/fmt';
import { locationLabel } from '@/lib/display/location';
import { formatRaiNganWa, raiToM2 } from '@/lib/units';
import { cn } from '@/lib/utils';
import th from '@/messages/th.json';
import { loadFieldReport, type ReportData } from './load';

export const dynamic = 'force-dynamic';

const t = th.fields.report;
const tp = th.results.practices;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = await loadFieldReport(id);
  if (r.kind !== 'ok') return { title: th.fields.notFound.title, robots: { index: false } };
  return {
    title: fmt(t.metaTitle, { name: r.data.field.name }),
    robots: { index: r.data.field.is_demo, follow: false },
  };
}

export default async function FieldReportPage({ params }: Props) {
  const { id } = await params;
  const r = await loadFieldReport(id);
  if (r.kind === 'notFound') notFound();
  if (r.kind === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p role="alert" className="text-base">
          {t.loadError}
        </p>
      </div>
    );
  }
  const d = r.data;
  const areaLabel = formatRaiNganWa(raiToM2(d.field.area_rai));

  return (
    <div
      className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 print:max-w-none print:gap-3 print:p-0"
      data-report
    >
      <style>{`@page { size: A4; margin: 10mm; } @media print { html, body { background: #fff; } [data-report] { zoom: 0.8; } }`}</style>
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          {d.field.is_demo ? (
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-100 px-3 py-0.5 text-sm font-semibold text-amber-900">
                {t.demoBadge}
              </span>
              <span className="text-sm text-muted-foreground">{t.demoNote}</span>
            </p>
          ) : null}
          <h1 className="text-2xl font-bold break-words sm:text-3xl">{d.field.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted-foreground">
            {d.profile ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-4" aria-hidden />
                {locationLabel(d.profile)}
              </span>
            ) : null}
            <span>{fmt(th.results.area, { area: areaLabel })}</span>
            <span className="flex items-center gap-1">
              <Clock className="size-4" aria-hidden />
              {fmt(t.createdAt, { date: formatThaiDate(d.field.created_at) })}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link
            href="/map"
            className={cn(buttonVariants({ variant: 'ghost' }), 'h-11 px-3 text-base')}
          >
            <ArrowLeft className="size-5" aria-hidden />
            {t.back}
          </Link>
          <ReportActions title={fmt(t.shareTitle, { name: d.field.name })} />
        </div>
      </header>

      <ReportTabs
        panels={{
          overview: <Overview d={d} areaLabel={areaLabel} />,
          forecast: <Forecast d={d} />,
          alternatives: <Alternatives />,
        }}
      />
    </div>
  );
}

function Overview({ d, areaLabel }: { d: ReportData; areaLabel: string }) {
  const res = d.result;
  return (
    <div className="flex flex-col gap-4 print:gap-2">
      <div className="grid gap-4 lg:grid-cols-[300px_1fr] print:grid-cols-[240px_1fr] print:gap-2">
        <div className="flex flex-col gap-4 print:gap-2">
          <section
            aria-label={t.polygonTitle}
            className="flex flex-col gap-2 rounded-xl border p-4 print:p-2"
          >
            <h3 className="text-base font-semibold">{t.polygonTitle}</h3>
            <PolygonThumb
              vertices={d.field.vertices}
              areaLabel={areaLabel}
              salinityClass={res?.display.salinity.class ?? null}
            />
            <p className="text-base">{areaLabel}</p>
          </section>
          <PracticesSummary d={d} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 print:gap-2">
          {res ? (
            <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
              <WaterCard r={res.display.water} />
              <YieldCard r={res.display.yield} />
              <GhgCard r={res.display.ghg} waterRegime={d.practices.waterRegime} />
              <SalinityCard r={res.display.salinity} />
            </div>
          ) : (
            <p role="status" className="rounded-xl border bg-muted p-4 text-base">
              {d.issue ? t[d.issue] : t.noProfile}
            </p>
          )}
          {d.profile ? <SourcesList profile={d.profile} /> : null}
        </div>
      </div>
      {d.profile ? (
        <DataFooter
          profile={d.profile}
          attribution={buildAttribution(d.profile.data_versions)}
          modelVersion={res?.display.modelVersion ?? MODEL_VERSION}
        />
      ) : (
        <p className="text-sm font-medium">{th.results.disclaimer}</p>
      )}
    </div>
  );
}

function PracticesSummary({ d }: { d: ReportData }) {
  const p = d.practices;
  const rows: [string, string][] = [
    [tp.variety, tp.varieties[p.variety]],
    [tp.season, tp.seasons[p.season]],
    [tp.establishment, tp.establishments[p.establishment]],
    [tp.waterSource, tp.waterSources[p.waterSource]],
    [tp.waterRegime, tp.waterRegimes[p.waterRegime]],
    [tp.nKgPerRai, formatNumber(p.nKgPerRai, 1)],
    [tp.organicTPerRai, formatNumber(p.organicTPerRai, 1)],
  ];
  if (p.strawBurn) rows.push([tp.strawBurn, '✓']);
  return (
    <section
      aria-label={t.practicesTitle}
      className="flex flex-col gap-2 rounded-xl border p-4 print:p-2"
    >
      <h3 className="text-base font-semibold">{t.practicesTitle}</h3>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-base">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Phase2Badge() {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-3 py-0.5 text-sm font-semibold text-amber-900">
      {t.phase2}
    </span>
  );
}

function Forecast({ d }: { d: ReportData }) {
  const res = d.result;
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <Phase2Badge />
      <p className="text-base">{t.forecastBody}</p>
      {res ? (
        <>
          <h3 className="text-base font-semibold">{th.results.chart.title}</h3>
          <YearlyChartsLazy
            data={res.series}
            band={{ lo: res.display.yield.kgRai.p10, hi: res.display.yield.kgRai.p90 }}
          />
        </>
      ) : null}
      <p className="text-sm font-medium">{th.results.disclaimer}</p>
    </div>
  );
}

function Alternatives() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <Phase2Badge />
      <p className="text-base">{t.alternativesBody}</p>
      <ul className="flex flex-col gap-2">
        {ScenarioId.options.map((s) => (
          <li key={s} className="flex min-h-11 items-center rounded-lg bg-muted px-3 text-base">
            {t.scenarios[s]}
          </li>
        ))}
      </ul>
    </div>
  );
}
