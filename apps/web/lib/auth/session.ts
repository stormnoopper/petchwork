import 'server-only';
import { cache } from 'react';
import { auth } from '@/auth';

export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Signed-in user from the Auth.js session cookie, or null (anonymous / expired / auth not configured). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  let session;
  try {
    session = await auth();
  } catch (e) {
    console.error('[auth] session read failed', e instanceof Error ? e.message : e);
    return null;
  }
  const u = session?.user;
  if (!u?.id || !UUID_RE.test(u.id)) return null;
  return { id: u.id, email: u.email ?? null, name: u.name ?? null, image: u.image ?? null };
});
