import Link from 'next/link';
import th from '@/messages/th.json';

const LINKS = [
  { href: '/about', label: th.marketing.footer.about },
  { href: '/privacy', label: th.marketing.footer.privacy },
  { href: '/terms', label: th.marketing.footer.terms },
  { href: '/about#contact', label: th.marketing.footer.contact },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear() + 543;
  return (
    <footer className="border-t bg-muted/40 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_2fr]">
        <div className="space-y-2">
          <p className="text-lg font-bold">{th.marketing.brand}</p>
          <p className="text-base text-muted-foreground">{th.marketing.brandTagline}</p>
          <nav aria-label={th.marketing.footer.about} className="flex flex-wrap gap-x-2 pt-2">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex min-h-11 items-center rounded px-1 text-base underline-offset-4 hover:underline"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="space-y-3 text-base">
          <h2 className="font-semibold">{th.marketing.footer.attributionTitle}</h2>
          <p className="text-muted-foreground">{th.marketing.footer.attribution}</p>
          <p className="text-muted-foreground">{th.marketing.footer.disclaimer}</p>
          <p className="text-muted-foreground">
            {th.marketing.footer.copyright.replace('{year}', String(year))}
          </p>
        </div>
      </div>
    </footer>
  );
}
