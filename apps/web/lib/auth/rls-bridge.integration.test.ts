/**
 * Integration check for the Auth.js → Supabase RLS bridge (D-026). Needs a running Supabase.
 * Skipped by default; run with:
 *   set -a; . ./.env.local; set +a; RLS_BRIDGE_IT=1 pnpm exec vitest run lib/auth/rls-bridge
 */
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { appUserIdFromGoogleSub } from './identity';
import { mintSupabaseToken } from './supabase-token';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SECRET = process.env.SUPABASE_JWT_SECRET ?? '';
const enabled = process.env.RLS_BRIDGE_IT === '1' && Boolean(URL && ANON && SECRET);

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

async function asUser(id: string, email: string): Promise<SupabaseClient> {
  const token = await mintSupabaseToken({ id, email }, SECRET);
  return createClient(URL, ANON, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
}

describe.skipIf(!enabled)('RLS bridge (live Supabase)', () => {
  const run = randomUUID().slice(0, 8);
  const subA = `it-a-${run}`;
  const subB = `it-b-${run}`;
  const idA = appUserIdFromGoogleSub(subA);
  const idB = appUserIdFromGoogleSub(subB);

  it('minted tokens: ensure_app_user, owner insert, cross-user isolation', async () => {
    const a = await asUser(idA, `${subA}@test.local`);
    const b = await asUser(idB, `${subB}@test.local`);
    const anon = createClient(URL, ANON, opts);

    // PostgREST accepts the token and auth.uid() = sub
    const ea = await a.rpc('ensure_app_user', { p_email: `${subA}@test.local`, p_name: 'IT A', p_image: null, p_provider_account_id: subA });
    expect(ea.error).toBeNull();
    expect((ea.data as { id: string }).id).toBe(idA);
    const eb = await b.rpc('ensure_app_user', { p_email: `${subB}@test.local`, p_name: 'IT B', p_image: null, p_provider_account_id: subB });
    expect(eb.error).toBeNull();
    const en = await anon.rpc('ensure_app_user', { p_email: 'x', p_name: null, p_image: null, p_provider_account_id: null });
    expect(en.error).not.toBeNull();

    // forged token (wrong secret) is rejected by PostgREST
    const forged = createClient(URL, ANON, {
      ...opts,
      global: { headers: { Authorization: `Bearer ${await mintSupabaseToken({ id: idA }, `${SECRET}-wrong`)}` } },
    });
    const fz = await forged.schema('app').from('fields').select('id').limit(1);
    expect(fz.error).not.toBeNull();

    const ins = await a
      .schema('app')
      .from('fields')
      .insert({
        user_id: idA,
        name: `IT ${run}`,
        vertices: [],
        geom: 'SRID=4326;POLYGON((103.30 16.10,103.302 16.10,103.302 16.102,103.30 16.102,103.30 16.10))',
      })
      .select('id,user_id,province_code')
      .single();
    expect(ins.error).toBeNull();
    const fieldId = (ins.data as { id: string }).id;
    expect((ins.data as { province_code: string }).province_code).toBe('44');

    // B cannot insert as A, cannot read A's field, cannot read A's user row
    const bIns = await b.schema('app').from('fields').insert({ user_id: idA, name: 'x', vertices: [], geom: 'SRID=4326;POLYGON((103.3 16.1,103.301 16.1,103.301 16.101,103.3 16.1))' });
    expect(bIns.error?.code).toBe('42501');
    const bSel = await b.schema('app').from('fields').select('id').eq('id', fieldId);
    expect(bSel.error).toBeNull();
    expect(bSel.data).toEqual([]);
    const bUsers = await b.schema('app').from('users').select('id');
    expect(bUsers.data).toEqual([{ id: idB }]);
    const bRpc = await b.rpc('field_results', { p_field_id: fieldId });
    expect(bRpc.error?.code).toBe('42501');

    // anon cannot read it either; A can
    const nSel = await anon.schema('app').from('fields').select('id').eq('id', fieldId);
    expect(nSel.data ?? []).toEqual([]);
    const aSel = await a.schema('app').from('fields').select('id').eq('id', fieldId);
    expect(aSel.data).toEqual([{ id: fieldId }]);

    const del = await a.schema('app').from('fields').delete().eq('id', fieldId).select('id');
    expect(del.data).toEqual([{ id: fieldId }]);
  });
});
