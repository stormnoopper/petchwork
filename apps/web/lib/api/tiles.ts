import { MvtLayer } from '@rice/contracts';
import { z } from 'zod';

const int = z.string().regex(/^\d{1,8}$/).transform(Number);

/** Validates /api/tiles/[layer]/[z]/[x]/[y] params (y may carry a .pbf / .mvt suffix). */
export const TileParams = z
  .object({
    layer: MvtLayer,
    z: int,
    x: int,
    y: z.string().transform((s) => s.replace(/\.(pbf|mvt)$/, '')).pipe(int),
  })
  .refine((t) => t.z <= 22 && t.x < 2 ** t.z && t.y < 2 ** t.z, { message: 'tile out of range' });
export type TileParams = z.infer<typeof TileParams>;

export const TILE_CACHE_CONTROL = 'public, max-age=86400';
