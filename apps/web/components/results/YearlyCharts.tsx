'use client';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatAdaptive, formatNumber } from '@/lib/display/fmt';
import type { YearPoint } from '@/lib/display/results';
import th from '@/messages/th.json';

const t = th.results.chart;
const INK = 'var(--color-primary)';
const BAND = 'color-mix(in oklch, var(--color-primary) 18%, transparent)';
const AXIS = { fontSize: 12, fill: '#525252' };

export type YearlyChartsProps = {
  data: YearPoint[];
  /** across-year yield P10–P90 (กก./ไร่) */
  band: { lo: number; hi: number };
};

/**
 * Two small charts (no dual axis): yearly yield with the P10–P90 band, and yearly ECe.
 * Loaded via next/dynamic ssr:false (SPEC §5.5).
 */
export default function YearlyCharts({ data, band }: YearlyChartsProps) {
  if (data.length === 0) return <p className="text-base text-muted-foreground">{t.empty}</p>;
  const rows = data.map((d) => ({ ...d, band: [band.lo, band.hi] as [number, number] }));
  return (
    <div className="grid gap-4 xl:grid-cols-2 print:grid-cols-2">
      <figure className="min-w-0">
        <figcaption className="text-base font-medium">{t.yieldTitle}</figcaption>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke="#e5e5e5" />
              <XAxis
                dataKey="year"
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={[0, 'auto']}
              />
              <Tooltip
                formatter={(v, name) =>
                  name === 'band'
                    ? [
                        Array.isArray(v)
                          ? `${formatNumber(Number(v[0]))}–${formatNumber(Number(v[1]))}`
                          : '',
                        t.band,
                      ]
                    : [formatNumber(Number(v)), t.yield]
                }
                labelFormatter={(l) => `${t.year} ${l}`}
              />
              <Area dataKey="band" stroke="none" fill={BAND} isAnimationActive={false} />
              <Line
                dataKey="yieldKgRai"
                stroke={INK}
                strokeWidth={2}
                dot={{ r: 4 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-sm text-muted-foreground">{t.yieldCaption}</p>
      </figure>
      <figure className="min-w-0">
        <figcaption className="text-base font-medium">{t.eceTitle}</figcaption>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid vertical={false} stroke="#e5e5e5" />
              <XAxis
                dataKey="year"
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={[0, 'auto']}
              />
              <Tooltip
                formatter={(v) => [formatAdaptive(Number(v)), t.ece]}
                labelFormatter={(l) => `${t.year} ${l}`}
              />
              <Line
                dataKey="eceDsm"
                stroke={INK}
                strokeWidth={2}
                dot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
      <table className="sr-only">
        <caption>{t.tableSummary}</caption>
        <thead>
          <tr>
            <th scope="col">{t.year}</th>
            <th scope="col">{t.yield}</th>
            <th scope="col">{t.ece}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.year}>
              <th scope="row">{d.year}</th>
              <td>{formatNumber(d.yieldKgRai)}</td>
              <td>{formatAdaptive(d.eceDsm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
