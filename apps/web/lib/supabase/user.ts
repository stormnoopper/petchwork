import 'server-only';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSupabaseToken, type TokenSubject } from '@/lib/auth/supabase-token';

/**
 * Supabase client acting as `user` (RLS: `auth.uid()` = user.id). The bearer token is minted on the
 * server with SUPABASE_JWT_SECRET and lives only inside this client — never return it to the browser.
 */
export async function createUserClient(user: TokenSubject): Promise<SupabaseClient> {
  const token = await mintSupabaseToken(user, process.env.SUPABASE_JWT_SECRET ?? '');
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

export type AppUserProfile = {
  email: string | null;
  name: string | null;
  image: string | null;
  /** Google `sub`; null keeps the stored value */
  providerAccountId: string | null;
};

/** Upsert `app.users` for the client's user (RPC uses auth.uid()); must run before any field insert (FK). */
export async function ensureAppUser(client: SupabaseClient, p: AppUserProfile): Promise<void> {
  const { error } = await client.rpc('ensure_app_user', {
    p_email: p.email,
    p_name: p.name,
    p_image: p.image,
    p_provider_account_id: p.providerAccountId,
  });
  if (error) throw new Error(`ensure_app_user failed: ${error.code ?? ''} ${error.message}`);
}
