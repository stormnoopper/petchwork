import { RPC } from '@rice/contracts';
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/api/auth';
import { apiError, pgErrorCode, readJson } from '@/lib/api/errors';
import { EnqueueRunRequest, FieldId } from '@/lib/api/fields';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** POST /api/fields/[id]/runs `{ scenario_id }` → `{ run_id }` (Phase 2 twin queue). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = FieldId.safeParse((await params).id);
  if (!id.success) return apiError('NOT_FOUND');
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return apiError('UNAUTHORIZED');

  const body = EnqueueRunRequest.safeParse(await readJson(req));
  if (!body.success) return apiError('BAD_REQUEST', body.error.issues);

  const { data, error } = await supabase.rpc(RPC.enqueueTwinRun, {
    p_field_id: id.data,
    p_scenario: body.data.scenario_id,
  });
  if (error || typeof data !== 'string') {
    if (error) console.error('[api/fields/id/runs] enqueue failed', error);
    return apiError(pgErrorCode(error));
  }
  return NextResponse.json({ run_id: data }, { status: 202 });
}
