import type { ReactNode } from 'react';
import { Droplets, Factory, Sprout, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmt, formatAdaptive, formatNumber, formatRange } from '@/lib/display/fmt';
import type { DisplayResult } from '@/lib/display/results';
import th from '@/messages/th.json';
import { ConfidenceBadge } from './ConfidenceBadge';

const t = th.results;

function ResultCard({
  icon,
  title,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground break-inside-avoid',
        className,
      )}
      aria-label={title}
    >
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <span
          className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden
        >
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function BigValue({ value, unit }: { value: string; unit: string }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-3xl font-bold tabular-nums leading-tight">{value}</span>
      <span className="text-base text-muted-foreground">{unit}</span>
    </p>
  );
}

function RangeLine({
  lo,
  hi,
  unit,
  format,
}: {
  lo: number;
  hi: number;
  unit: string;
  format?: (v: number) => string;
}) {
  return (
    <p className="text-base text-muted-foreground">
      {fmt(t.range, { range: formatRange(lo, hi, format), unit })}
    </p>
  );
}

const int = (v: number) => formatNumber(v, 0);

export function WaterCard({ r, className }: { r: DisplayResult['water']; className?: string }) {
  return (
    <ResultCard icon={<Droplets className="size-5" />} title={t.water.title} className={className}>
      <p className="text-base">{t.water.available}</p>
      <BigValue value={int(r.availableM3Rai)} unit={t.water.unitM3} />
      <RangeLine
        lo={r.availableRange.lo}
        hi={r.availableRange.hi}
        unit={t.water.unitM3}
        format={int}
      />
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-base">
        <dt>{t.water.need}</dt>
        <dd className="text-right font-semibold tabular-nums">
          {int(r.needM3Rai)} {t.water.unitM3}
        </dd>
        <dt>{t.water.deficitDays}</dt>
        <dd className="text-right font-semibold tabular-nums">
          {int(r.deficitDays)} {t.water.unitDays}
        </dd>
      </dl>
      {r.needRange.hi <= 0 ? (
        <p className="text-sm text-muted-foreground">{t.water.noNeed}</p>
      ) : null}
      <ConfidenceBadge tag={r.confidence} />
    </ResultCard>
  );
}

export function YieldCard({ r, className }: { r: DisplayResult['yield']; className?: string }) {
  return (
    <ResultCard icon={<Sprout className="size-5" />} title={t.yield.title} className={className}>
      <BigValue value={int(r.kgRai.p50)} unit={t.yield.unit} />
      <RangeLine lo={r.kgRai.p10} hi={r.kgRai.p90} unit={t.yield.unit} format={int} />
      {r.fieldTonnes != null ? (
        <p className="text-base">{fmt(t.yield.field, { t: formatAdaptive(r.fieldTonnes) })}</p>
      ) : null}
      {r.saltLossPct >= 1 ? (
        <p className="text-base">
          {fmt(t.yield.saltLoss, { pct: formatNumber(r.saltLossPct, 0) })}
        </p>
      ) : null}
      <ConfidenceBadge tag={r.confidence} />
    </ResultCard>
  );
}

export function GhgCard({
  r,
  waterRegime,
  className,
}: {
  r: DisplayResult['ghg'];
  waterRegime?: 'continuous' | 'awd' | 'rainfed';
  className?: string;
}) {
  return (
    <ResultCard icon={<Factory className="size-5" />} title={t.ghg.title} className={className}>
      <BigValue value={formatAdaptive(r.co2eTRai)} unit={`${t.ghg.unit} ${t.ghg.perSeason}`} />
      <RangeLine lo={r.co2eRange.lo} hi={r.co2eRange.hi} unit={t.ghg.unit} />
      <ul className="flex flex-col gap-0.5 text-base">
        <li data-testid="ch4">{fmt(t.ghg.ch4, { v: formatAdaptive(r.ch4KgRai) })}</li>
        <li>{fmt(t.ghg.n2o, { v: formatAdaptive(r.n2oKgRai) })}</li>
        {r.fieldCo2eT != null ? (
          <li>{fmt(t.ghg.field, { t: formatAdaptive(r.fieldCo2eT) })}</li>
        ) : null}
      </ul>
      {r.awdSavingTRai > 0 ? (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-base font-medium text-foreground">
          {fmt(t.ghg.awdSaving, { v: formatAdaptive(r.awdSavingTRai) })}
        </p>
      ) : waterRegime === 'awd' ? (
        <p className="text-base text-muted-foreground">{t.ghg.awdAlready}</p>
      ) : waterRegime === 'rainfed' ? (
        <p className="text-base text-muted-foreground">{t.ghg.rainfedNote}</p>
      ) : null}
      <ConfidenceBadge tag={r.confidence} />
    </ResultCard>
  );
}

