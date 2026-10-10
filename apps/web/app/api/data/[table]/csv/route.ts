import { NextResponse, type NextRequest } from 'next/server';
import { CSV_MAX_ROWS, fetchRawDataRows, parseRawTable, toCsv } from '@/lib/api/raw-data';

export const dynamic = 'force-dynamic';

/** GET /api/data/{table}/csv?col=&val= → first CSV_MAX_ROWS rows (same filter as the viewer). */
export async function GET(request: NextRequest, ctx: { params: Promise<{ table: string }> }) {
  const table = parseRawTable((await ctx.params).table);
  if (!table) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  const sp = request.nextUrl.searchParams;
  const res = await fetchRawDataRows({
    table,
    limit: CSV_MAX_ROWS,
    offset: 0,
    filterCol: sp.get('col'),
    filterVal: sp.get('val'),
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: res.reason === 'bad_filter' ? 'BAD_FILTER' : 'INTERNAL' },
      { status: res.reason === 'bad_filter' ? 400 : 502 },
    );
  }
  const suffix = sp.get('col') && sp.get('val') ? `_${sp.get('col')}-${sp.get('val')}` : '';
  const filename = `${table}${suffix}`.replace(/[^\w.-]+/g, '_') + '.csv';
  return new NextResponse(toCsv(res.data.columns, res.data.rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'public, max-age=300',
    },
  });
}
