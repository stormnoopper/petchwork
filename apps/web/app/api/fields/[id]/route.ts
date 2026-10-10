import { RPC, type FieldResults } from '@rice/contracts';
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/api/auth';
import { apiError, pgErrorCode, readJson } from '@/lib/api/errors';
import {
  FIELD_COLUMNS,
  FieldId,
  FieldResultsLoose,
  polygonToEwkt,
  toField,
  UpdateFieldRequest,
  type FieldDetail,
} from '@/lib/api/fields';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/fields/[id] — Field + FieldResults. Own fields, or the demo field anonymously. */
export async function GET(_req: Request, { params }: Ctx) {
  const id = FieldId.safeParse((await params).id);
  if (!id.success) return apiError('NOT_FOUND');
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('app')
    .from('fields')
    .select(FIELD_COLUMNS)
    .eq('id', id.data)
    .maybeSingle();
  if (error) return apiError(pgErrorCode(error));
  if (!data) return apiError('NOT_FOUND');

  const res = await supabase.rpc(RPC.fieldResults, { p_field_id: id.data });
  let results: FieldResults | null = null;
  if (res.error) {
    console.error('[api/fields/id] field_results failed', res.error);
  } else {
    const parsed = FieldResultsLoose.safeParse(res.data);
    if (parsed.success) results = parsed.data;
    else console.error('[api/fields/id] field_results shape', parsed.error.issues.slice(0, 5));
  }
  const body: FieldDetail = { field: toField(data), results };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** PATCH /api/fields/[id] — rename and/or move vertices (trigger recomputes profile, marks runs stale). */
export async function PATCH(req: Request, { params }: Ctx) {
  const id = FieldId.safeParse((await params).id);
  if (!id.success) return apiError('NOT_FOUND');
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return apiError('UNAUTHORIZED');

  const body = UpdateFieldRequest.safeParse(await readJson(req));
  if (!body.success) return apiError('BAD_REQUEST', body.error.issues);

  const patch: Record<string, unknown> = {};
  if (body.data.name !== undefined) patch.name = body.data.name;
  if (body.data.polygon && body.data.vertices) {
    patch.vertices = body.data.vertices;
    patch.geom = polygonToEwkt(body.data.polygon);
  }

  const { data, error } = await supabase
    .schema('app')
    .from('fields')
    .update(patch)
    .eq('id', id.data)
    .select(FIELD_COLUMNS)
    .maybeSingle();
  if (error) return apiError(pgErrorCode(error));
  if (!data) return apiError('NOT_FOUND'); // not owner / demo / missing (RLS)
  return NextResponse.json({ field: toField(data) });
}

/** DELETE /api/fields/[id] — owner only (demo field cannot be deleted). */
export async function DELETE(_req: Request, { params }: Ctx) {
  const id = FieldId.safeParse((await params).id);
  if (!id.success) return apiError('NOT_FOUND');
  const supabase = await createClient();
  const user = await getUser(supabase);
  if (!user) return apiError('UNAUTHORIZED');

  const { data, error } = await supabase
    .schema('app')
    .from('fields')
    .delete()
    .eq('id', id.data)
    .select('id');
  if (error) return apiError(pgErrorCode(error));
  if (!data || data.length === 0) return apiError('NOT_FOUND');
  return new NextResponse(null, { status: 204 });
}
