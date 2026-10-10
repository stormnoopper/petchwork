import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/api/auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change'];

/**
 * Magic-link landing: `?code=` (PKCE, default for @supabase/ssr) or `?token_hash=&type=`
 * (custom email template). Sets the session cookies, then redirects to `next`.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    if (error) console.error('[auth/callback] exchange failed', error.message);
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
    if (error) console.error('[auth/callback] verifyOtp failed', error.message);
  }

  if (ok) return NextResponse.redirect(new URL(next, url.origin));
  const login = new URL('/login', url.origin);
  login.searchParams.set('next', next);
  login.searchParams.set('error', 'callback');
  return NextResponse.redirect(login);
}
