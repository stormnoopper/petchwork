import {
  CreateFieldRequest,
  Field,
  FieldResults,
  ScenarioId,
  type Practices,
  type PolygonGeoJSON,
} from '@rice/contracts';
import { z } from 'zod';

/** Columns returned for a `Field` (contracts). */
export const FIELD_COLUMNS =
  'id,name,vertices,area_rai,province_code,district_code,subdistrict_code,is_demo,created_at';

/** EWKT for PostgREST → PostGIS geometry(Polygon,4326) input. */
export function polygonToEwkt(polygon: PolygonGeoJSON): string {
  const ring = polygon.coordinates[0]!.map(([x, y]) => `${x} ${y}`).join(',');
  return `SRID=4326;POLYGON((${ring}))`;
}

/** Row for app.field_practices (only columns the table has; measured EC / last yield are not stored here). */
export function practicesToRow(fieldId: string, p: Partial<Practices>) {
  return {
    field_id: fieldId,
    season_year: p.plantDate ? Number(p.plantDate.slice(0, 4)) : null,
    season: p.season ?? null,
    variety: p.variety ?? null,
    plant_date: p.plantDate ?? null,
    establishment: p.establishment ?? null,
    water_source: p.waterSource ?? null,
    water_regime: p.waterRegime ?? null,
    n_kg_rai: p.nKgPerRai ?? null,
    organic_t_rai: p.organicTPerRai ?? null,
    straw_burn: p.strawBurn ?? null,
  };
}

/**
 * zod v4 `z.uuid()` is RFC-strict and rejects DEMO_FIELD_ID (00000000-…-0001, no version nibble).
 * TODO(contracts): switch Field.id / FieldResults.field_id to `z.guid()` upstream, then drop these.
 */
export const FieldId = z.guid();
const FieldRow = Field.extend({ id: FieldId });
export const FieldResultsLoose = FieldResults.extend({ field_id: FieldId });

/** Parse a DB row into `Field` (numeric columns may arrive as strings). */
export function toField(row: unknown): Field {
  const r = row as Record<string, unknown>;
  return FieldRow.parse({ ...r, area_rai: r.area_rai == null ? 0 : Number(r.area_rai) });
}

/** PATCH body: rename and/or move vertices (vertices + polygon must come together). */
export const UpdateFieldRequest = CreateFieldRequest.pick({ name: true, vertices: true, polygon: true })
  .partial()
  .refine((b) => (b.vertices === undefined) === (b.polygon === undefined), {
    message: 'vertices and polygon must be sent together',
  })
  .refine((b) => b.name !== undefined || b.polygon !== undefined, { message: 'nothing to update' });
export type UpdateFieldRequest = z.infer<typeof UpdateFieldRequest>;

export const EnqueueRunRequest = z.object({ scenario_id: ScenarioId });

/** Response of GET /api/fields/[id]. */
export interface FieldDetail {
  field: Field;
  results: FieldResults | null;
}
