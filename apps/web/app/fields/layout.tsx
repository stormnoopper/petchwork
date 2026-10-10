import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';
import th from '@/messages/th.json';

export default function FieldsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-3 focus:ring-3 focus:ring-ring"
      >
        {th.marketing.skipToContent}
      </a>
      <SiteHeader className="print:hidden" />
      <main id="main" className="flex-1">
        {children}
      </main>
      <div className="print:hidden">
        <SiteFooter />
      </div>
    </div>
  );
}
