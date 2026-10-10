import type { AnalyzeErrorCode, AnalyzeResponse } from '@rice/contracts';
import { NextResponse } from 'next/server';
import type { z } from 'zod';

type AnalyzeError = Extract<AnalyzeResponse, { ok: false }>;
export type EnabledProvince = { code: string; name_th: string };

/** Thai user-facing messages for analyze error codes (SPEC §12). */
export function analyzeMessageTh(code: AnalyzeErrorCode, provinceNameTh?: string): string {
  switch (code) {
    case 'OUTSIDE_THAILAND':
      return 'รองรับเฉพาะพื้นที่ในประเทศไทย';
    case 'PROVINCE_NOT_ENABLED':
      return provinceNameTh
        ? `จังหวัด${provinceNameTh}ยังไม่เปิดให้ประเมิน`
        : 'จังหวัดนี้ยังไม่เปิดให้ประเมิน';
    case 'INVALID_POLYGON':
      return 'รูปแปลงไม่ถูกต้อง กรุณาปักมุมแปลงใหม่ (ต้องเป็นรูปปิด ไม่ไขว้กัน และไม่ใหญ่เกิน 50 ตร.กม.)';
    case 'INTERNAL':
    default:
      return 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง';
  }
}

/** HTTP status for an analyze error (client parses the body regardless of status). */
export function analyzeErrorStatus(code: AnalyzeErrorCode, fromValidation = false): number {
  if (code === 'INTERNAL') return 500;
  if (code === 'INVALID_POLYGON' && fromValidation) return 400;
  return 422;
}

export function buildAnalyzeError(
  code: AnalyzeErrorCode,
  opts: { provinceCode?: string; provinceNameTh?: string; enabledProvinces?: EnabledProvince[] } = {},
): AnalyzeError {
  const out: AnalyzeError = { ok: false, error: code, message_th: analyzeMessageTh(code, opts.provinceNameTh) };
  if (opts.provinceCode) out.province_code = opts.provinceCode;
  if (opts.enabledProvinces) out.enabled_provinces = opts.enabledProvinces;
  return out;
}

// ---------------------------------------------------------------- generic API errors

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UPSTREAM'
  | 'INTERNAL';

const API_MESSAGES_TH: Record<ApiErrorCode, string> = {
  BAD_REQUEST: 'ข้อมูลที่ส่งมาไม่ถูกต้อง',
  UNAUTHORIZED: 'กรุณาเข้าสู่ระบบก่อน',
  NOT_FOUND: 'ไม่พบข้อมูลที่ต้องการ',
  CONFLICT: 'ข้อมูลขัดแย้งกับที่มีอยู่',
  UPSTREAM: 'บริการข้อมูลไม่ตอบสนอง กรุณาลองใหม่',
  INTERNAL: 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง',
};

const API_STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UPSTREAM: 502,
  INTERNAL: 500,
};

export interface ApiErrorBody {
  ok: false;
  error: ApiErrorCode;
  message_th: string;
  issues?: { path: string; message: string }[];
}

export function apiErrorBody(code: ApiErrorCode, issues?: z.core.$ZodIssue[]): ApiErrorBody {
  const body: ApiErrorBody = { ok: false, error: code, message_th: API_MESSAGES_TH[code] };
  if (issues?.length) {
    body.issues = issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message }));
  }
  return body;
}

export function apiError(code: ApiErrorCode, issues?: z.core.$ZodIssue[]): NextResponse<ApiErrorBody> {
  return NextResponse.json(apiErrorBody(code, issues), { status: API_STATUS[code] });
}

/** Map a PostgREST / Postgres error to an API error code. */
export function pgErrorCode(err: { code?: string; message?: string } | null | undefined): ApiErrorCode {
  switch (err?.code) {
    case '42501': // insufficient_privilege — RPC ownership check / RLS violation
    case 'PGRST116': // .single() with 0 rows
      return 'NOT_FOUND';
    case '22023': // invalid_parameter_value
    case '22P02': // invalid_text_representation (bad uuid, …)
    case '23514': // check_violation
    case '23502': // not_null_violation
      return 'BAD_REQUEST';
    case '23505':
      return 'CONFLICT';
    default:
      return 'INTERNAL';
  }
}

/** Read and JSON-parse a request body; returns `undefined` on malformed JSON. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
