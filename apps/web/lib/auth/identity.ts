import { createHash } from 'node:crypto';

/**
 * Fixed UUID v5 namespace for app user ids (D-026). NEVER change it: every saved field is keyed by
 * `uuidv5('google:<sub>', APP_USER_NAMESPACE)`, so a new namespace would orphan all existing users.
 */
export const APP_USER_NAMESPACE = '31416000-cb73-4bfe-806a-00976aed3fee';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 4122 §4.3 name-based UUID (SHA-1, version 5). */
export function uuidV5(name: string, namespace: string): string {
  if (!UUID_RE.test(namespace)) throw new Error('uuidV5: invalid namespace');
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const bytes = createHash('sha1').update(ns).update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** App user id (= `app.users.id` = `auth.uid()` in RLS) for a Google account `sub`. */
export function appUserIdFromGoogleSub(sub: string): string {
  if (!sub) throw new Error('appUserIdFromGoogleSub: empty sub');
  return uuidV5(`google:${sub}`, APP_USER_NAMESPACE);
}
