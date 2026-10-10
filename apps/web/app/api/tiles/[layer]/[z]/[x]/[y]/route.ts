import { RPC } from '@rice/contracts';
import { apiError } from '@/lib/api/errors';
import { TILE_CACHE_CONTROL, TileParams } from '@/lib/api/tiles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ layer: string; z: string; x: string; y: string }> };

/**
 * GET /api/tiles/[layer]/[z]/[x]/[y] — Mapbox Vector Tile from `rpc('mvt_tile')`.
 * PostgREST returns raw bytes for the bytea domain when asked with the MVT media type (D-014).
 */
export async function GET(_req: Request, { params }: Ctx) {
  const t = TileParams.safeParse(await params);
  if (!t.success) return apiError('BAD_REQUEST', t.error.issues);

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/rest/v1/rpc/${RPC.mvtTile}`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.mapbox-vector-tile',
      },
      body: JSON.stringify({ p_layer: t.data.layer, z: t.data.z, x: t.data.x, y: t.data.y }),
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[api/tiles] upstream unreachable', err);
    return apiError('UPSTREAM');
  }

  if (!upstream.ok) {
    console.error('[api/tiles] upstream', upstream.status, await upstream.text().catch(() => ''));
    return apiError(upstream.status === 400 ? 'BAD_REQUEST' : 'UPSTREAM');
  }

  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength === 0) {
    return new Response(null, { status: 204, headers: { 'Cache-Control': TILE_CACHE_CONTROL } });
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-protobuf',
      'Cache-Control': TILE_CACHE_CONTROL,
    },
  });
}
