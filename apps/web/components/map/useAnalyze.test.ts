import { describe, expect, it, vi } from 'vitest';
import { ANALYZE_ENDPOINT, postAnalyze } from './useAnalyze';

const body = JSON.stringify({ polygon: { type: 'Polygon', coordinates: [] } });

const respond = (status: number, payload: unknown, isJson = true) =>
  vi.fn(async () =>
    isJson
      ? new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
      : new Response(String(payload), { status, headers: { 'Content-Type': 'text/html' } }),
  ) as unknown as typeof fetch;

describe('postAnalyze', () => {
  it('POSTs JSON to /api/analyze', async () => {
    const f = respond(404, '<html>not found</html>', false);
    await postAnalyze(body, undefined, f);
    expect(f).toHaveBeenCalledWith(
      ANALYZE_ENDPOINT,
      expect.objectContaining({ method: 'POST', body, headers: { 'Content-Type': 'application/json' } }),
    );
  });

  it('maps 404 (route not built yet) to unavailable', async () => {
    expect(await postAnalyze(body, undefined, respond(404, '<html/>', false))).toEqual({
      status: 'error',
      error: 'unavailable',
      httpStatus: 404,
    });
  });

  it('maps fetch rejection to network', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await postAnalyze(body, undefined, f)).toEqual({ status: 'error', error: 'network' });
  });

  it('returns null when aborted', async () => {
    const ctrl = new AbortController();
    const f = vi.fn(async () => {
      ctrl.abort();
      throw new DOMException('aborted', 'AbortError');
    }) as unknown as typeof fetch;
    expect(await postAnalyze(body, ctrl.signal, f)).toBeNull();
  });

  it('passes through ok:false domain errors as success data', async () => {
    const payload = { ok: false, error: 'OUTSIDE_THAILAND', message_th: 'รองรับเฉพาะพื้นที่ในประเทศไทย' };
    const r = await postAnalyze(body, undefined, respond(422, payload));
    expect(r).toEqual({ status: 'success', data: payload });
  });

  it('maps unparseable 200 to invalid and 500 to http', async () => {
    expect(await postAnalyze(body, undefined, respond(200, { foo: 1 }))).toMatchObject({ error: 'invalid' });
    expect(await postAnalyze(body, undefined, respond(500, { foo: 1 }))).toMatchObject({
      error: 'http',
      httpStatus: 500,
    });
  });
});
