import Link from 'next/link';
import { MapPinOff } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mapMessages as m } from './messages';

/** Shown instead of the map when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured. */
export function MissingApiKey() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted p-6">
      <div role="status" className="max-w-md space-y-4 rounded-xl border bg-background p-6 text-center shadow-sm">
        <MapPinOff className="mx-auto size-10 text-muted-foreground" aria-hidden />
        <h2 className="text-xl font-semibold">{m.noApiKey.title}</h2>
        <p className="text-base">{m.noApiKey.body}</p>
        {process.env.NODE_ENV !== 'production' && (
          <p className="text-sm break-words text-muted-foreground">{m.noApiKey.devHint}</p>
        )}
        <Link href="/" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11 px-5 text-base')}>
          {m.noApiKey.back}
        </Link>
      </div>
    </div>
  );
}
