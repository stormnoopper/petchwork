import Link from 'next/link';
import t from '@/messages/th.auth.json';

export type Param = string | string[] | undefined;
export const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

/** Shared layout for /login and /register (narrow centred column, mobile-first). */
export function AuthShell({
  title,
  subtitle,
  next,
  children,
}: {
  title: string;
  subtitle: string;
  next: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="flex flex-col gap-5">
        <div className="space-y-2">
          <h1 className="text-2xl leading-snug font-semibold">{title}</h1>
          <p className="text-base text-muted-foreground">{subtitle}</p>
        </div>
        {children}
        <div className="flex flex-col gap-2 border-t pt-4 text-sm">
          <Link href="/privacy" className="text-primary underline-offset-4 hover:underline">
            {t.login.privacyLink}
          </Link>
          <Link href={next} className="text-muted-foreground underline-offset-4 hover:underline">
            {t.login.backToMap}
          </Link>
        </div>
      </div>
    </main>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
