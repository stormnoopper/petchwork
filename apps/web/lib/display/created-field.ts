import { Field } from '@rice/contracts';

/** Response of POST /api/fields is `{ field, practices_saved }`; accept a bare Field too. */
export function parseCreatedField(json: unknown): Field | null {
  const candidate =
    json && typeof json === 'object' && 'field' in json ? (json as { field: unknown }).field : json;
  const parsed = Field.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
