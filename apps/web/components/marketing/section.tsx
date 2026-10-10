import { cn } from '@/lib/utils';

type Props = {
  id?: string;
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
};

/** Shared section wrapper for marketing pages (scroll-margin accounts for sticky header). */
export function Section({ id, title, subtitle, className, children }: Props) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn('scroll-mt-20 py-14 sm:py-20', className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8 max-w-2xl space-y-3">
          <h2 id={headingId} className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            {title}
          </h2>
          {subtitle ? <p className="text-base text-muted-foreground sm:text-lg">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}
