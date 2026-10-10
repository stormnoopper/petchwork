import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import th from '@/messages/th.json';

const t = th.fields.notFound;

/** Missing, deleted or forbidden (RLS) field — the same message on purpose (no existence leak). */
export default function FieldNotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
      <SearchX className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="text-base text-muted-foreground">{t.body}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/map" className={cn(buttonVariants(), 'h-11 px-4 text-base')}>
          {t.map}
        </Link>
        <Link
          href="/"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4 text-base')}
        >
          {t.home}
        </Link>
      </div>
    </div>
  );
}
