/**
 * Browser-side session probe for client islands (no SessionProvider needed, landing stays static).
 * Reads Auth.js `GET /api/auth/session` — returns public profile only, never the Supabase token.
 */
export async function fetchSessionUserId(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const id = (body as { user?: { id?: unknown } } | null)?.user?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null; // offline / auth not configured → treat as signed out
  }
}
