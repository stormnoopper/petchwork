import 'server-only';
import { getSessionUser, type SessionUser } from '@/lib/auth/session';

export { safeNext } from '@/lib/auth/safe-next';
export type { SessionUser };

/** Signed-in user (Auth.js session, Google) or null when anonymous / expired. */
export function getUser(): Promise<SessionUser | null> {
  return getSessionUser();
}
