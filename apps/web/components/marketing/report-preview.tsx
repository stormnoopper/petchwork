import th from '@/messages/th.json';

const t = th.landing.report;

// Illustrative 10-year yield fan (kg/rai). Static sample data, not a model output.
const YEARS = 11;
const MEDIAN = [380, 378, 375, 374, 370, 368, 365, 362, 360, 357, 355];
const P10 = [300, 292, 285, 278, 270, 262, 255, 248, 240, 233, 225];
const P90 = [440, 445, 448, 452, 455, 458, 460, 463, 466, 468, 470];

const W = 320;
const H = 160;
const PAD = { l: 34, r: 8, t: 8, b: 22 };
const Y_MIN = 200;
const Y_MAX = 500;

const x = (i: number) => PAD.l + (i / (YEARS - 1)) * (W - PAD.l - PAD.r);
const y = (v: number) => PAD.t + (1 - (v - Y_MIN) / (Y_MAX - Y_MIN)) * (H - PAD.t - PAD.b);

const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
const band =
  line(P90) +
  ' ' +
  [...P10]
    .map((v, i) => [v, i] as const)
    .reverse()
    .map(([v, i]) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ') +
  ' Z';

const MINI = th.landing.results.items;

export function ReportPreview() {
  return (
    <figure className="mx-auto w-full max-w-md rounded-3xl border-8 border-foreground/85 bg-card p-4 shadow-xl">
      <div className="space-y-1 border-b pb-3">
        <p className="text-lg font-semibold">{t.fieldName}</p>
        <p className="text-base text-muted-foreground">{t.fieldMeta}</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 py-3">
        {MINI.map((m) => (
          <div key={m.key} className="rounded-lg bg-muted p-2">
            <dt className="text-sm text-muted-foreground">{m.title}</dt>
            <dd className="text-base font-semibold leading-snug">{m.value}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-2">
        <p className="text-base font-medium">{t.chartTitle}</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
          {[200, 300, 400, 500].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.12} />
              <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="currentColor" fillOpacity={0.7}>
                {v}
              </text>
            </g>
          ))}
          {[0, 5, 10].map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.7}>
              {2569 + i}
            </text>
          ))}
          <path d={band} fill="var(--primary)" fillOpacity={0.18} />
          <path d={line(MEDIAN)} fill="none" stroke="var(--primary)" strokeWidth={2.5} />
        </svg>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-primary" aria-hidden />
            {t.legendMedian}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-4 rounded-sm bg-primary/20" aria-hidden />
            {t.legendRange}
          </span>
        </div>
      </div>
      <figcaption className="mt-3 text-base text-muted-foreground">{t.chartCaption}</figcaption>
    </figure>
  );
}
