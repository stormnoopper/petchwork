import {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalyzeRpcResult,
  DEFAULT_PRACTICES,
  Practices,
  RPC,
  WeatherDay,
  type FieldProfile,
} from '@rice/contracts';
import { runSeasonEnsemble } from '@rice/model';
import { z } from 'zod';
import { buildAttribution } from './attribution';
import { analyzeCacheKey, LruTtlCache } from './cache';
import { analyzeErrorStatus, buildAnalyzeError, type EnabledProvince } from './errors';

/** Minimal shape of `supabase.rpc` we depend on (easy to mock). */
export interface RpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

export interface AnalyzeOutcome {
  status: number;
  body: AnalyzeResponse;
  cache: 'hit' | 'miss' | 'bypass';
}

const HOUR = 60 * 60 * 1000;
export const analyzeCache = new LruTtlCache<AnalyzeOutcome>(500, HOUR);
/** weather is the heaviest part and shared by every polygon in the same 0.1° cell */
export const weatherCache = new LruTtlCache<WeatherDay[]>(200, HOUR);
const provincesCache = new LruTtlCache<EnabledProvince[]>(1, 5 * 60 * 1000);

export function resetAnalyzeCaches(): void {
  analyzeCache.clear();
  weatherCache.clear();
  provincesCache.clear();
}

/** Last `years` full calendar years before `now` (UTC) — client recomputes ensembles from this. */
export function weatherRange(now: Date = new Date(), years = 10): { from: string; to: string; lastYear: number } {
  const lastYear = now.getUTCFullYear() - 1;
  return { from: `${lastYear - years + 1}-01-01`, to: `${lastYear}-12-31`, lastYear };
}

/** DEFAULT_PRACTICES ← profile-derived defaults ← user practices (user wins). */
export function effectivePractices(profile: FieldProfile, req?: Partial<Practices>): Practices {
  const fromProfile: Partial<Practices> = {};
  if (profile.coverage.default_variety) fromProfile.variety = profile.coverage.default_variety;
  if (profile.in_irrigation_zone) {
    fromProfile.waterSource = 'irrigated';
    fromProfile.waterRegime = 'continuous';
  }
  const user = Object.fromEntries(Object.entries(req ?? {}).filter(([, v]) => v !== undefined));
  const merged = { ...DEFAULT_PRACTICES, ...fromProfile, ...user };
  // user said rainfed source but left regime → keep it consistent
  if (req?.waterSource === 'rainfed' && req.waterRegime === undefined) merged.waterRegime = 'rainfed';
  if (req?.waterSource === 'irrigated' && req.waterRegime === undefined && merged.waterRegime === 'rainfed') {
    merged.waterRegime = 'continuous';
  }
  return Practices.parse(merged);
}

const EnabledProvincesRows = z.array(z.object({ province_code: z.string(), name_th: z.string().nullable() }));

async function enabledProvinces(client: RpcClient): Promise<EnabledProvince[] | undefined> {
  const hit = provincesCache.get('all');
  if (hit) return hit;
  const { data, error } = await client.rpc(RPC.enabledProvinces);
  if (error) return undefined;
  const parsed = EnabledProvincesRows.safeParse(data);
  if (!parsed.success) return undefined;
  const list = parsed.data.map((r) => ({ code: r.province_code, name_th: r.name_th ?? r.province_code }));
  provincesCache.set('all', list);
  return list;
}

async function weatherSeries(client: RpcClient, gridId: number, from: string, to: string): Promise<WeatherDay[]> {
  const key = `${gridId}|${from}|${to}`;
  const hit = weatherCache.get(key);
  if (hit) return hit;
  const { data, error } = await client.rpc(RPC.weatherSeries, { p_grid_id: gridId, p_from: from, p_to: to });
  if (error) throw new Error(`weather_series: ${error.message}`);
  // trust the RPC shape in prod (3.6k rows); full validation in dev
  const days =
    process.env.NODE_ENV === 'production' ? (data as WeatherDay[]) : z.array(WeatherDay).parse(data);
  weatherCache.set(key, days);
  return days;
}

function internal(): AnalyzeOutcome {
  return { status: 500, body: buildAnalyzeError('INTERNAL'), cache: 'bypass' };
}

/**
 * POST /api/analyze core: validate → analyze_polygon → weather_series → model ensemble.
 * `input` is the raw JSON body (unknown).
 */
export async function analyze(
  client: RpcClient,
  input: unknown,
  opts: { now?: Date; log?: (msg: string, err?: unknown) => void } = {},
): Promise<AnalyzeOutcome> {
  const log = opts.log ?? ((m, e) => console.error(`[api/analyze] ${m}`, e ?? ''));
  const req = AnalyzeRequest.safeParse(input);
  if (!req.success) {
    return { status: analyzeErrorStatus('INVALID_POLYGON', true), body: buildAnalyzeError('INVALID_POLYGON'), cache: 'bypass' };
  }

  const key = analyzeCacheKey(req.data);
  const hit = analyzeCache.get(key);
  if (hit) return { ...hit, cache: 'hit' };

  try {
    const { data, error } = await client.rpc(RPC.analyzePolygon, { p_geojson: req.data.polygon });
    if (error) {
      log('analyze_polygon failed', error);
      return internal();
    }
    const rpc = AnalyzeRpcResult.safeParse(data);
    if (!rpc.success) {
      log('analyze_polygon returned an unexpected shape', rpc.error.issues.slice(0, 5));
      return internal();
    }

    if (!rpc.data.ok) {
      const e = rpc.data;
      const needList = e.error === 'PROVINCE_NOT_ENABLED' || e.error === 'OUTSIDE_THAILAND';
      const out: AnalyzeOutcome = {
        status: analyzeErrorStatus(e.error),
        body: buildAnalyzeError(e.error, {
          provinceCode: e.province_code,
          provinceNameTh: e.province_name_th,
          enabledProvinces: needList ? await enabledProvinces(client) : undefined,
        }),
        cache: 'miss',
      };
      if (e.error !== 'INTERNAL') analyzeCache.set(key, out);
      return out;
    }

    const profile = rpc.data;
    const practices = effectivePractices(profile, req.data.practices);
    const range = weatherRange(opts.now);
    const gridId = profile.grid?.weather_grid_id ?? null;
    const weather = gridId === null ? [] : await weatherSeries(client, gridId, range.from, range.to);

    const { quick } = runSeasonEnsemble({ profile, practices, weather, year: range.lastYear });

    const body: AnalyzeResponse = {
      ok: true,
      profile,
      weather,
      quick,
      attribution: buildAttribution(profile.data_versions),
    };
    if (process.env.NODE_ENV !== 'production') AnalyzeResponse.parse(body);

    const out: AnalyzeOutcome = { status: 200, body, cache: 'miss' };
    analyzeCache.set(key, out);
    return out;
  } catch (err) {
    log('unexpected error', err);
    return internal();
  }
}
