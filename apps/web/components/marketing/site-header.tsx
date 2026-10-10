import Link from 'next/link';
import { SproutIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import th from '@/messages/th.json';
import { MobileMenu } from './mobile-menu';
import { NAV_LINKS } from './nav-links';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex min-h-11 items-center gap-2 rounded-lg" aria-label={th.marketing.brand}>
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <SproutIcon className="size-5" aria-hidden />
          </span>
          <span className="text-lg font-bold leading-none">{th.marketing.brand}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label={th.marketing.nav.menuTitle}>
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex min-h-11 items-center rounded-lg px-3 text-base font-medium text-foreground/80 hover:bg-muted hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: 'outline' }), 'hidden h-11 px-4 text-base md:inline-flex')}
          >
            {th.marketing.nav.login}
          </Link>
          <MobileMenu
            links={NAV_LINKS}
            labels={{
              openMenu: th.marketing.nav.openMenu,
              menuTitle: th.marketing.nav.menuTitle,
              login: th.marketing.nav.login,
            }}
          />
        </div>
      </div>
    </header>
  );
}
