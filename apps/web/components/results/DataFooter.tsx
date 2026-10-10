import type { FieldProfile } from '@rice/contracts';
import { MODEL_VERSION } from '@rice/model';
import { attributionLines, formatDataVersions } from '@/lib/display/attribution';
import { fmt } from '@/lib/display/fmt';
import th from '@/messages/th.json';
import { ConfidenceBadge } from './ConfidenceBadge';

const t = th.results;
const LAYERS = ['soil', 'salinity', 'groundwater', 'geology'] as const;

/** Per-layer input confidence (SPEC §13: never hide that a value is a fallback estimate). */
export function SourcesList({ profile }: { profile: FieldProfile }) {
  const anyLow = LAYERS.some((k) => profile.confidence[k].level === 'low');
  return (
    <section
      aria-label={t.sources.title}
      className="flex flex-col gap-2 rounded-xl border p-4 break-inside-avoid"
    >
      <h3 className="text-base font-semibold">{t.sources.title}</h3>
      <dl className="flex flex-col gap-1.5">
        {LAYERS.map((k) => (
          <div key={k} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <dt className="text-base">{t.sources[k]}</dt>
            <dd className="min-w-0">
              <ConfidenceBadge tag={profile.confidence[k]} />
            </dd>
          </div>
        ))}
      </dl>
      {anyLow ? <p className="text-sm text-muted-foreground">{t.sources.fallbackNote}</p> : null}
    </section>
  );
}

/** Data version + model version + attribution + disclaimer. */
export function DataFooter({
  profile,
  attribution = [],
  modelVersion = MODEL_VERSION,
}: {
  profile: FieldProfile;
  attribution?: readonly string[];
  modelVersion?: string;
}) {
  const lines = attributionLines(profile, attribution);
  return (
    <footer className="flex flex-col gap-1.5 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{t.disclaimer}</p>
      <p>
        {fmt(t.dataVersion, {
          version: formatDataVersions(profile.data_versions),
          model: modelVersion,
        })}
      </p>
      {lines.length > 0 ? (
        <p>
          {t.attributionTitle}: {lines.join(' · ')}
        </p>
      ) : null}
    </footer>
  );
}
