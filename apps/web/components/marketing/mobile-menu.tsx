'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MenuIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  links: ReadonlyArray<{ href: string; label: string }>;
  labels: { openMenu: string; menuTitle: string; login: string };
};

export function MobileMenu({ links, labels }: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={labels.openMenu}
        className={cn(buttonVariants({ variant: 'ghost' }), 'size-11 md:hidden')}
      >
        <MenuIcon className="size-6" aria-hidden />
      </SheetTrigger>
      <SheetContent side="right" className="w-4/5 max-w-xs pt-[env(safe-area-inset-top)]">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">{labels.menuTitle}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-2 px-4" aria-label={labels.menuTitle}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={close}
              className="flex min-h-11 items-center rounded-lg px-3 text-base font-medium hover:bg-muted"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/login"
            onClick={close}
            className={cn(buttonVariants(), 'mt-2 h-11 text-base')}
          >
            {labels.login}
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
