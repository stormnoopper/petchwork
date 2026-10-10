import type { Confidence, ConfidenceTag } from '@rice/contracts';
import th from '@/messages/th.json';

const ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/** Thai label สูง / กลาง / ต่ำ */
export function confidenceLabel(level: Confidence): string {
  return th.results.confidence.levels[level];
}

/** Badge colour classes (WCAG AA text on tinted background). */
export function confidenceTone(level: Confidence): string {
  switch (level) {
    case 'high':
      return 'border-emerald-700/30 bg-emerald-50 text-emerald-900';
    case 'medium':
      return 'border-amber-700/30 bg-amber-50 text-amber-900';
    default:
      return 'border-red-700/30 bg-red-50 text-red-900';
  }
}

/** Weakest link of several tags (a derived value is only as good as its worst input). */
export function lowestConfidence(tags: readonly ConfidenceTag[]): ConfidenceTag | null {
  if (tags.length === 0) return null;
  return tags.reduce((min, t) => (ORDER[t.level] < ORDER[min.level] ? t : min));
}