const CLASS_TONE: Record<DisplayResult['salinity']['class'], string> = {
  non_saline: 'bg-emerald-50 text-emerald-900 border-emerald-700/30',
  slight: 'bg-yellow-50 text-yellow-900 border-yellow-700/30',
  moderate: 'bg-orange-50 text-orange-900 border-orange-700/30',
  severe: 'bg-red-50 text-red-900 border-red-700/30',
};

export const SALINITY_FILL: Record<DisplayResult['salinity']['class'], string> = {
  non_saline: '#16a34a',
  slight: '#ca8a04',
  moderate: '#ea580c',
  severe: '#dc2626',
};

export function SalinityCard({
  r,
  className,
}: {
  r: DisplayResult['salinity'];
  className?: string;
}) {
  const recs = r.recommendations.length > 0 ? r.recommendations : (['none'] as const);
  return (
    <ResultCard icon={<Waves className="size-5" />} title={t.salinity.title} className={className}>
      <p className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full border px-3 py-1 text-base font-semibold',
            CLASS_TONE[r.class],
          )}
        >
          {t.salinity.classes[r.class]}
        </span>
        <span className="text-xl font-bold tabular-nums">
          {fmt(t.salinity.ece, { v: formatAdaptive(r.eceDsm.p50) })}
        </span>
      </p>
      <RangeLine lo={r.eceDsm.p10} hi={r.eceDsm.p90} unit={t.salinity.unit} />
      <p className="text-base text-muted-foreground">
        {t.salinity.origins[r.origin]} · {fmt(t.salinity.base, { v: formatAdaptive(r.baseEceDsm) })}
      </p>
      <div>
        <p className="text-base font-medium">{t.salinity.recommendationsTitle}</p>
        <ul className="mt-1 list-disc pl-5 text-base">
          {recs.map((k) => (
            <li key={k}>{t.salinity.recommendations[k]}</li>
          ))}
        </ul>
      </div>
      <ConfidenceBadge tag={r.confidence} />
    </ResultCard>
  );
}

/** Compact "4 numbers" row for the 25% bottom-sheet snap. */
export function ResultSummary({ r }: { r: DisplayResult }) {
  const items = [
    {
      k: t.summary.water,
      v: `${int(r.water.availableM3Rai)}`,
      u: t.water.unitM3,
      c: r.water.confidence,
    },
    { k: t.summary.yield, v: int(r.yield.kgRai.p50), u: t.yield.unit, c: r.yield.confidence },
    { k: t.summary.ghg, v: formatAdaptive(r.ghg.co2eTRai), u: t.ghg.unit, c: r.ghg.confidence },
    {
      k: t.summary.salinity,
      v: t.salinity.classes[r.salinity.class],
      u: `ECe ${formatAdaptive(r.salinity.eceDsm.p50)}`,
      c: r.salinity.confidence,
    },
  ];
  return (
    <dl className="grid grid-cols-4 gap-1.5">
      {items.map((i) => (
        <div
          key={i.k}
          className="flex min-w-0 flex-col items-start rounded-lg bg-muted px-2 py-1.5"
        >
          <dt className="text-sm text-neutral-700">{i.k}</dt>
          <dd className="w-full truncate text-base font-bold tabular-nums leading-tight">{i.v}</dd>
          <dd className="w-full truncate text-xs text-neutral-700">{i.u}</dd>
          <dd>
            <ConfidenceBadge
              tag={i.c}
              showSource={false}
              compact
              className="[&>span]:px-1.5 [&>span]:text-xs"
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}
