/** Minimal `{name}` interpolation for th.json strings (display layer). */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/** Thai-locale number with fixed max fraction digits; `–` for non-finite values. */
export function formatNumber(value: number, maxFractionDigits = 0): string {
  if (!Number.isFinite(value)) return '–';
  return value.toLocaleString('th-TH', {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: 0,
  });
}

/** Pick a sensible precision for small per-rai values (e.g. 0.034 t CO2e). */
export function formatAdaptive(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs < 0.1) return formatNumber(value, 3);
  if (abs < 10) return formatNumber(value, 2);
  if (abs < 100) return formatNumber(value, 1);
  return formatNumber(value, 0);
}

/** `a–b` range label; collapses to a single value when both ends round to the same text. */
export function formatRange(
  lo: number,
  hi: number,
  format: (v: number) => string = formatAdaptive,
): string {
  const a = format(lo);
  const b = format(hi);
  return a === b ? a : `${a}–${b}`;
}

/** Thai calendar date, e.g. "10 ต.ค. 2569". */
export function formatThaiDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}
