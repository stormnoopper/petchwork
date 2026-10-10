import type { SupabaseClient, User } from '@supabase/supabase-js';

/** Verified user (validates the JWT with Supabase Auth) or null when anonymous / expired. */
export async function getUser(supabase: SupabaseClient): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

/** Only allow same-origin relative redirects (`/foo`), never `//evil.com` or absolute URLs. */
export function safeNext(next: string | null | undefined, fallback = '/map'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
