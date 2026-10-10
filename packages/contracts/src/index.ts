/**
 * @rice/contracts — shared schemas for every part of the system (SPEC §15.1).
 * Owner: Orchestrator. Do NOT redeclare these types elsewhere; import from here.
 *
 * Conventions:
 * - JSON coming from Postgres RPCs keeps snake_case (FieldProfile).
 * - App-level objects (Practices, SeasonResult) use camelCase.
 * - Units are SI (m², mm, ha, kg/ha, dS/m) unless the name says otherwise.
 */
import { z } from 'zod';

// ---------------------------------------------------------------- geometry

export const LngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LngLat = z.infer<typeof LngLat>;

export const LatLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export type LatLng = z.infer<typeof LatLng>;

/** GeoJSON Polygon, single closed outer ring, [lng, lat]. Phase 1 = 4 vertices (5 positions). */
export const PolygonGeoJSON = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(LngLat).min(4)).length(1),
  })
  .refine(
    (p) => {
      const ring = p.coordinates[0]!;
      const a = ring[0]!;
      const b = ring[ring.length - 1]!;
      return a[0] === b[0] && a[1] === b[1];
    },
    { message: 'ring must be closed' },
  );
export type PolygonGeoJSON = z.infer<typeof PolygonGeoJSON>;

export const MAX_VERTICES_PHASE1 = 4;

// ---------------------------------------------------------------- enums

export const Confidence = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof Confidence>;

/** Structured confidence tag returned by RPCs and model outputs. */
export const ConfidenceTag = z.object({
  level: Confidence,
  /** short source / scale label e.g. "LDD 1:25k", "SoilGrids 250m", "fallback" */
  source: z.string(),
});
export type ConfidenceTag = z.infer<typeof ConfidenceTag>;

export const SalinityOrigin = z.enum(['inland_rock_salt', 'coastal_intrusion', 'mixed', 'none']);
export type SalinityOrigin = z.infer<typeof SalinityOrigin>;

export const SalinityLevel = z.enum(['very_high', 'high', 'moderate', 'low', 'none']);
export type SalinityLevel = z.infer<typeof SalinityLevel>;

/** 4-class display classification of ECe (SPEC §9.4). */
export const SalinityClass = z.enum(['non_saline', 'slight', 'moderate', 'severe']);
export type SalinityClass = z.infer<typeof SalinityClass>;

export const Season = z.enum(['wet', 'dry1', 'dry2']);
export type Season = z.infer<typeof Season>;

export const Variety = z.enum(['KDML105', 'RD6', 'RD15', 'RD41', 'RD47', 'PTT1', 'SPT1']);
export type Variety = z.infer<typeof Variety>;

export const Establishment = z.enum(['transplant', 'broadcast']);
export const WaterSource = z.enum(['rainfed', 'irrigated']);
export const WaterRegime = z.enum(['continuous', 'awd', 'rainfed']);

// ---------------------------------------------------------------- practices (SPEC §5.4)

export const Practices = z.object({
  variety: Variety,
  season: Season,
  /** ISO date; null = use grid planting calendar */
  plantDate: z.iso.date().nullable(),
  establishment: Establishment,
  waterSource: WaterSource,
  waterRegime: WaterRegime,
  nKgPerRai: z.number().min(0).max(100),
  organicTPerRai: z.number().min(0).max(20),
  strawBurn: z.boolean(),
  /** optional user measurements */
  measuredEcSoilDsm: z.number().min(0).max(50).nullable(),
  measuredEcWaterDsm: z.number().min(0).max(50).nullable(),
  lastYieldKgPerRai: z.number().min(0).max(2000).nullable(),
});
export type Practices = z.infer<typeof Practices>;

export const DEFAULT_PRACTICES: Practices = {
  variety: 'KDML105',
  season: 'wet',
  plantDate: null,
  establishment: 'broadcast',
  waterSource: 'rainfed',
  waterRegime: 'rainfed',
  nKgPerRai: 10,
  organicTPerRai: 0,
  strawBurn: false,
  measuredEcSoilDsm: null,
  measuredEcWaterDsm: null,
  lastYieldKgPerRai: null,
};

// ---------------------------------------------------------------- FieldProfile (RPC analyze_polygon, snake_case)

const weighted = { w: z.number().min(0).max(1.0001) };

export const ProvinceCoverage = z.object({
  province_code: z.string(),
  enabled: z.boolean(),
  salinity_origin: SalinityOrigin.nullable(),
  default_variety: Variety.nullable(),
  has_ldd_soil: z.boolean(),
  has_ldd_saline: z.boolean(),
  has_dgr: z.boolean(),
});
export type ProvinceCoverage = z.infer<typeof ProvinceCoverage>;

