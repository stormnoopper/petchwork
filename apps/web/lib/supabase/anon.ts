import 'server-only';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

let anon: SupabaseClient | null = null;

/**
 * Stateless anon client for public, user-independent RPCs (analyze_polygon, weather_series,
 * enabled_provinces). No cookies → no auth refresh round-trips, reusable across requests.
 * Never use this for user-owned data (use `createClient` from ./server so RLS sees the user).
 */
export function createAnonClient(): SupabaseClient {
  if (!anon) {
    anon = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
  }
  return anon;
}
