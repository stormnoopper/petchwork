import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Plus } from 'lucide-react';
import { Field } from '@rice/contracts';
import { buttonVariants } from '@/components/ui/button';
import { fmt, formatThaiDate } from '@/lib/display/fmt';
import { formatRaiNganWa, raiToM2 } from '@/lib/units';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import th from '@/messages/th.json';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: th.fields.listTitle, robots: { index: false } };

const t = th.fields;
const FIELD_COLUMNS =
  'id,name,vertices,area_rai,province_code,district_code,subdistrict_code,is_demo,created_at';

export default async function MyFieldsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/fields')}`);

  const { data, error } = await supabase
    .schema('app')
    .from('fields')
    .select(FIELD_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  const fields = (data ?? []).flatMap((r) => {
    const row = r as Record<string, unknown>;
    const p = Field.safeParse({ ...row, area_rai: Number(row.area_rai ?? 0) });
    return p.success ? [p.data] : [];
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{t.listTitle}</h1>
          <p className="text-base text-muted-foreground">{t.listSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/map" className={cn(buttonVariants(), 'h-11 px-4 text-base')}>
            <Plus className="size-5" aria-hidden />
            {t.newField}
          </Link>
          <form action="/auth/signout" method="post">
            <input type="hidden" name="next" value="/" />
            <button
              type="submit"
              className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4 text-base')}
            >
              {t.signOut}
            </button>
          </form>
        </div>
      </header>

      {error ? (
        <p role="alert" className="text-base text-destructive">
          {t.loadError}
        </p>
      ) : fields.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border p-6">
          <p className="text-base">{t.empty}</p>
          <Link href="/map" className={cn(buttonVariants(), 'h-11 px-4 text-base')}>
            {t.emptyCta}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((f) => (
            <li key={f.id}>
              <Link
                href={`/fields/${f.id}`}
                className="flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 py-3 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-lg font-semibold">{f.name}</span>
                  <span className="text-base text-muted-foreground">
                    {formatRaiNganWa(raiToM2(f.area_rai))} ·{' '}
                    {fmt(t.createdAt, { date: formatThaiDate(f.created_at) })}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
