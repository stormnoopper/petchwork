import 'server-only';
import {
  RPC,
  RawDataCatalog,
  RawDataRows,
  RawDataTable,
  type RawDataCatalog as Catalog,
  type RawDataRows as Rows,
} from '@rice/contracts';
import { createAnonClient } from '@/lib/supabase/anon';

export const PAGE_SIZE = 50;
export const CSV_MAX_ROWS = 5000;
export const MAX_OFFSET = 100_000;

export type RawRowsQuery = {
  table: RawDataTable;
  limit?: number;
  offset?: number;
  filterCol?: string | null;
  filterVal?: string | null;
};

export type RawRowsResult =
  | { ok: true; data: Rows }
  | { ok: false; reason: 'bad_filter' | 'error' };

/** Catalog of data sources + allow-listed tables (public RPC, anon). null on failure. */
export async function fetchRawDataCatalog(): Promise<Catalog | null> {
  const { data, error } = await createAnonClient().rpc(RPC.rawDataCatalog);
  if (error) return null;
  const parsed = RawDataCatalog.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** One page of rows; `bad_filter` when the DB rejects the filter column / value (22023). */
export async function fetchRawDataRows(q: RawRowsQuery): Promise<RawRowsResult> {
  const filter = q.filterCol && q.filterVal ? { col: q.filterCol, val: q.filterVal } : null;
  const { data, error } = await createAnonClient().rpc(RPC.rawDataRows, {
    p_table: q.table,
    p_limit: q.limit ?? PAGE_SIZE,
    p_offset: q.offset ?? 0,
    p_filter_col: filter?.col ?? null,
    p_filter_val: filter?.val ?? null,
  });
  if (error) return { ok: false, reason: error.code === '22023' ? 'bad_filter' : 'error' };
  const parsed = RawDataRows.safeParse(data);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: 'error' };
}

/** `ref.admin_boundaries` → validated table name, else null. */
export function parseRawTable(param: string): RawDataTable | null {
  const p = RawDataTable.safeParse(decodeURIComponent(param));
  return p.success ? p.data : null;
}

/** Cell → display / CSV text (objects as JSON, null as empty). */
export function cellText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel opens Thai text correctly. */
export function toCsv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [columns.map(esc).join(',')];
  for (const r of rows) lines.push(columns.map((c) => esc(cellText(r[c]))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
