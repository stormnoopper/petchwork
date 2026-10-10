import type { Metadata } from 'next';
import Link from 'next/link';
import { signIn } from '@/auth';
import { safeNext } from '@/lib/auth/safe-next';
import t from '@/messages/th.auth.json';
import { GoogleButton } from './GoogleButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t.login.metaTitle, robots: { index: false } };

type Param = string | string[] | undefined;
type Props = { searchParams: Promise<{ next?: Param; callbackUrl?: Param; error?: Param }> };

const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

/** Auth.js error codes (`?error=`) → Thai message. */
function errorText(code: string | undefined): string | null {
  if (!code) return null;
  if (code === 'AccessDenied') return t.login.errors.accessDenied;
  if (code === 'Configuration') return t.login.errors.configuration;
  return t.login.errors.generic;
}

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next) ?? first(sp.callbackUrl));
  const error = errorText(first(sp.error));
  const configured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  async function signInWithGoogle() {
    'use server';
    await signIn('google', { redirectTo: safeNext(next) });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-2xl leading-snug font-semibold">{t.login.title}</h1>
          <p className="text-base text-muted-foreground">{t.login.subtitle}</p>
        </div>

        {configured ? (
          <form action={signInWithGoogle}>
            <GoogleButton label={t.login.google} />
          </form>
        ) : (
          <div role="status" className="rounded-lg border border-dashed bg-muted/40 p-4 text-sm">
            <p className="font-medium">{t.login.devNoticeTitle}</p>
            <p className="text-muted-foreground">{t.login.devNoticeBody}</p>
          </div>
        )}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground">{t.login.googleNote}</p>

        <div className="flex flex-col gap-2 text-sm">
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
