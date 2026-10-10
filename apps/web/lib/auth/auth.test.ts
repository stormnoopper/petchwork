import { describe, expect, it } from 'vitest';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import { APP_USER_NAMESPACE, appUserIdFromGoogleSub, uuidV5 } from './identity';
import { safeNext } from './safe-next';
import { mintSupabaseToken, SUPABASE_TOKEN_TTL_S } from './supabase-token';

describe('uuidV5 / appUserIdFromGoogleSub', () => {
  it('matches the RFC 4122 reference vector', () => {
    // python: uuid.uuid5(uuid.NAMESPACE_DNS, 'www.example.com')
    expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });

  it('is stable for the same Google sub (namespace must never change)', () => {
    expect(APP_USER_NAMESPACE).toBe('31416000-cb73-4bfe-806a-00976aed3fee');
    const a = appUserIdFromGoogleSub('109876543210987654321');
    expect(a).toBe(appUserIdFromGoogleSub('109876543210987654321'));
    expect(a).toBe(uuidV5('google:109876543210987654321', APP_USER_NAMESPACE));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('differs per sub and rejects empty input', () => {
    expect(appUserIdFromGoogleSub('1')).not.toBe(appUserIdFromGoogleSub('2'));
    expect(() => appUserIdFromGoogleSub('')).toThrow();
    expect(() => uuidV5('x', 'not-a-uuid')).toThrow();
  });
});

describe('mintSupabaseToken', () => {
  const secret = 'super-secret-jwt-token-with-at-least-32-characters-long';
  const key = new TextEncoder().encode(secret);
  const uid = appUserIdFromGoogleSub('42');

  it('produces an HS256 token PostgREST treats as the authenticated user', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await mintSupabaseToken({ id: uid, email: 'a@example.com' }, secret, now);
    expect(decodeProtectedHeader(token)).toMatchObject({ alg: 'HS256', typ: 'JWT' });
    const { payload } = await jwtVerify(token, key, { audience: 'authenticated', algorithms: ['HS256'] });
    expect(payload).toMatchObject({ sub: uid, role: 'authenticated', aud: 'authenticated', email: 'a@example.com', iat: now });
    expect(payload.exp! - payload.iat!).toBe(SUPABASE_TOKEN_TTL_S);
    expect(SUPABASE_TOKEN_TTL_S).toBeLessThanOrEqual(3600);
  });

  it('caps ttl at 1h, omits null email, fails with the wrong secret', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await mintSupabaseToken({ id: uid, email: null }, secret, now, 86_400);
    const { payload } = await jwtVerify(token, key);
    expect(payload.exp! - now).toBe(3600);
    expect(payload).not.toHaveProperty('email');
    await expect(jwtVerify(token, new TextEncoder().encode(`${secret}x`))).rejects.toThrow();
  });

  it('refuses to mint without a secret or user id', async () => {
    await expect(mintSupabaseToken({ id: uid }, '')).rejects.toThrow(/SUPABASE_JWT_SECRET/);
    await expect(mintSupabaseToken({ id: '' }, secret)).rejects.toThrow();
  });
});

describe('safeNext', () => {
  it('keeps same-origin relative paths', () => {
    expect(safeNext('/map?restore=1')).toBe('/map?restore=1');
    expect(safeNext('/fields/abc')).toBe('/fields/abc');
  });
  it('rejects open-redirect shapes', () => {
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '/\t/evil.com', '/\n/evil.com', 'javascript:alert(1)']) {
      expect(safeNext(bad)).toBe('/map');
    }
    expect(safeNext(undefined, '/')).toBe('/');
  });
});
