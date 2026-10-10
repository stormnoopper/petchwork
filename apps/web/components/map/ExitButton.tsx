import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mapMessages as m } from './messages';

/** Map overlay "ออก" → landing page. Does not sign out (sign-out lives on /fields and the site header). */
export function ExitButton() {
  return (
    <Link
      href="/"
      aria-label={m.exitLabel}
      className={cn(
        buttonVariants({ variant: 'outline' }),
        'h-12 min-w-12 gap-2 rounded-full px-4 text-base shadow-lg shadow-black/30 [&_svg:not([class*=size-])]:size-5',
      )}
    >
      <LogOut className="-scale-x-100" aria-hidden />
      {m.exit}
    </Link>
  );
}
