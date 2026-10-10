import { MVT_LAYERS, type MvtLayer, type ProvinceCoverage } from '@rice/contracts';
import type { ExpressionSpecification } from 'maplibre-gl';

/**
 * Pure styling + availability logic for the SPEC §5.3 LayerToggle.
 * Colour ramps are defined once as RGBA constants; the JS helpers (legend, tests) and the
 * MapLibre data-driven expressions (`fillColorExpr` / `lineColorExpr`) are both derived from them.
 * Feature property names follow `public.mvt_tile` (supabase/migrations/20261010000500_rpc.sql);
 * the MVT layer name inside each tile (`source-layer`) equals the contract layer name.
 */

export type RGBA = [number, number, number, number];

/** Which LDD layers have data. UI-local (derived from `profile.coverage.has_ldd_*`). */
export type LayerAvailability = { soil: boolean; saline: boolean };

export const NO_LDD: LayerAvailability = { soil: false, saline: false };

/** LDD layers that must be hidden while the LDD tables are empty (LDD placeholder, SPEC §12). */
const LDD_REQUIREMENT: Partial<Record<MvtLayer, keyof LayerAvailability>> = {
  saline_soil: 'saline',
  soil_units: 'soil',
};

/** Layers to offer as toggles, in contract order; LDD layers only when their data exists. */
export function visibleLayers(availability: LayerAvailability = NO_LDD): MvtLayer[] {
  return MVT_LAYERS.filter((l) => {
    const req = LDD_REQUIREMENT[l];
    return req ? availability[req] === true : true;
  });
}

/** Drop enabled layers that are no longer offered (e.g. LDD became unavailable). */
export function pruneEnabled(
  enabled: readonly MvtLayer[],
  availability: LayerAvailability = NO_LDD,
): MvtLayer[] {
  const offered = new Set(visibleLayers(availability));
  return enabled.filter((l) => offered.has(l));
}

/** Map `profile.coverage` from /api/analyze to availability; missing coverage → no LDD. */
export function availabilityFromCoverage(
  coverage: Pick<ProvinceCoverage, 'has_ldd_soil' | 'has_ldd_saline'> | null | undefined,
): LayerAvailability {
  return { soil: coverage?.has_ldd_soil === true, saline: coverage?.has_ldd_saline === true };
}

/** Toggle membership while keeping contract order (stable map layer order). */
export function toggleLayer(enabled: readonly MvtLayer[], layer: MvtLayer): MvtLayer[] {
  const set = new Set(enabled);
  if (set.has(layer)) set.delete(layer);
  else set.add(layer);
  return MVT_LAYERS.filter((l) => set.has(l));
}

// ------------------------------------------------------------------ colours

const TRANSPARENT: RGBA = [0, 0, 0, 0];
const FILL_ALPHA = 130;

export const SALINE_COLORS = {
  low: [253, 224, 71, FILL_ALPHA], // yellow-300
  moderate: [245, 158, 11, FILL_ALPHA], // amber-500
  high: [234, 88, 12, FILL_ALPHA], // orange-600
  very_high: [220, 38, 38, FILL_ALPHA], // red-600
} as const satisfies Record<string, RGBA>;

/** ref.saline_soil_zones.salinity_level → yellow→red; 'none' / unknown → transparent. */
export function salineColor(level: unknown): RGBA {
  return typeof level === 'string' && level in SALINE_COLORS
    ? [...SALINE_COLORS[level as keyof typeof SALINE_COLORS]]
    : TRANSPARENT;
}

export const GW_FRESH_MAX_DSM = 0.75;
export const GW_BRACKISH_MAX_DSM = 2;
export const GW_COLORS = {
  fresh: [37, 99, 235, FILL_ALPHA], // blue-600
  brackish: [249, 115, 22, FILL_ALPHA], // orange-500
  saline: [220, 38, 38, FILL_ALPHA], // red-600
  unknown: [148, 163, 184, 90], // slate-400
} as const satisfies Record<string, RGBA>;

