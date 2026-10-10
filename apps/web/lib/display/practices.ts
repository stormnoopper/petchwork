import {
  DEFAULT_PRACTICES,
  Establishment,
  Practices,
  Season,
  Variety,
  WaterRegime,
  WaterSource,
  type FieldProfile,
} from '@rice/contracts';

/** SPEC §5.4 defaults that depend on the analysed polygon (region variety, RID zone). */
export function defaultPracticesFor(profile: FieldProfile | null | undefined): Practices {
  if (!profile) return { ...DEFAULT_PRACTICES };
  const irrigated = profile.in_irrigation_zone;
  return {
    ...DEFAULT_PRACTICES,
    variety: profile.coverage.default_variety ?? DEFAULT_PRACTICES.variety,
    waterSource: irrigated ? 'irrigated' : 'rainfed',
    waterRegime: irrigated ? 'continuous' : 'rainfed',
  };
}

/** Keep water regime consistent with the source (rainfed regime only for rainfed fields). */
export function withWaterSource(p: Practices, source: Practices['waterSource']): Practices {
  if (source === p.waterSource) return p;
  if (source === 'rainfed') return { ...p, waterSource: source, waterRegime: 'rainfed' };
  return {
    ...p,
    waterSource: source,
    waterRegime: p.waterRegime === 'rainfed' ? 'continuous' : p.waterRegime,
  };
}

/** Clamp a free-text numeric input to the contract range; '' → null (for nullable fields). */
export function parseNumberInput(raw: string, min: number, max: number): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/** Row of `app.field_practices` (snake_case, loosely typed from PostgREST). */
export type FieldPracticesRow = {
  season?: string | null;
  variety?: string | null;
  plant_date?: string | null;
  establishment?: string | null;
  water_source?: string | null;
  water_regime?: string | null;
  n_kg_rai?: number | string | null;
  organic_t_rai?: number | string | null;
  straw_burn?: boolean | null;
};

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

/** Map a stored practices row onto Practices; invalid / missing columns fall back to `base`. */
export function practicesFromRow(
  row: FieldPracticesRow | null | undefined,
  base: Practices = DEFAULT_PRACTICES,
): Practices {
  if (!row) return { ...base };
  const candidate = {
    ...base,
    ...(Season.safeParse(row.season).success ? { season: row.season as Practices['season'] } : {}),
    ...(Variety.safeParse(row.variety).success
      ? { variety: row.variety as Practices['variety'] }
      : {}),
    ...(row.plant_date ? { plantDate: row.plant_date.slice(0, 10) } : {}),
    ...(Establishment.safeParse(row.establishment).success
      ? { establishment: row.establishment as Practices['establishment'] }
      : {}),
    ...(WaterSource.safeParse(row.water_source).success
      ? { waterSource: row.water_source as Practices['waterSource'] }
      : {}),
    ...(WaterRegime.safeParse(row.water_regime).success
      ? { waterRegime: row.water_regime as Practices['waterRegime'] }
      : {}),
    ...(num(row.n_kg_rai) !== undefined ? { nKgPerRai: num(row.n_kg_rai)! } : {}),
    ...(num(row.organic_t_rai) !== undefined ? { organicTPerRai: num(row.organic_t_rai)! } : {}),
    ...(typeof row.straw_burn === 'boolean' ? { strawBurn: row.straw_burn } : {}),
  };
  const parsed = Practices.safeParse(candidate);
  return parsed.success ? parsed.data : { ...base };
}
