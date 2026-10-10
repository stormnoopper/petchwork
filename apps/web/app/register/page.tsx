import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { getUser } from '@/lib/api/auth';
import { safeNext } from '@/lib/auth/safe-next';
import t from '@/messages/th.auth.json';
import { AuthShell, first, type Param } from '../login/shell';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t.register.metaTitle, robots: { index: false } };

type Props = { searchParams: Promise<{ next?: Param }> };

export default async function RegisterPage({ searchParams }: Props) {
  const next = safeNext(first((await searchParams).next));
  if (await getUser()) redirect(next);

  return (
    <AuthShell title={t.register.title} subtitle={t.register.subtitle} next={next}>
      <RegisterForm next={next} />
      <p className="text-base">
        {t.register.haveAccount}{' '}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t.register.loginLink}
        </Link>
      </p>
    </AuthShell>
  );
}
