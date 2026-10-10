'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  AnalyzeResponse,
  type AnalyzeRequest,
  type PolygonGeoJSON,
} from '@rice/contracts';

/** Client-side failure kinds (keys into th.map.json → analyze.*). Server-side domain errors
 *  such as OUTSIDE_THAILAND come back as a parsed `AnalyzeResponse` with `ok: false`. */
export type AnalyzeClientError = 'unavailable' | 'network' | 'invalid' | 'http';

export type AnalyzeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: AnalyzeResponse }
  | { status: 'error'; error: AnalyzeClientError; httpStatus?: number };

export const ANALYZE_ENDPOINT = '/api/analyze';

/**
 * One POST to /api/analyze, mapped to an `AnalyzeState`. Returns null when aborted.
 * Exported for unit tests; components should use `useAnalyze`.
 */
export async function postAnalyze(
  body: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<AnalyzeState | null> {
  let res: Response;
  try {
    res = await fetchImpl(ANALYZE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    });
  } catch {
    return signal?.aborted ? null : { status: 'error', error: 'network' };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON body (e.g. the Next.js 404 HTML page)
  }
  if (signal?.aborted) return null;

  const parsed = AnalyzeResponse.safeParse(json);
  // includes ok:false domain errors (OUTSIDE_THAILAND, PROVINCE_NOT_ENABLED, …)
  if (parsed.success) return { status: 'success', data: parsed.data };
  if (res.status === 404 || res.status === 405 || res.status === 501) {
    return { status: 'error', error: 'unavailable', httpStatus: res.status };
  }
  if (!res.ok) return { status: 'error', error: 'http', httpStatus: res.status };
  return { status: 'error', error: 'invalid', httpStatus: res.status };
}

/**
 * POST `AnalyzeRequest` to /api/analyze whenever `polygon` (or `practices`) changes.
 * Pass `null` to stay idle (e.g. polygon incomplete / invalid / not yet confirmed).
 * In-flight requests are aborted when the input changes or the component unmounts.
 */
export function useAnalyze(
  polygon: PolygonGeoJSON | null,
  practices?: AnalyzeRequest['practices'],
): AnalyzeState & { retry: () => void } {
  const body = polygon
    ? JSON.stringify({ polygon, ...(practices ? { practices } : {}) } satisfies AnalyzeRequest)
    : null;
  const [state, setState] = useState<AnalyzeState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!body) {
      setState({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: 'loading' });

    postAnalyze(body, ctrl.signal).then((next) => {
      if (next && !ctrl.signal.aborted) setState(next);
    });

    return () => ctrl.abort();
  }, [body, attempt]);

  return { ...state, retry };
}
