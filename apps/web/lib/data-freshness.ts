import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { RPC } from '@rice/contracts';

/**
 * Data-freshness helpers for the public landing page (SPEC §5.0, §6.1).
 *
 * Uses an anon Supabase client without cookies so the landing stays statically
 * generated (ISR, revalidate = 86400). Every function degrades to a safe
 * fallback when env vars are missing or the DB/RPC is not ready yet.
 */

const TIMEOUT_MS = 5000;

function anonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }),
    },
  });
}

type SnapshotRow = { source_code?: string; version?: string; created_at?: string };

/** Latest `meta.data_snapshots.created_at` across all sources, or null if unavailable. */
export async function getLatestDataUpdate(): Promise<Date | null> {
  try {
    const supabase = anonClient();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc(RPC.dataSnapshotsLatest);
    if (error || !Array.isArray(data)) return null;
    let latest: number | null = null;
    for (const row of data as SnapshotRow[]) {
      const t = row?.created_at ? Date.parse(row.created_at) : NaN;
      if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
    }
    return latest === null ? null : new Date(latest);
  } catch {
    return null;
  }
}

type ProvinceRow = { province_code?: string; name_th?: string };

/** Thai names of provinces with `ref.province_coverage.enabled = true`; null if unavailable. */
export async function getEnabledProvinces(): Promise<string[] | null> {
  try {
    const supabase = anonClient();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc(RPC.enabledProvinces);
    if (error || !Array.isArray(data)) return null;
    const names = (data as ProvinceRow[])
      .map((r) => r?.name_th)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);
    return names.length > 0 ? names : null;
  } catch {
    return null;
  }
}

/** Format a date in the Thai Buddhist calendar, e.g. "10 ตุลาคม 2569". */
export function formatThaiDate(date: Date): string {
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  }).format(date);
}
