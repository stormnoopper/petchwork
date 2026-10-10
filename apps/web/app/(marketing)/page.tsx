import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRightIcon,
  BrainCircuitIcon,
  BuildingIcon,
  CloudIcon,
  DatabaseIcon,
  DropletsIcon,
  FactoryIcon,
  FileBarChartIcon,
  HandshakeIcon,
  LeafIcon,
  MapPinIcon,
  PlugIcon,
  type LucideIcon,
  WavesIcon,
  WheatIcon,
  MountainIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReportPreview } from '@/components/marketing/report-preview';
import { Section } from '@/components/marketing/section';
import { formatThaiDate, getEnabledProvinces, getLatestDataUpdate } from '@/lib/data-freshness';
import { cn } from '@/lib/utils';
import { TONES, WAVE_PATH, type Tone } from '@/components/marketing/tones';
import th from '@/messages/th.json';

// SPEC §5.0: static generation, data-update date refreshed once a day.
export const revalidate = 86400;

const t = th.landing;

export const metadata: Metadata = {
  title: { absolute: th.meta.landingTitle },
  description: th.meta.landingDescription,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'th_TH',
    url: '/',
    siteName: th.marketing.brand,
    title: th.meta.landingTitle,
    description: th.meta.landingDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: th.meta.landingTitle,
    description: th.meta.landingDescription,
  },
};

const STEP_ICONS: LucideIcon[] = [MapPinIcon, BrainCircuitIcon, FileBarChartIcon];
const RESULT_ICONS: Record<string, LucideIcon> = {
  water: DropletsIcon,
  yield: WheatIcon,
  ghg: CloudIcon,
  salinity: WavesIcon,
};
const MECHANISM_ICONS: LucideIcon[] = [MountainIcon, WavesIcon];
const AGENCY_ICONS: LucideIcon[] = [BuildingIcon, HandshakeIcon, LeafIcon, PlugIcon];

const STEP_TONES: Tone[] = ['sky', 'violet', 'gold'];
const RESULT_TONES: Record<string, Tone> = {
  water: 'sky',
  yield: 'gold',
  ghg: 'teal',
  salinity: 'orange',
};
const AGENCY_TONES: Tone[] = ['green', 'violet', 'teal', 'gold'];
const SOURCE_TONES: Tone[] = ['green', 'sky', 'gold', 'orange', 'violet', 'teal'];

const PILOT_PROVINCE = 'มหาสารคาม';

/** Soft paddy-wave divider at the bottom of a coloured band. */
function Wave({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 80"
      preserveAspectRatio="none"
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full sm:h-16',
        className,
      )}
    >
      <path d={WAVE_PATH} fill="currentColor" />
    </svg>
  );
}

