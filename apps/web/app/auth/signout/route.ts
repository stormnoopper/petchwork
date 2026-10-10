import { NextResponse, type NextRequest } from 'next/server';
import { signOut } from '@/auth';
import { safeNext } from '@/lib/auth/safe-next';

export const dynamic = 'force-dynamic';

/**
 * POST /auth/signout (form or fetch) → clears the Auth.js session cookie → 303 to `next` (default `/`).
 * Cross-origin POSTs are rejected (logout CSRF).
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  let next = request.nextUrl.searchParams.get('next');
  const type = request.headers.get('content-type') ?? '';
  if (!next && type.includes('form')) {
    const v = (await request.formData()).get('next');
    next = typeof v === 'string' ? v : null;
  }
  await signOut({ redirect: false });
  return NextResponse.redirect(new URL(safeNext(next, '/'), request.nextUrl.origin), 303);
}