/** ref.groundwater_zones.ec_dsm: ≤0.75 blue · >0.75 orange · >2 red · null grey. */
export function groundwaterColor(ecDsm: unknown): RGBA {
  const ec = typeof ecDsm === 'string' ? Number(ecDsm) : ecDsm;
  if (typeof ec !== 'number' || !Number.isFinite(ec)) return [...GW_COLORS.unknown];
  if (ec > GW_BRACKISH_MAX_DSM) return [...GW_COLORS.saline];
  if (ec > GW_FRESH_MAX_DSM) return [...GW_COLORS.brackish];
  return [...GW_COLORS.fresh];
}

export const GEOLOGY_COLORS = {
  ktms: [192, 38, 211, 150], // fuchsia-600
  other: [148, 163, 184, 40], // slate-400, faint
} as const satisfies Record<string, RGBA>;

/** Maha Sarakham Formation (rock salt) = `is_maha_sarakham` or unit code starting with KTms. */
export function isMahaSarakham(
  props: { is_maha_sarakham?: unknown; unit_code?: unknown } | null | undefined,
): boolean {
  if (!props) return false;
  if (
    props.is_maha_sarakham === true ||
    props.is_maha_sarakham === 't' ||
    props.is_maha_sarakham === 'true'
  )
    return true;
  return typeof props.unit_code === 'string' && /^ktms/i.test(props.unit_code.trim());
}

export function geologyColor(props: Parameters<typeof isMahaSarakham>[0]): RGBA {
  return [...(isMahaSarakham(props) ? GEOLOGY_COLORS.ktms : GEOLOGY_COLORS.other)];
}

export const IRRIGATION_COLOR: RGBA = [56, 189, 248, 70]; // sky-400 translucent
export const WATER_COLOR: RGBA = [29, 78, 216, 170]; // blue-700

/** Categorical palette for soil groups (Okabe–Ito-ish, distinguishable on satellite imagery). */
const SOIL_PALETTE: RGBA[] = [
  [230, 159, 0, FILL_ALPHA],
  [86, 180, 233, FILL_ALPHA],
  [0, 158, 115, FILL_ALPHA],
  [240, 228, 66, FILL_ALPHA],
  [0, 114, 178, FILL_ALPHA],
  [213, 94, 0, FILL_ALPHA],
  [204, 121, 167, FILL_ALPHA],
  [160, 120, 80, FILL_ALPHA],
];

/** Deterministic colour per soil_group (same group → same colour on every tile). */
export function soilGroupColor(group: unknown): RGBA {
  if (group === null || group === undefined || group === '') return [148, 163, 184, 60];
  const s = String(group);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return [...SOIL_PALETTE[h % SOIL_PALETTE.length]!];
}

/** Opaque outline colour derived from a fill. */
export function outline(c: RGBA, alpha = 220): RGBA {
  return [c[0], c[1], c[2], c[3] === 0 ? 0 : alpha];
}

// ------------------------------------------------------------------ legend

/** Legend rows per layer: [messages key under layers.legend, swatch]. 'soil_units' uses a multi-swatch. */
export const LEGEND: Record<MvtLayer, { key: string; colors: RGBA[] }[]> = {
  saline_soil: [
    { key: 'saline_low', colors: [SALINE_COLORS.low] },
    { key: 'saline_moderate', colors: [SALINE_COLORS.moderate] },
    { key: 'saline_high', colors: [SALINE_COLORS.high] },
    { key: 'saline_very_high', colors: [SALINE_COLORS.very_high] },
  ],
  soil_units: [{ key: 'soil_units', colors: SOIL_PALETTE.slice(0, 4) }],
  groundwater: [
    { key: 'gw_fresh', colors: [GW_COLORS.fresh] },
    { key: 'gw_brackish', colors: [GW_COLORS.brackish] },
    { key: 'gw_saline', colors: [GW_COLORS.saline] },
  ],
  geology: [
    { key: 'geology_ktms', colors: [GEOLOGY_COLORS.ktms] },
    { key: 'geology_other', colors: [GEOLOGY_COLORS.other] },
  ],
  irrigation: [{ key: 'irrigation', colors: [IRRIGATION_COLOR] }],
  water_bodies: [{ key: 'water_bodies', colors: [WATER_COLOR] }],
};