export default async function LandingPage() {
  const [lastUpdate, enabledProvinces] = await Promise.all([
    getLatestDataUpdate(),
    getEnabledProvinces(),
  ]);
  const provinces = enabledProvinces ?? [PILOT_PROVINCE];

  const chipItems = t.results.items.filter((r) => r.key !== 'ghg').slice(0, 3);

  return (
    <>
      {/* Hero — mobile: text → buttons → image; lg: 2 columns */}
      <section className="relative isolate overflow-hidden bg-gradient-to-br from-emerald-50 via-lime-50 to-amber-50 pb-12 dark:from-emerald-950/40 dark:via-background dark:to-amber-950/30">
        {/* decorative colour blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 -left-24 size-72 rounded-full bg-emerald-300/40 blur-3xl" />
          <div className="absolute top-10 right-[-6rem] size-80 rounded-full bg-amber-300/40 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 size-72 rounded-full bg-sky-300/30 blur-3xl" />
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-2 lg:py-20">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="h-auto bg-emerald-600 px-3 py-1 text-sm text-white">
                <MapPinIcon aria-hidden />
                {t.heroBadge}
              </Badge>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 ring-1 ring-amber-300/60">
                {t.heroEyebrow}
              </span>
            </div>
            <h1 className="text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              <span className="bg-gradient-to-r from-emerald-700 via-green-600 to-amber-600 bg-clip-text text-transparent">
                {th.marketing.brand}
              </span>{' '}
              <span className="block pt-1">{t.heroTitle}</span>
            </h1>
            <p className="text-lg text-muted-foreground sm:text-xl">{t.heroSubtitle}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/map"
                className={cn(
                  buttonVariants({ size: 'lg' }),
                  'h-12 bg-gradient-to-r from-emerald-600 to-green-700 px-6 text-lg text-white shadow-lg shadow-emerald-700/30 hover:from-emerald-700 hover:to-green-800',
                )}
              >
                {t.ctaStart}
                <ArrowRightIcon className="size-5" aria-hidden />
              </Link>
              <Link
                href="/fields/demo"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'h-12 border-amber-400 bg-white/70 px-6 text-lg text-amber-900 hover:bg-amber-50',
                )}
              >
                {t.ctaDemo}
              </Link>
            </div>
            {/* sample result chips (same example values as the result cards below) */}
            <ul className="flex flex-wrap gap-2" aria-label={t.results.exampleLabel}>
              {chipItems.map((r) => {
                const Icon = RESULT_ICONS[r.key] ?? DropletsIcon;
                const tone = TONES[RESULT_TONES[r.key] ?? 'green'];
                return (
                  <li
                    key={r.key}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium shadow-sm ring-1 ring-black/5',
                      tone.tile,
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {r.title} · {r.value}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
            <div
              aria-hidden
              className="absolute inset-4 -z-10 rotate-3 rounded-[2.5rem] bg-gradient-to-br from-amber-200 via-orange-200 to-emerald-200 opacity-70"
            />
            <div className="rounded-[2rem] bg-white/80 p-4 shadow-xl ring-1 shadow-emerald-900/10 ring-emerald-900/10 backdrop-blur dark:bg-card/80">
              <Image
                src="/hero-salinity.svg"
                alt={t.heroImageAlt}
                width={379}
                height={614}
                priority
                unoptimized
                sizes="(min-width: 1024px) 448px, 384px"
                className="h-auto w-full"
              />
            </div>
            <span className="absolute top-6 -left-2 rounded-full bg-sky-600 px-3 py-1 text-sm font-semibold text-white shadow-lg sm:-left-6">
              {t.heroChipNow}
            </span>
            <span className="absolute -right-2 bottom-10 rounded-full bg-amber-500 px-3 py-1 text-sm font-semibold text-amber-950 shadow-lg sm:-right-6">
              {t.heroChipFuture}
            </span>
          </div>
        </div>
        <Wave className="text-background" />
      </section>

      {/* 3 steps */}
      <Section
        id="how-it-works"
        title={t.steps.title}
        accent="from-sky-400 via-violet-500 to-amber-400"
      >
        <ol className="relative grid gap-4 md:grid-cols-3">
          <span
            aria-hidden
            className="absolute top-11 right-[16%] left-[16%] hidden border-t-2 border-dashed border-emerald-300 md:block"
          />
          {t.steps.items.map((s, i) => {
            const Icon = STEP_ICONS[i] ?? MapPinIcon;
            const tone = TONES[STEP_TONES[i] ?? 'green'];
            return (
              <li
                key={s.title}
                className={cn(
                  'relative flex gap-4 rounded-2xl border p-5 md:flex-col',
                  tone.soft,
                  tone.border,
                )}
              >
                <span
                  className={cn(
                    'relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md',
                    tone.bar,
                  )}
                >
                  <Icon className="size-6" aria-hidden />
                  <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-white text-xs font-bold text-foreground shadow ring-1 ring-black/10">
                    {i + 1}
                  </span>
                </span>
                <div className="space-y-1">
                  <h3 className={cn('text-lg font-semibold', tone.text)}>{s.title}</h3>
                  <p className="text-base text-muted-foreground">{s.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      {/* 4 result cards: 1 → 2 → 4 columns, one colour per metric */}
      <Section
        id="results"
        title={t.results.title}
        subtitle={t.results.subtitle}
        accent="from-sky-400 via-amber-400 to-orange-500"
        className="bg-gradient-to-b from-sky-50/60 to-amber-50/50 dark:from-sky-950/20 dark:to-amber-950/10"
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.results.items.map((r) => {
            const Icon = RESULT_ICONS[r.key] ?? DropletsIcon;
            const tone = TONES[RESULT_TONES[r.key] ?? 'green'];
            return (
              <li key={r.key}>
                <Card className="relative h-full overflow-hidden">
                  <span
                    aria-hidden
                    className={cn('absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r', tone.bar)}
                  />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-lg font-semibold">
                      <span
                        className={cn(
                          'flex size-10 items-center justify-center rounded-xl',
                          tone.tile,
                        )}
                      >
                        <Icon className="size-5" aria-hidden />
                      </span>
                      {r.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">{t.results.exampleLabel}</p>
                    <p className={cn('text-2xl font-bold', tone.text)}>{r.value}</p>
                    <p className="text-base text-muted-foreground">{r.detail}</p>
                    <Badge
                      variant="outline"
                      className={cn('h-auto px-2.5 py-1 text-sm', tone.border)}
                    >
                      {t.results.confidenceLabel}: {r.confidence}
                    </Badge>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Why salinity matters — two mechanisms (SPEC §1) */}
      <Section
        id="salinity"
        title={t.salinity.title}
        subtitle={t.salinity.intro}
        accent="from-orange-400 to-rose-500"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {t.salinity.mechanisms.map((m, i) => {
            const Icon = MECHANISM_ICONS[i] ?? WavesIcon;
            const tone = TONES[i === 0 ? 'orange' : 'sky'];
            return (
              <article
                key={m.title}
                className={cn('space-y-3 rounded-2xl border p-5', tone.soft, tone.border)}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex size-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md',
                      tone.bar,
                    )}
                  >
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <h3 className="text-lg font-semibold">{m.title}</h3>
                </div>
                <p className={cn('text-2xl font-bold', tone.text)}>{m.stat}</p>
                <p className="text-base text-muted-foreground">{m.body}</p>
              </article>
            );
          })}
        </div>
        <div className="mt-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-700 p-5 text-white shadow-lg shadow-emerald-800/20">
          <h3 className="text-lg font-semibold">{t.salinity.coverageTitle}</h3>
          {provinces.length >= 20 ? (
            <div className="mt-3 space-y-2">
              <Badge className="h-auto bg-amber-300 px-3 py-1 text-base text-amber-950">
                {t.salinity.allProvinces.replace('{n}', String(provinces.length))}
              </Badge>
              <p className="text-base text-emerald-50">{t.salinity.allProvincesNote}</p>
            </div>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {provinces.map((p) => (
                <li key={p}>
                  <Badge className="h-auto bg-white/20 px-3 py-1 text-base text-white">
                    {p}
                    {p === PILOT_PROVINCE ? ` · ${t.salinity.pilotTag}` : ''}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-base text-emerald-50">{t.salinity.coverageNote}</p>
        </div>
      </Section>

      {/* Sample report preview */}
      <Section
        id="report"
        title={t.report.title}
        subtitle={t.report.subtitle}
        accent="from-violet-400 to-purple-600"
        className="bg-gradient-to-b from-violet-50/60 to-background dark:from-violet-950/20"
      >
        <div className="flex flex-col items-center gap-6">
          <ReportPreview />
          <Link
            href="/fields/demo"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'h-12 border-violet-300 px-6 text-lg text-violet-800 hover:bg-violet-50',
            )}
          >
            {t.report.cta}
            <ArrowRightIcon className="size-5" aria-hidden />
          </Link>
        </div>
      </Section>

      {/* For agencies / researchers */}
      <Section
        id="agencies"
        title={t.agencies.title}
        subtitle={t.agencies.subtitle}
        accent="from-emerald-400 to-teal-600"
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.agencies.items.map((a, i) => {
            const Icon = AGENCY_ICONS[i] ?? FactoryIcon;
            const tone = TONES[AGENCY_TONES[i] ?? 'green'];
            const badge = 'badge' in a ? a.badge : undefined;
            return (
              <li
                key={a.title}
                className="space-y-3 rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <span
                  className={cn('flex size-11 items-center justify-center rounded-xl', tone.tile)}
                >
                  <Icon className="size-6" aria-hidden />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{a.title}</h3>
                  {badge ? (
                    <Badge className={cn('h-auto px-2.5 py-1 text-sm', tone.tile)}>{badge}</Badge>
                  ) : null}
                </div>
                <p className="text-base text-muted-foreground">{a.body}</p>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Data sources + last update */}
      <Section
        id="data-sources"
        title={t.data.title}
        subtitle={t.data.subtitle}
        accent="from-sky-400 to-emerald-500"
        className="bg-gradient-to-b from-emerald-50/50 to-sky-50/50 dark:from-emerald-950/20 dark:to-sky-950/10"
      >
        <p className="mb-6 inline-flex flex-wrap items-center gap-2 rounded-full bg-background px-4 py-2 text-base shadow-sm ring-1 ring-emerald-200">
          <DatabaseIcon className="size-5 text-emerald-600" aria-hidden />
          <span className="font-medium">{t.data.lastUpdatedLabel}</span>
          {lastUpdate ? (
            <time dateTime={lastUpdate.toISOString()}>{formatThaiDate(lastUpdate)}</time>
          ) : (
            <span className="text-muted-foreground">{t.data.lastUpdatedPending}</span>
          )}
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {t.data.sources.map((s, i) => {
            const tone = TONES[SOURCE_TONES[i % SOURCE_TONES.length]!];
            return (
              <li
                key={s.name}
                className="relative overflow-hidden rounded-xl border bg-card p-4 pl-5"
              >
                <span
                  aria-hidden
                  className={cn('absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b', tone.bar)}
                />
                <p className="text-base font-semibold">{s.name}</p>
                <p className="text-base text-muted-foreground">{s.use}</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 text-base text-muted-foreground">{t.data.lddNote}</p>
        <Link
          href="/data"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'mt-4 h-11 border-emerald-300 bg-background px-4 text-base text-emerald-800 hover:bg-emerald-50',
          )}
        >
          {th.rawData.viewAll}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      </Section>

      {/* Final call to action */}
      <section className="relative isolate overflow-hidden bg-gradient-to-br from-emerald-600 via-green-700 to-teal-700 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-20 right-10 size-64 rounded-full bg-amber-300/30 blur-3xl" />
          <div className="absolute -bottom-24 left-0 size-72 rounded-full bg-sky-300/25 blur-3xl" />
        </div>
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-14 sm:px-6 sm:py-20 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
              {t.finalCta.title}
            </h2>
            <p className="text-lg text-emerald-50">{t.finalCta.body}</p>
          </div>
          <Link
            href="/map"
            className={cn(
              buttonVariants({ size: 'lg' }),
              'h-12 shrink-0 bg-amber-400 px-6 text-lg text-amber-950 shadow-lg shadow-black/20 hover:bg-amber-300',
            )}
          >
            {t.ctaStart}
            <ArrowRightIcon className="size-5" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