export const FieldProfile = z.object({
  ok: z.literal(true),
  area_m2: z.number(),
  area_rai: z.number(),
  admin: z
    .object({
      subdistrict_code: z.string().nullable(),
      subdistrict_name_th: z.string().nullable(),
      district_name_th: z.string().nullable(),
      province_code: z.string(),
      province_name_th: z.string(),
    }),
  /** LDD placeholder: empty array when ref.soil_units has no data */
  soil: z.array(
    z.object({
      soil_group: z.string().nullable(),
      texture: z.string().nullable(),
      ksat_mm_day: z.number().nullable(),
      awc_mm_m: z.number().nullable(),
      ...weighted,
    }),
  ),
  /** LDD placeholder: empty array when ref.saline_soil_zones has no data */
  saline: z.array(z.object({ salinity_level: SalinityLevel, ...weighted })),
  groundwater: z.object({
    ec_dsm_weighted: z.number().nullable(),
    depth_m_weighted: z.number().nullable(),
    parts: z.array(
      z.object({
        ec_dsm: z.number().nullable(),
        depth_m: z.number().nullable(),
        quality_class: z.string().nullable(),
        ...weighted,
      }),
    ),
  }),
  geology: z.array(
    z.object({
      unit_code: z.string().nullable(),
      is_maha_sarakham: z.boolean().nullable(),
      rock_salt_depth_m: z.number().nullable(),
      ...weighted,
    }),
  ),
  in_irrigation_zone: z.boolean(),
  nearest_water_body: z
    .object({ name: z.string().nullable(), kind: z.string().nullable(), distance_m: z.number() })
    .nullable(),
  grid: z
    .object({
      elev_m: z.number().nullable(),
      clay_pct: z.number().nullable(),
      soc_gkg: z.number().nullable(),
      rain_normal_mm: z.number().nullable(),
      et0_normal_mm: z.number().nullable(),
      plant_doy_wet: z.number().int().nullable(),
      plant_doy_dry: z.number().int().nullable(),
      si_dry_season: z.number().nullable(),
      coast_dist_km: z.number().nullable(),
      /** dry-season river/canal EC near the field (ThaiWater), coastal_intrusion input — optional until ETL provides it */
      river_ec_dry_dsm: z.number().nullable().optional(),
      weather_grid_id: z.number().int().nullable(),
    })
    .nullable(),
  coverage: ProvinceCoverage,
  confidence: z.object({
    geology: ConfidenceTag,
    groundwater: ConfidenceTag,
    soil: ConfidenceTag,
    salinity: ConfidenceTag,
  }),
  /** source_code -> snapshot version used */
  data_versions: z.record(z.string(), z.string()),
});
export type FieldProfile = z.infer<typeof FieldProfile>;

export const AnalyzeErrorCode = z.enum([
  'OUTSIDE_THAILAND',
  'PROVINCE_NOT_ENABLED',
  'INVALID_POLYGON',
  'INTERNAL',
]);
export type AnalyzeErrorCode = z.infer<typeof AnalyzeErrorCode>;

export const AnalyzeRpcError = z.object({
  ok: z.literal(false),
  error: AnalyzeErrorCode,
  province_code: z.string().optional(),
  province_name_th: z.string().optional(),
});

/** Raw result of `rpc('analyze_polygon')`. */
export const AnalyzeRpcResult = z.discriminatedUnion('ok', [FieldProfile, AnalyzeRpcError]);
export type AnalyzeRpcResult = z.infer<typeof AnalyzeRpcResult>;

// ---------------------------------------------------------------- weather (RPC weather_series)

export const WeatherDay = z.object({
  date: z.iso.date(),
  tmin: z.number().nullable(),
  tmax: z.number().nullable(),
  rain_mm: z.number(),
  rh: z.number().nullable(),
  wind_ms: z.number().nullable(),
  srad_mj: z.number().nullable(),
  et0_mm: z.number(),
});
export type WeatherDay = z.infer<typeof WeatherDay>;

// ---------------------------------------------------------------- model output (camelCase, SI)

export const Percentiles = z.object({ p10: z.number(), p50: z.number(), p90: z.number() });
export type Percentiles = z.infer<typeof Percentiles>;

