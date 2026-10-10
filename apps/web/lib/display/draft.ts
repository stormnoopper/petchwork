/**
 * Unsaved-field draft kept while the user logs in (task 1.8).
 * Stored in sessionStorage (same tab) and mirrored to localStorage with a short TTL because a
 * magic link usually opens a new tab, which does not share sessionStorage.
 */
import { z } from 'zod';
import { LatLng, Practices, DEFAULT_PRACTICES } from '@rice/contracts';

export const DRAFT_KEY = 'rice.fieldDraft.v1';
export const DRAFT_TTL_MS = 60 * 60 * 1000;

const DraftSchema = z.object({
  v: z.literal(1),
  savedAt: z.number(),
  vertices: z.array(LatLng).min(3).max(64),
  practices: Practices.partial(),
});

export type FieldDraft = { vertices: LatLng[]; practices: Practices; savedAt: number };

export function serializeDraft(vertices: LatLng[], practices: Practices, now = Date.now()): string {
  return JSON.stringify({ v: 1, savedAt: now, vertices, practices });
}

/** Parse + validate; returns null on garbage, schema mismatch or expiry. */
export function parseDraft(raw: string | null | undefined, now = Date.now()): FieldDraft | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = DraftSchema.safeParse(json);
  if (!parsed.success) return null;
  if (now - parsed.data.savedAt > DRAFT_TTL_MS || parsed.data.savedAt > now + 60_000) return null;
  return {
    vertices: parsed.data.vertices,
    practices: { ...DEFAULT_PRACTICES, ...parsed.data.practices },
    savedAt: parsed.data.savedAt,
  };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function stores(): StorageLike[] {
  const out: StorageLike[] = [];
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) out.push(window.sessionStorage);
  } catch {
    // storage blocked (private mode / disabled cookies)
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) out.push(window.localStorage);
  } catch {
    // ignore
  }
  return out;
}

/** Returns true when at least one storage accepted the draft. */
export function saveDraft(
  vertices: LatLng[],
  practices: Practices,
  storages: StorageLike[] = stores(),
): boolean {
  const raw = serializeDraft(vertices, practices);
  let ok = false;
  for (const s of storages) {
    try {
      s.setItem(DRAFT_KEY, raw);
      ok = true;
    } catch {
      // quota / blocked
    }
  }
  return ok;
}

/** Read the first valid draft (sessionStorage first) and remove it everywhere. */
export function takeDraft(storages: StorageLike[] = stores(), now = Date.now()): FieldDraft | null {
  let found: FieldDraft | null = null;
  for (const s of storages) {
    try {
      found ??= parseDraft(s.getItem(DRAFT_KEY), now);
      s.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }
  return found;
}

export const RESTORE_PARAM = 'restore';
export const loginUrlForDraft = (): string =>
  `/login?next=${encodeURIComponent(`/map?${RESTORE_PARAM}=1`)}`;
