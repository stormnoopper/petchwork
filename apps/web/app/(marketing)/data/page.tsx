import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import type { DataSourceStatus, RawDataSource } from '@rice/contracts';
import { Badge } from '@/components/ui/badge';
import { fmt, formatNumber, formatThaiDate } from '@/lib/display/fmt';
import { fetchRawDataCatalog } from '@/lib/api/raw-data';
import th from '@/messages/th.json';

const t = th.rawData;

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: t.metaTitle,
  description: t.metaDescription,
  alternates: { canonical: '/data' },
};

const STATUS_VARIANT: Record<DataSourceStatus, 'default' | 'secondary' | 'outline' | 'destructive'> =
  { ok: 'default', limited: 'secondary', placeholder: 'outline', unavailable: 'destructive' };

function label<K extends string>(map: Record<string, string>, key: K | null): string {
  return key ? (map[key] ?? key) : '–';
}

function SourceCard({ s }: { s: RawDataSource }) {
  const updated = s.latest_at ?? s.last_success_at;
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-base font-semibold">{s.name_th ?? s.code}</p>
        {s.status ? (
          <Badge variant={STATUS_VARIANT[s.status]}>{t.status[s.status]}</Badge>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t.lastUpdated}</dt>
        <dd>{updated ? formatThaiDate(updated) : t.never}</dd>
        {s.latest_rows != null ? (
          <>
            <dt className="text-muted-foreground">{t.version}</dt>
            <dd className="break-all">
              {s.latest_version} · {fmt(t.rows, { n: formatNumber(s.latest_rows) })}
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">{t.scale}</dt>
        <dd>{s.scale || '–'}</dd>
        <dt className="text-muted-foreground">{t.license}</dt>
        <dd>{s.license || '–'}</dd>
      </dl>
      <p className="text-sm text-muted-foreground">
        {label(t.tiers, s.refresh_tier)} · <code className="text-xs">{s.code}</code>
      </p>
      {s.url ? (
        <a
          href={s.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1 self-start text-sm text-primary underline-offset-4 hover:underline"
        >
          {t.website}
          <ExternalLink className="size-4" aria-hidden />
        </a>
      ) : null}
    </li>
  );
}

export default async function RawDataPage() {
  const catalog = await fetchRawDataCatalog();
  const names = th.rawData.tables as Record<string, string>;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-3 border-b pb-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
        <p className="text-lg text-muted-foreground">{t.intro}</p>
      </header>

      {!catalog ? (
        <p role="alert" className="text-base text-destructive">
          {t.loadError}
        </p>
      ) : (
        <>
          <section className="space-y-4" aria-labelledby="raw-tables">
            <h2 id="raw-tables" className="text-xl font-semibold">
              {fmt(t.tablesTitle, { n: catalog.tables.length })}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {catalog.tables.map((tb) => (
                <li key={tb.table}>
                  <Link
                    href={`/data/${tb.table}`}
                    className="flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 py-3 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-semibold">
                        {names[tb.table] ?? tb.table}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        <code className="text-xs">{tb.table}</code> ·{' '}
                        {tb.rows === 0
                          ? t.empty
                          : fmt(tb.estimated ? t.rowsEstimated : t.rows, {
                              n: formatNumber(tb.rows),
                            })}
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4" aria-labelledby="raw-sources">
            <h2 id="raw-sources" className="text-xl font-semibold">
              {fmt(t.sourcesTitle, { n: catalog.sources.length })}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.sources.map((s) => (
                <SourceCard key={s.code} s={s} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
