import { CreateFieldRequest } from '@rice/contracts';
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/api/auth';
import { apiError, pgErrorCode, readJson } from '@/lib/api/errors';
import { FIELD_COLUMNS, polygonToEwkt, practicesToRow, toField } from '@/lib/api/fields';
import { createClient } from '@/lib/supabase/server';
import { ensureAppUser } from '@/lib/supabase/user';

export const dynamic = 'force-dynamic';

/** GET /api/fields — the signed-in user's fields (RLS). */
export async function GET() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return apiError('UNAUTHORIZED');

  const { data, error } = await supabase
    .schema('app')
    .from('fields')
    .select(FIELD_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[api/fields] list failed', error);
    return apiError(pgErrorCode(error));
  }
  return NextResponse.json({ fields: (data ?? []).map(toField) });
}

/** POST /api/fields — CreateFieldRequest → Field (trigger fills admin codes + sim.field_profile). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return apiError('UNAUTHORIZED');

  const body = CreateFieldRequest.safeParse(await readJson(req));
  if (!body.success) return apiError('BAD_REQUEST', body.error.issues);
  const { name, vertices, polygon, practices } = body.data;

  const insert = () =>
    supabase
      .schema('app')
      .from('fields')
      .insert({ user_id: user.id, name, vertices, geom: polygonToEwkt(polygon) })
      .select(FIELD_COLUMNS)
      .single();
  let { data, error } = await insert();
  if (error?.code === '23503') {
    // app.users row missing (e.g. DB reset while the session cookie lived on) → recreate once, retry
    try {
      await ensureAppUser(supabase, { ...user, providerAccountId: null });
      ({ data, error } = await insert());
    } catch (e) {
      console.error('[api/fields] ensure_app_user retry failed', e);
    }
  }
  if (error || !data) {
    console.error('[api/fields] insert failed', error);
    return apiError(pgErrorCode(error));
  }
  const field = toField(data);

  if (practices && Object.keys(practices).length > 0) {
    const { error: pErr } = await supabase
      .schema('app')
      .from('field_practices')
      .insert(practicesToRow(field.id, practices));
    if (pErr) {
      // keep the field; practices can be re-saved — report but do not fail the create
      console.error('[api/fields] practices insert failed', pErr);
      return NextResponse.json({ field, practices_saved: false }, { status: 201 });
    }
  }
  return NextResponse.json({ field, practices_saved: Boolean(practices) }, { status: 201 });
}
