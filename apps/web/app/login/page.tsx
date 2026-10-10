import type { Metadata } from 'next';
import Link from 'next/link';
import { googleEnabled, signIn } from '@/auth';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { getUser } from '@/lib/api/auth';
import { isDevBypassEnabled } from '@/lib/auth/identity';
import { safeNext } from '@/lib/auth/safe-next';
import t from '@/messages/th.auth.json';
import { AuthShell, Divider, first, type Param } from './shell';
import { GoogleButton } from './GoogleButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t.login.metaTitle, robots: { index: false } };

type Props = { searchParams: Promise<{ next?: Param; callbackUrl?: Param; error?: Param }> };

/** Auth.js error codes (`?error=`, Google / dev flows) → Thai message. */
function errorText(code: string | undefined): string | null {
  if (!code) return null;
  if (code === 'AccessDenied') return t.login.errors.accessDenied;
  if (code === 'Configuration') return t.login.errors.configuration;
  if (code === 'CredentialsSignin') return t.login.errors.invalid;
  return t.login.errors.generic;
}

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next) ?? first(sp.callbackUrl));
  const error = errorText(first(sp.error));
  const devBypass = isDevBypassEnabled();
  if (await getUser()) redirect(next);

  async function signInWithGoogle() {
    'use server';
    await signIn('google', { redirectTo: safeNext(next) });
  }

  async function signInDevBypass() {
    'use server';
    if (!isDevBypassEnabled()) return;
    await signIn('dev-bypass', { redirectTo: safeNext(next) });
  }

  return (
    <AuthShell title={t.login.title} subtitle={t.login.subtitle} next={next}>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <LoginForm next={next} />

      <p className="text-base">
        {t.login.noAccount}{' '}
        <Link
          href={`/register?next=${encodeURIComponent(next)}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t.login.registerLink}
        </Link>
      </p>

      {googleEnabled || devBypass ? <Divider label={t.login.or} /> : null}

      {googleEnabled ? (
        <>
          <form action={signInWithGoogle}>
            <GoogleButton label={t.login.google} />
          </form>
          <p className="text-sm text-muted-foreground">{t.login.googleNote}</p>
        </>
      ) : null}

      {devBypass ? (
        <form action={signInDevBypass}>
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center rounded-full border-2 border-dashed border-amber-600 bg-amber-50 px-4 text-base font-medium text-amber-900 hover:bg-amber-100"
          >
            {t.login.devBypass}
          </button>
        </form>
      ) : null}
    </AuthShell>
  );
}
