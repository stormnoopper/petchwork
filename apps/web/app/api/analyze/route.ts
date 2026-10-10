import { NextResponse } from 'next/server';
import { analyze } from '@/lib/api/analyze';
import { readJson } from '@/lib/api/errors';
import { createAnonClient } from '@/lib/supabase/anon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/analyze — AnalyzeRequest → AnalyzeResponse (SPEC §8). Public, no login needed. */
export async function POST(req: Request) {
  const t0 = performance.now();
  const out = await analyze(createAnonClient(), await readJson(req));
  return NextResponse.json(out.body, {
    status: out.status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Analyze-Cache': out.cache,
      'Server-Timing': `analyze;dur=${(performance.now() - t0).toFixed(1)}`,
    },
  });
}
