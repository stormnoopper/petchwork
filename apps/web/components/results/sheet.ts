/** Bottom-sheet snap points (fraction of the dynamic viewport height), SPEC §5.5. */
export const SNAPS = [0.25, 0.5, 0.9] as const;
export type Snap = (typeof SNAPS)[number];

/** Nearest snap for a sheet height fraction. */
export function nearestSnap(fraction: number): Snap {
  return SNAPS.reduce(
    (best, s) => (Math.abs(s - fraction) < Math.abs(best - fraction) ? s : best),
    SNAPS[0] as Snap,
  );
}

/** Tap on the handle: 25 → 50 → 90 → 25. */
export function nextSnap(current: Snap): Snap {
  const i = SNAPS.indexOf(current);
  return SNAPS[(i + 1) % SNAPS.length]!;
}

/**
 * Release a drag: a flick (|velocity| > 0.5 px/ms) moves one step in its direction,
 * otherwise snap to the nearest point.
 */
export function releaseSnap(current: Snap, fraction: number, velocityPxMs: number): Snap {
  if (Math.abs(velocityPxMs) > 0.5) {
    const i = SNAPS.indexOf(current);
    // dragging up = negative velocity (screen y decreases) = taller sheet
    const j = velocityPxMs < 0 ? Math.min(SNAPS.length - 1, i + 1) : Math.max(0, i - 1);
    return SNAPS[j]!;
  }
  return nearestSnap(fraction);
}

/** First/default snap (SPEC §5.5): 25 % = the 4-number summary, map stays usable above. */
export const DEFAULT_SNAP: Snap = 0.25;

type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Snap after the analysis status changes: a new request (new polygon / retry) resets to the
 * 25 % default; the result arriving keeps whatever the sheet is at (so it opens at 25 %, never
 * auto-expands). Practice edits recompute client-side without a status change, so the user's
 * chosen snap is kept.
 */
export function snapForStatus(current: Snap, next: AnalysisStatus): Snap {
  return next === 'loading' ? DEFAULT_SNAP : current;
}
