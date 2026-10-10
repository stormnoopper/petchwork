import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/api/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** POST /auth/signout (form or fetch) → clears session cookies → 303 to `next` (default `/`). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  let next = request.nextUrl.searchParams.get('next');
  const type = request.headers.get('content-type') ?? '';
  if (!next && type.includes('form')) {
    const v = (await request.formData()).get('next');
    next = typeof v === 'string' ? v : null;
  }
  return NextResponse.redirect(new URL(safeNext(next, '/'), request.nextUrl.origin), 303);
}
