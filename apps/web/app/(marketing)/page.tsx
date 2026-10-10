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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ReportPreview } from '@/components/marketing/report-preview';
import { Section } from '@/components/marketing/section';
import { formatThaiDate, getEnabledProvinces, getLatestDataUpdate } from '@/lib/data-freshness';
import { cn } from '@/lib/utils';
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

const PILOT_PROVINCE = 'มหาสารคาม';

export default async function LandingPage() {
  const [lastUpdate, enabledProvinces] = await Promise.all([
    getLatestDataUpdate(),
    getEnabledProvinces(),
  ]);
  const provinces = enabledProvinces ?? [PILOT_PROVINCE];

  return (
    <>
      {/* Hero — mobile: text → buttons → image; lg: 2 columns */}
      <section className="bg-gradient-to-b from-primary/5 to-background">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-2 lg:py-20">
          <div className="space-y-6">
            <Badge variant="secondary" className="h-auto px-3 py-1 text-sm">
              <MapPinIcon aria-hidden />
              {t.heroBadge}
            </Badge>
            <h1 className="text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              {t.heroTitle}
            </h1>
            <p className="text-lg text-muted-foreground sm:text-xl">{t.heroSubtitle}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/map" className={cn(buttonVariants({ size: 'lg' }), 'h-12 px-6 text-lg')}>
                {t.ctaStart}
                <ArrowRightIcon className="size-5" aria-hidden />
              </Link>
              <Link
                href="/fields/demo"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'h-12 px-6 text-lg',
                )}
              >
                {t.ctaDemo}
              </Link>
            </div>
            <p className="text-base text-muted-foreground">{t.heroNote}</p>
          </div>
          <div className="mx-auto w-full max-w-sm lg:max-w-md">
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
        </div>
      </section>

      {/* 3 steps */}
      <Section id="how-it-works" title={t.steps.title}>
        <ol className="grid gap-4 md:grid-cols-3">
          {t.steps.items.map((s, i) => {
            const Icon = STEP_ICONS[i] ?? MapPinIcon;
            return (
              <li key={s.title} className="flex gap-4 rounded-xl border bg-card p-5 md:flex-col">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Icon className="size-6" aria-hidden />
                </span>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">
                    <span className="text-primary">{i + 1}.</span> {s.title}
                  </h3>
                  <p className="text-base text-muted-foreground">{s.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      {/* 4 result cards: 1 → 2 → 4 columns */}
      <Section
        id="results"
        title={t.results.title}
        subtitle={t.results.subtitle}
        className="bg-muted/40"
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.results.items.map((r) => {
            const Icon = RESULT_ICONS[r.key] ?? DropletsIcon;
            return (
              <li key={r.key}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                      <Icon className="size-5 text-primary" aria-hidden />
                      {r.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">{t.results.exampleLabel}</p>
                    <p className="text-2xl font-bold">{r.value}</p>
                    <p className="text-base text-muted-foreground">{r.detail}</p>
                    <Badge variant="outline" className="h-auto px-2.5 py-1 text-sm">
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
      <Section id="salinity" title={t.salinity.title} subtitle={t.salinity.intro}>
        <div className="grid gap-4 md:grid-cols-2">
          {t.salinity.mechanisms.map((m, i) => {
            const Icon = MECHANISM_ICONS[i] ?? WavesIcon;
            return (
              <article key={m.title} className="space-y-3 rounded-xl border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-orange-100 text-orange-800">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <h3 className="text-lg font-semibold">{m.title}</h3>
                </div>
                <p className="text-2xl font-bold text-orange-800">{m.stat}</p>
                <p className="text-base text-muted-foreground">{m.body}</p>
              </article>
            );
          })}
        </div>
        <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h3 className="text-lg font-semibold">{t.salinity.coverageTitle}</h3>
          {provinces.length >= 20 ? (
            <div className="mt-3 space-y-2">
              <Badge className="h-auto px-3 py-1 text-base">
                {t.salinity.allProvinces.replace('{n}', String(provinces.length))}
              </Badge>
              <p className="text-base text-muted-foreground">{t.salinity.allProvincesNote}</p>
            </div>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {provinces.map((p) => (
                <li key={p}>
                  <Badge className="h-auto px-3 py-1 text-base">
                    {p}
                    {p === PILOT_PROVINCE ? ` · ${t.salinity.pilotTag}` : ''}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-base text-muted-foreground">{t.salinity.coverageNote}</p>
        </div>
      </Section>

      {/* Sample report preview */}
      <Section
        id="report"
        title={t.report.title}
        subtitle={t.report.subtitle}
        className="bg-muted/40"
      >
        <div className="flex flex-col items-center gap-6">
          <ReportPreview />
          <Link
            href="/fields/demo"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-12 px-6 text-lg')}
          >
            {t.report.cta}
            <ArrowRightIcon className="size-5" aria-hidden />
          </Link>
        </div>
      </Section>

      {/* For agencies / researchers */}
      <Section id="agencies" title={t.agencies.title} subtitle={t.agencies.subtitle}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.agencies.items.map((a, i) => {
            const Icon = AGENCY_ICONS[i] ?? FactoryIcon;
            const badge = 'badge' in a ? a.badge : undefined;
            return (
              <li key={a.title} className="space-y-2 rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="size-6 text-primary" aria-hidden />
                  <h3 className="text-lg font-semibold">{a.title}</h3>
                  {badge ? (
                    <Badge variant="secondary" className="h-auto px-2.5 py-1 text-sm">
                      {badge}
                    </Badge>
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
        className="bg-muted/40"
      >
        <p className="mb-6 inline-flex flex-wrap items-center gap-2 rounded-lg bg-background px-4 py-3 text-base ring-1 ring-foreground/10">
          <DatabaseIcon className="size-5 text-primary" aria-hidden />
          <span className="font-medium">{t.data.lastUpdatedLabel}</span>
          {lastUpdate ? (
            <time dateTime={lastUpdate.toISOString()}>{formatThaiDate(lastUpdate)}</time>
          ) : (
            <span className="text-muted-foreground">{t.data.lastUpdatedPending}</span>
          )}
        </p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {t.data.sources.map((s) => (
            <li key={s.name} className="rounded-lg border bg-card p-4">
              <p className="text-base font-semibold">{s.name}</p>
              <p className="text-base text-muted-foreground">{s.use}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-base text-muted-foreground">{t.data.lddNote}</p>
      </Section>

      {/* FAQ */}
      <Section id="faq" title={t.faq.title}>
        <Accordion className="max-w-3xl rounded-xl border bg-card px-4">
          {t.faq.items.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="min-h-14 items-center py-3 text-base font-semibold">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-base text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Section>
    </>
  );
}
