import type { ConfidenceTag } from '@rice/contracts';
import { cn } from '@/lib/utils';
import { confidenceLabel, confidenceTone } from '@/lib/display/confidence';
import { fmt } from '@/lib/display/fmt';
import th from '@/messages/th.json';

const t = th.results.confidence;

/**
 * สูง / กลาง / ต่ำ badge with the data source shown as text (touch devices have no tooltip)
 * and as `title` for mouse users. SPEC §12: every result value carries one.
 */
export function ConfidenceBadge({
  tag,
  className,
  showSource = true,
  compact = false,
}: {
  tag: ConfidenceTag;
  className?: string;
  showSource?: boolean;
  /** only the level word (สูง/กลาง/ต่ำ) — for the tight 4-number summary; full text stays in aria-label */
  compact?: boolean;
}) {
  const level = confidenceLabel(tag.level);
  return (
    <span
      className={cn(
        'inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm',
        className,
      )}
      title={fmt(t.source, { source: tag.source })}
    >
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-medium whitespace-nowrap',
          confidenceTone(tag.level),
        )}
      >
        <span aria-hidden>{compact ? level : fmt(t.badge, { level })}</span>
        <span className="sr-only">{fmt(t.aria, { level, source: tag.source })}</span>
      </span>
      {showSource ? (
        <span className="min-w-0 truncate text-sm text-muted-foreground" aria-hidden>
          {tag.source}
        </span>
      ) : null}
    </span>
  );
}