export const SeasonResult = z.object({
  modelVersion: z.string(),
  season: Season,
  year: z.number().int(),
  water: z.object({
    availableMm: z.number(),
    irrigationNeedMm: z.number(),
    deficitDays: z.number().int(),
    confidence: ConfidenceTag,
  }),
  yield: z.object({
    kgPerHa: Percentiles,
    fWater: z.number(),
    fSalt: z.number(),
    fNutrient: z.number(),
    confidence: ConfidenceTag,
  }),
  ghg: z.object({
    ch4KgHa: z.number(),
    n2oKgHa: z.number(),
    co2KgHa: z.number(),
    co2eTHa: z.number(),
    /** CO2e reduction if switched to AWD (t/ha), 0 if already AWD/rainfed */
    awdSavingCo2eTHa: z.number(),
    confidence: ConfidenceTag,
  }),
  salinity: z.object({
    eceDsm: Percentiles,
    baseEceDsm: z.number(),
    class: SalinityClass,
    origin: SalinityOrigin,
    recommendations: z.array(
      z.enum(['salt_tolerant_variety', 'gypsum', 'trees_on_recharge', 'leaching', 'avoid_saline_gw', 'none']),
    ),
    confidence: ConfidenceTag,
  }),
  /** optional daily trace for charts (SPEC sim.results_daily) */
  daily: z
    .array(z.object({ date: z.string(), wMm: z.number(), eceDsm: z.number(), lai: z.number().nullable() }))
    .optional(),
});
export type SeasonResult = z.infer<typeof SeasonResult>;

// ---------------------------------------------------------------- /api/analyze

export const AnalyzeRequest = z.object({
  polygon: PolygonGeoJSON,
  practices: Practices.partial().optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequest>;

export const AnalyzeResponse = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    profile: FieldProfile,
    /** recent-years weather used so the client can recompute without refetching */
    weather: z.array(WeatherDay),
    quick: SeasonResult,
    attribution: z.array(z.string()),
  }),
  z.object({
    ok: z.literal(false),
    error: AnalyzeErrorCode,
    message_th: z.string(),
    province_code: z.string().optional(),
    enabled_provinces: z.array(z.object({ code: z.string(), name_th: z.string() })).optional(),
  }),
]);
export type AnalyzeResponse = z.infer<typeof AnalyzeResponse>;

// ---------------------------------------------------------------- fields

export const CreateFieldRequest = z.object({
  name: z.string().min(1).max(100),
  vertices: z.array(LatLng).min(3).max(64),
  polygon: PolygonGeoJSON,
  practices: Practices.partial().optional(),
});
export type CreateFieldRequest = z.infer<typeof CreateFieldRequest>;

export const Field = z.object({
  id: z.guid(),
  name: z.string(),
  vertices: z.array(LatLng),
  area_rai: z.number(),
  province_code: z.string().nullable(),
  district_code: z.string().nullable(),
  subdistrict_code: z.string().nullable(),
  is_demo: z.boolean(),
  created_at: z.string(),
});
export type Field = z.infer<typeof Field>;

export const DEMO_FIELD_ID = '00000000-0000-0000-0000-000000000001';

export const ScenarioId = z.enum(['baseline', 'awd', 'salt_tolerant', 'farm_pond', 'bund_trees']);
export type ScenarioId = z.infer<typeof ScenarioId>;

export const RunStatus = z.enum(['queued', 'running', 'done', 'failed']);

/** One row of sim.results_season (snake_case, as stored). */
export const ResultSeasonRow = z.object({
  year: z.number().int(),
  season: z.string(),
  water_avail_mm: z.number().nullable(),
  irrigation_need_mm: z.number().nullable(),
  deficit_days: z.number().int().nullable(),
  yield_p10: z.number().nullable(),
  yield_p50: z.number().nullable(),
  yield_p90: z.number().nullable(),
  ch4_kg_ha: z.number().nullable(),
  n2o_kg_ha: z.number().nullable(),
  co2e_t_ha: z.number().nullable(),
  ece_p10: z.number().nullable(),
  ece_p50: z.number().nullable(),
  ece_p90: z.number().nullable(),
  salinity_class: z.string().nullable(),
});
export type ResultSeasonRow = z.infer<typeof ResultSeasonRow>;

/** Result of `rpc('field_results')` — owner or demo field only. */
export const FieldResults = z.object({
  field_id: z.guid(),
  profile: FieldProfile.nullable(),
  computed_at: z.string().nullable(),
  runs: z.array(
    z.object({
      run_id: z.guid(),
      scenario_id: z.string(),
      status: RunStatus,
      model_version: z.string(),
      is_stale: z.boolean(),
      run_at: z.string(),
      finished_at: z.string().nullable(),
      error: z.string().nullable(),
      seasons: z.array(ResultSeasonRow),
    }),
  ),
});
export type FieldResults = z.infer<typeof FieldResults>;

// ---------------------------------------------------------------- RPC names & signatures

