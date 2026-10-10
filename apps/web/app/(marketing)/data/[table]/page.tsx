import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { fmt, formatNumber } from '@/lib/display/fmt';
import { cn } from '@/lib/utils';
import {
  CSV_MAX_ROWS,
  MAX_OFFSET,
  PAGE_SIZE,
  cellText,
  fetchRawDataCatalog,
  fetchRawDataRows,
  parseRawTable,
} from '@/lib/api/raw-data';
import th from '@/messages/th.json';

const t = th.rawData;
const names = t.tables as Record<string, string>;

export const dynamic = 'force-dynamic';

type Params = { table: string };
type Search = { page?: string; col?: string; val?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const table = parseRawTable((await params).table);
  return {
    title: table ? `${names[table] ?? table} · ${t.metaTitle}` : t.metaTitle,
    robots: { index: false },
  };
}

function qs(p: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

const CONTROL =
  'h-11 rounded-lg border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

export default async function RawTablePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const table = parseRawTable((await params).table);
  if (!table) notFound();
  const sp = await searchParams;
  const col = sp.col?.trim() || null;
  const val = col ? sp.val?.trim() || null : null;
  const maxPage = Math.floor(MAX_OFFSET / PAGE_SIZE) + 1;
  const page = Math.min(Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1), maxPage);
  const offset = (page - 1) * PAGE_SIZE;

  const [catalog, res] = await Promise.all([
    fetchRawDataCatalog(),
    fetchRawDataRows({ table, offset, filterCol: col, filterVal: val }),
  ]);
  const info = catalog?.tables.find((x) => x.table === table);
  const filterCols = info?.columns ?? (res.ok ? res.data.columns : []);
  const sourceNames = (info?.sources ?? []).map(
    (c) => catalog?.sources.find((s) => s.code === c)?.name_th ?? c,
  );

  const data = res.ok ? res.data : null;
  const total = data?.total ?? 0;
  const from = data && data.rows.length > 0 ? offset + 1 : 0;
  const to = data ? offset + data.rows.length : 0;
  const hasNext = data != null && to < total && page < maxPage;
  const hasGeo = data?.columns.includes('area_rai') || (data?.columns.includes('lat') && table !== 'ref.weather_grid');
  const filterQs = { col, val };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 sm:px-6">
      <Link
        href="/data"
        className="inline-flex min-h-11 items-center gap-1 self-start text-base text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-5" aria-hidden />
        {t.backToCatalog}
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{names[table] ?? table}</h1>
        <p className="text-base text-muted-foreground">
          <code className="text-sm">{table}</code>
          {sourceNames.length > 0 ? ` · ${t.fromSources}: ${sourceNames.join(', ')}` : null}
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-2" aria-label={t.filterCol}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t.filterCol}
          <select name="col" defaultValue={col ?? ''} className={CONTROL}>
            <option value="">{t.filterNone}</option>
            {filterCols.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium sm:flex-none">
          {t.filterVal}
          <input name="val" defaultValue={val ?? ''} className={CONTROL} />
        </label>
        <button type="submit" className={cn(buttonVariants(), 'h-11 px-4 text-base')}>
          {t.filterApply}
        </button>
        {col ? (
          <Link
            href={`/data/${table}`}
            className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4 text-base')}
          >
            {t.filterClear}
          </Link>
        ) : null}
        <a
          href={`/api/data/${table}/csv${qs(filterQs)}`}
          className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4 text-base sm:ml-auto')}
          download
        >
          <Download className="size-5" aria-hidden />
          {fmt(t.downloadCsv, { n: formatNumber(CSV_MAX_ROWS) })}
        </a>
      </form>

      {!res.ok ? (
        <p role="alert" className="text-base text-destructive">
          {res.reason === 'bad_filter' ? t.filterError : t.loadError}
        </p>
      ) : data && data.rows.length === 0 ? (
        <p className="rounded-xl border p-6 text-base text-muted-foreground">{t.empty}</p>
      ) : data ? (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {fmt(data.estimated ? t.showingEstimated : t.showing, {
              from: formatNumber(from),
              to: formatNumber(to),
              total: formatNumber(total),
            })}
          </p>
          <div className="max-h-[70dvh] overflow-auto rounded-xl border">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {data.columns.map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className="border-b px-3 py-2 text-left font-semibold whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className="odd:bg-background even:bg-muted/40">
                    {data.columns.map((c) => {
                      const v = r[c];
                      return (
                        <td
                          key={c}
                          className={cn(
                            'max-w-xs truncate border-b px-3 py-1.5 whitespace-nowrap',
                            typeof v === 'number' && 'text-right tabular-nums',
                            v == null && 'text-muted-foreground',
                          )}
                          title={cellText(v)}
                        >
                          {v == null ? '–' : cellText(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="flex items-center justify-between gap-2" aria-label={t.showing}>
            {page > 1 ? (
              <Link
                href={`/data/${table}${qs({ ...filterQs, page: page - 1 })}`}
                className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4 text-base')}
              >
                {t.prev}
              </Link>
            ) : (
              <span />
            )}
            {hasNext ? (
              <Link
                href={`/data/${table}${qs({ ...filterQs, page: page + 1 })}`}
                className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4 text-base')}
              >
                {t.next}
              </Link>
            ) : null}
          </nav>
          {hasGeo ? <p className="text-sm text-muted-foreground">{t.geoNote}</p> : null}
          {page >= maxPage ? <p className="text-sm text-muted-foreground">{t.offsetLimit}</p> : null}
        </>
      ) : null}
    </div>
  );
}
