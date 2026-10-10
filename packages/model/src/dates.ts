/** Pure calendar helpers (UTC civil days, no Date.now). Hinnant's days_from_civil. */

export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

/** 'YYYY-MM-DD' → epoch day. */
export function isoToDay(iso: string): number {
  return daysFromCivil(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)));
}

const pad = (n: number, w: number) => String(n).padStart(w, '0');

export function dayToIso(day: number): string {
  const { y, m, d } = civilFromDays(day);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/** Epoch day of day-of-year `doy` (1-based) in `year`. */
export function doyToDay(year: number, doy: number): number {
  return daysFromCivil(year, 1, 1) + doy - 1;
}

export function dayOfYear(day: number): number {
  const { y } = civilFromDays(day);
  return day - daysFromCivil(y, 1, 1) + 1;
}

export function yearOf(day: number): number {
  return civilFromDays(day).y;
}
