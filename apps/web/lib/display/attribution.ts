import { ATTRIBUTION_THAIWATER, type FieldProfile } from '@rice/contracts';

/** SPEC §12: every page that uses ThaiWater data shows "คลังข้อมูลน้ำแห่งชาติ (สสน.)". */
export function usesThaiWater(
  profile: FieldProfile | null | undefined,
  attribution: readonly string[] = [],
): boolean {
  if (attribution.includes(ATTRIBUTION_THAIWATER)) return true;
  if (!profile) return false;
  if (Object.keys(profile.data_versions).some((k) => /thaiwater|hii/i.test(k))) return true;
  return profile.grid?.river_ec_dry_dsm != null;
}

/** Attribution lines to render: API-provided first, ThaiWater appended when needed, de-duplicated. */
export function attributionLines(
  profile: FieldProfile | null | undefined,
  attribution: readonly string[] = [],
): string[] {
  const out = [...attribution];
  if (usesThaiWater(profile, attribution) && !out.includes(ATTRIBUTION_THAIWATER))
    out.push(ATTRIBUTION_THAIWATER);
  return Array.from(new Set(out));
}

/**
 * Compact label of the data snapshot versions, e.g. "seed" when every source shares a version,
 * else "dgr 2026-09 · dmr seed" (sorted by source code).
 */
export function formatDataVersions(versions: Record<string, string> | null | undefined): string {
  const entries = Object.entries(versions ?? {}).filter(([, v]) => v);
  if (entries.length === 0) return '–';
  const unique = new Set(entries.map(([, v]) => v));
  if (unique.size === 1) return [...unique][0]!;
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
}