/** CSS colour for a legend swatch (alpha bumped so translucent fills stay visible on white). */
export function cssColor(c: RGBA): string {
  const a = Math.max(c[3], 110) / 255;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a.toFixed(2)})`;
}

/**
 * Tile URL template for a MapLibre vector source (route: app/api/tiles/[layer]/[z]/[x]/[y]).
 * MapLibre fetches tiles from a worker, so pass `window.location.origin` to get an absolute URL.
 */
export function tileUrl(layer: MvtLayer, origin = ''): string {
  return `${origin}/api/tiles/${layer}/{z}/{x}/{y}`;
}

// ------------------------------------------------------------------ MapLibre expressions

type Paint = (c: RGBA) => RGBA;
const asIs: Paint = (c) => c;

/** RGBA (alpha 0–255) → CSS colour string accepted by MapLibre paint properties. */
export function rgbaCss(c: RGBA): string {
  const a = Math.round((c[3] / 255) * 1000) / 1000;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
}

/** Soil groups expressible without a hash function: LDD groups 1–62 (others → grey). */
const SOIL_GROUP_KEYS = Array.from({ length: 62 }, (_, i) => String(i + 1));

function colorExpr(layer: MvtLayer, paint: Paint): ExpressionSpecification | string {
  const c = (x: RGBA) => rgbaCss(paint(x));
  switch (layer) {
    case 'saline_soil':
      return [
        'match',
        ['to-string', ['get', 'salinity_level']],
        ...(Object.keys(SALINE_COLORS) as (keyof typeof SALINE_COLORS)[]).flatMap((k) => [
          k,
          c([...SALINE_COLORS[k]]),
        ]),
        c(TRANSPARENT),
      ] as ExpressionSpecification;
    case 'groundwater': {
      // to-number(null) is 0 → test null first; unparsable strings fall back to -1 (unknown)
      const ec: ExpressionSpecification = ['to-number', ['get', 'ec_dsm'], -1];
      return [
        'case',
        ['==', ['get', 'ec_dsm'], null],
        c([...GW_COLORS.unknown]),
        ['<', ec, 0],
        c([...GW_COLORS.unknown]),
        ['>', ec, GW_BRACKISH_MAX_DSM],
        c([...GW_COLORS.saline]),
        ['>', ec, GW_FRESH_MAX_DSM],
        c([...GW_COLORS.brackish]),
        c([...GW_COLORS.fresh]),
      ];
    }
    case 'geology': {
      // isMahaSarakham(): flag true/'t'/'true', or unit_code /^\s*ktms/i
      const code: ExpressionSpecification = ['downcase', ['to-string', ['get', 'unit_code']]];
      const at: ExpressionSpecification = ['index-of', 'ktms', code];
      return [
        'case',
        ['in', ['to-string', ['get', 'is_maha_sarakham']], ['literal', ['true', 't']]],
        c([...GEOLOGY_COLORS.ktms]),
        [
          'all',
          ['>=', at, 0],
          ['in', ['slice', code, 0, at], ['literal', ['', ' ', '  ', '\t']]],
        ],
        c([...GEOLOGY_COLORS.ktms]),
        c([...GEOLOGY_COLORS.other]),
      ];
    }
    case 'soil_units':
      return [
        'match',
        ['to-string', ['get', 'soil_group']],
        ...SOIL_GROUP_KEYS.flatMap((k) => [k, c(soilGroupColor(k))]),
        c(soilGroupColor(null)),
      ] as ExpressionSpecification;
    case 'irrigation':
      return c(IRRIGATION_COLOR);
    case 'water_bodies':
      return c(WATER_COLOR);
  }
}

/** `fill-color` for a contract layer — same ramp as the JS helpers above. */
export function fillColorExpr(layer: MvtLayer): ExpressionSpecification | string {
  return colorExpr(layer, asIs);
}

/** `line-color` / `circle-stroke-color`: opaque outline of the fill (transparent stays transparent). */
export function lineColorExpr(layer: MvtLayer): ExpressionSpecification | string {
  return colorExpr(layer, (x) => outline(x));
}

export function lineWidth(layer: MvtLayer): number {
  return layer === 'water_bodies' ? 2 : 1;
}
