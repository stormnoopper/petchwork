import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionUser } from '@/lib/auth/session';
import { createAnonClient } from './anon';
import { createUserClient } from './user';

/**
 * Per-request client (RLS applies). Signed in via Auth.js → client with a short-lived Supabase JWT
 * minted for `session.user.id` (D-026); anonymous → the shared anon client. Memoised per request.
 */
export const createClient = cache(async (): Promise<SupabaseClient> => {
  const user = await getSessionUser();
  return user ? createUserClient(user) : createAnonClient();
});
