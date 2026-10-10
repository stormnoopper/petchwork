import 'server-only';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { appUserIdFromEmail, normalizeEmail } from './identity';
import { dummyHash, hashPassword, verifyPassword } from './password';
import { mintServiceToken } from './supabase-token';

/** Supabase client with a fresh 60 s service_role token (credential RPCs only). */
async function serviceClient(): Promise<SupabaseClient> {
  const token = await mintServiceToken(process.env.SUPABASE_JWT_SECRET ?? '');
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

export type RegisterResult = { ok: true; userId: string } | { ok: false; reason: 'email_taken' };

/** Create app.users + app.user_credentials. Throws on infrastructure errors. */
export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<RegisterResult> {
  const email = normalizeEmail(input.email);
  const userId = appUserIdFromEmail(email);
  const client = await serviceClient();
  const { data, error } = await client.rpc('auth_register', {
    p_user_id: userId,
    p_email: email,
    p_name: input.name,
    p_password_hash: await hashPassword(input.password),
  });
  if (error) throw new Error(`auth_register failed: ${error.code ?? ''} ${error.message}`);
  return data === 'ok' ? { ok: true, userId } : { ok: false, reason: 'email_taken' };
}

export type AuthResult =
  | { ok: true; user: { id: string; email: string; name: string | null } }
  | { ok: false; reason: 'invalid' | 'locked' };

type CredentialRow = {
  user_id: string;
  email: string;
  name: string | null;
  password_hash: string;
  locked_until: string | null;
};

/** Verify email + password with per-account lockout (5 failures → 15 min, enforced in SQL). */
export async function authenticate(emailRaw: string, password: string): Promise<AuthResult> {
  const client = await serviceClient();
  const { data, error } = await client.rpc('auth_credentials', { p_email: normalizeEmail(emailRaw) });
  if (error) throw new Error(`auth_credentials failed: ${error.code ?? ''} ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : null) as CredentialRow | null;

  if (!row) {
    await verifyPassword(password, await dummyHash()); // same cost as a real check
    return { ok: false, reason: 'invalid' };
  }
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return { ok: false, reason: 'locked' };
  }
  const ok = await verifyPassword(password, row.password_hash);
  await client.rpc('auth_record_login', { p_user_id: row.user_id, p_success: ok });
  return ok
    ? { ok: true, user: { id: row.user_id, email: row.email, name: row.name } }
    : { ok: false, reason: 'invalid' };
}
