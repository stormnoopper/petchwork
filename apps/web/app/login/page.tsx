import type { Metadata } from 'next';
import t from '@/messages/th.auth.json';
import { safeNext } from '@/lib/api/auth';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: t.login.metaTitle, robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  const hasError = Boolean(sp.error);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <LoginForm next={next} initialError={hasError ? t.login.errors.callback : null} />
    </main>
  );
}
