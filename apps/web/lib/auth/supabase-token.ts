import { SignJWT } from 'jose';

/** Lifetime of a minted Supabase access token (server-side only, never sent to the browser). */
export const SUPABASE_TOKEN_TTL_S = 60 * 60;

export type TokenSubject = { id: string; email?: string | null };

/**
 * HS256 JWT that PostgREST accepts as an `authenticated` user: `auth.uid()` = `sub` so the
 * existing RLS policies keep working without Supabase Auth (D-026).
 */
export async function mintSupabaseToken(
  user: TokenSubject,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  ttlSec: number = SUPABASE_TOKEN_TTL_S,
): Promise<string> {
  if (!secret) throw new Error('SUPABASE_JWT_SECRET is not set');
  if (!user.id) throw new Error('mintSupabaseToken: missing user id');
  const claims: Record<string, unknown> = { role: 'authenticated' };
  if (user.email) claims.email = user.email;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setAudience('authenticated')
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + Math.min(ttlSec, SUPABASE_TOKEN_TTL_S))
    .sign(new TextEncoder().encode(secret));
}
