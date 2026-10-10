import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import {
  Field,
  FieldResults,
  RPC,
  WeatherDay,
  type FieldProfile,
  type Practices,
} from '@rice/contracts';
import { runSeasonEnsemble } from '@rice/model';
import { weatherRange } from '@/lib/api/analyze';
import {
  defaultPracticesFor,
  practicesFromRow,
  type FieldPracticesRow,
} from '@/lib/display/practices';
import {
  toDisplayResult,
  toYearSeries,
  type DisplayResult,
  type YearPoint,
} from '@/lib/display/results';
import { createClient } from '@/lib/supabase/server';

const FIELD_COLUMNS =
  'id,name,vertices,area_rai,province_code,district_code,subdistrict_code,is_demo,created_at';

export type ReportData = {
  field: Field;
  profile: FieldProfile | null;
  computedAt: string | null;
  practices: Practices;
  result: { display: DisplayResult; series: YearPoint[] } | null;
  /** why `result` is null */
  issue: 'noProfile' | 'noWeather' | 'computeError' | null;
};

export type ReportLoad =
  { kind: 'ok'; data: ReportData } | { kind: 'notFound' } | { kind: 'error' };

/**
 * Field + profile (RLS: owner or demo) + latest practices + weather → server-side recompute with
 * the same ensemble as /api/analyze (twin runs are Phase 2). Deduped per request via React cache.
 */
export const loadFieldReport = cache(async (id: string): Promise<ReportLoad> => {
  if (!z.guid().safeParse(id).success) return { kind: 'notFound' };
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (e) {
    console.error('[fields/[id]] supabase client', e);
    return { kind: 'error' };
  }

  const { data: row, error: fErr } = await supabase
    .schema('app')
    .from('fields')
    .select(FIELD_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (fErr) {
    console.error('[fields/[id]] field select', fErr);
    return { kind: 'error' };
  }
  if (!row) return { kind: 'notFound' };
  const r = row as Record<string, unknown>;
  const fieldParsed = Field.safeParse({
    ...r,
    area_rai: r.area_rai == null ? 0 : Number(r.area_rai),
  });
  if (!fieldParsed.success) {
    console.error('[fields/[id]] field parse', fieldParsed.error.issues);
    return { kind: 'error' };
  }
  const field = fieldParsed.data;

  const [resultsRes, practicesRes] = await Promise.all([
    supabase.rpc(RPC.fieldResults, { p_field_id: id }),
    supabase
      .schema('app')
      .from('field_practices')
      .select(
        'season,variety,plant_date,establishment,water_source,water_regime,n_kg_rai,organic_t_rai,straw_burn',
      )
      .eq('field_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (resultsRes.error) {
    if (resultsRes.error.code === '42501') return { kind: 'notFound' };
    console.error('[fields/[id]] field_results', resultsRes.error);
  }
  const results = FieldResults.safeParse(resultsRes.data);
  if (resultsRes.data && !results.success)
    console.error('[fields/[id]] field_results parse', results.error.issues);
  const profile = results.success ? results.data.profile : null;
  const computedAt = results.success ? results.data.computed_at : null;

  const practices = practicesFromRow(
    (practicesRes.data as FieldPracticesRow | null) ?? null,
    defaultPracticesFor(profile),
  );

  const base = { field, profile, computedAt, practices };
  if (!profile) return { kind: 'ok', data: { ...base, result: null, issue: 'noProfile' } };

  const gridId = profile.grid?.weather_grid_id ?? null;
  const range = weatherRange();
  let weather: WeatherDay[] = [];
  if (gridId != null) {
    const w = await supabase.rpc(RPC.weatherSeries, {
      p_grid_id: gridId,
      p_from: range.from,
      p_to: range.to,
    });
    const parsed = z.array(WeatherDay).safeParse(w.data ?? []);
    if (w.error || !parsed.success)
      console.error('[fields/[id]] weather_series', w.error ?? parsed.error?.issues);
    weather = parsed.success ? parsed.data : [];
  }
  if (weather.length === 0)
    return { kind: 'ok', data: { ...base, result: null, issue: 'noWeather' } };

  try {
    const ens = runSeasonEnsemble({
      profile,
      practices,
      weather,
      year: range.lastYear,
      includeDaily: false,
    });
    return {
      kind: 'ok',
      data: {
        ...base,
        result: {
          display: toDisplayResult(ens.quick, ens.years, profile.area_rai),
          series: toYearSeries(ens.years),
        },
        issue: null,
      },
    };
  } catch (e) {
    console.error('[fields/[id]] model', e);
    return { kind: 'ok', data: { ...base, result: null, issue: 'computeError' } };
  }
});