export const RPC = {
  /** (p_geojson jsonb) -> AnalyzeRpcResult */
  analyzePolygon: 'analyze_polygon',
  /** (p_grid_id int, p_from date, p_to date) -> WeatherDay[] */
  weatherSeries: 'weather_series',
  /** (p_layer text, z int, x int, y int) -> bytea */
  mvtTile: 'mvt_tile',
  /** (p_field_id uuid, p_scenario text) -> uuid run_id */
  enqueueTwinRun: 'enqueue_twin_run',
  /** (p_field_id uuid) -> jsonb */
  fieldResults: 'field_results',
  /** () -> { province_code, name_th }[] */
  enabledProvinces: 'enabled_provinces',
  /** () -> { source_code, version, created_at }[] latest per source */
  dataSnapshotsLatest: 'data_snapshots_latest',
  /** (p_email, p_name, p_image, p_provider_account_id) -> app.users row; uses auth.uid() from server-minted JWT */
  ensureAppUser: 'ensure_app_user',
  /** () -> RawDataCatalog (public, allow-listed ref/obs tables) */
  rawDataCatalog: 'raw_data_catalog',
  /** (p_table, p_limit, p_offset, p_filter_col, p_filter_val) -> RawDataRows */
  rawDataRows: 'raw_data_rows',
} as const;

export const MVT_LAYERS = [
  'saline_soil',
  'soil_units',
  'groundwater',
  'geology',
  'irrigation',
  'water_bodies',
] as const;
export const MvtLayer = z.enum(MVT_LAYERS);
export type MvtLayer = z.infer<typeof MvtLayer>;

// ---------------------------------------------------------------- units (SPEC §5.2)

export const M2_PER_RAI = 1600;
export const M2_PER_NGAN = 400;
export const M2_PER_SQ_WA = 4;
export const HA_PER_RAI = 0.16;

export const ATTRIBUTION_THAIWATER = 'คลังข้อมูลน้ำแห่งชาติ (สสน.)';

// ---------------------------------------------------------------- API envelopes (v0.4)

export const ApiError = z.object({
  ok: z.literal(false),
  error: z.string(),
  message_th: z.string(),
  issues: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

export const FieldDetailResponse = z.object({ field: Field, results: FieldResults.nullable() });
export type FieldDetailResponse = z.infer<typeof FieldDetailResponse>;

export const UpdateFieldRequest = z
  .object({
    name: z.string().min(1).max(100).optional(),
    vertices: z.array(LatLng).min(3).max(64).optional(),
    polygon: PolygonGeoJSON.optional(),
  })
  .refine((v) => (v.vertices === undefined) === (v.polygon === undefined), {
    message: 'vertices and polygon must be sent together',
  });
export type UpdateFieldRequest = z.infer<typeof UpdateFieldRequest>;

export const EnqueueRunRequest = z.object({ scenario_id: ScenarioId });
export type EnqueueRunRequest = z.infer<typeof EnqueueRunRequest>;

// ---------------------------------------------------------------- raw data browser (/data, D-031)

export const RAW_DATA_TABLES = [
  'ref.province_coverage',
  'ref.admin_boundaries',
  'ref.geology_units',
  'ref.groundwater_zones',
  'ref.irrigation_zones',
  'ref.soil_units',
  'ref.saline_soil_zones',
  'ref.water_bodies',
  'ref.grid_cells',
  'ref.weather_grid',
  'obs.weather_daily',
  'obs.weather_daily_proj',
  'obs.rain_station_daily',
  'obs.water_quality',
  'obs.reservoir_storage',
  'obs.gw_level',
] as const;
export const RawDataTable = z.enum(RAW_DATA_TABLES);
export type RawDataTable = z.infer<typeof RawDataTable>;

export const DataSourceStatus = z.enum(['ok', 'limited', 'placeholder', 'unavailable']);
export type DataSourceStatus = z.infer<typeof DataSourceStatus>;

export const RawDataSource = z.object({
  code: z.string(),
  name_th: z.string().nullable(),
  url: z.string().nullable(),
  license: z.string().nullable(),
  attribution_th: z.string().nullable(),
  scale: z.string().nullable(),
  refresh_tier: z.string().nullable(),
  status: DataSourceStatus.nullable(),
  target_tables: z.array(z.string()).nullable(),
  last_success_at: z.string().nullable(),
  latest_version: z.string().nullable(),
  latest_rows: z.number().nullable(),
  latest_at: z.string().nullable(),
});
export type RawDataSource = z.infer<typeof RawDataSource>;

export const RawDataTableInfo = z.object({
  table: RawDataTable,
  rows: z.number(),
  estimated: z.boolean(),
  columns: z.array(z.string()),
  sources: z.array(z.string()),
});
export type RawDataTableInfo = z.infer<typeof RawDataTableInfo>;

export const RawDataCatalog = z.object({
  sources: z.array(RawDataSource),
  tables: z.array(RawDataTableInfo),
});
export type RawDataCatalog = z.infer<typeof RawDataCatalog>;

export const RawDataRows = z.object({
  table: RawDataTable,
  columns: z.array(z.string()),
  total: z.number(),
  estimated: z.boolean(),
  limit: z.number().int(),
  offset: z.number().int(),
  rows: z.array(z.record(z.string(), z.unknown())),
});
export type RawDataRows = z.infer<typeof RawDataRows>;
