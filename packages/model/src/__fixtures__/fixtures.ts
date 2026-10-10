/**
 * Synthetic test fixtures — Maha Sarakham-like field (inland rock salt, KTms) with a
 * deterministic monsoon climate (rain mainly May–Oct). NOT real data.
 */
import type { FieldProfile, Practices, WeatherDay } from '@rice/contracts';
import { DEFAULT_PRACTICES } from '@rice/contracts';
import { daysFromCivil, dayToIso, civilFromDays } from '../dates';

/** Mulberry32 PRNG — deterministic. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// month index 1..12 → [rain probability, mean wet-day rain mm, ET0 mm/d]
const CLIM: Record<number, [number, number, number]> = {
  1: [0.03, 5, 3.6],
  2: [0.06, 8, 4.2],
  3: [0.12, 10, 5.0],
  4: [0.25, 12, 5.4],
  5: [0.45, 13, 4.8],
  6: [0.5, 12, 4.2],
  7: [0.55, 12, 4.0],
  8: [0.6, 14, 3.9],
  9: [0.6, 15, 3.8],
  10: [0.35, 12, 3.8],
  11: [0.1, 8, 3.7],
  12: [0.03, 5, 3.5],
};

/** Daily weather from `fromYear`-01-01 to `toYear`-12-31 with year-to-year rain variability. */
export function makeWeather(fromYear = 2016, toYear = 2025, seed = 44): WeatherDay[] {
  const r = rng(seed);
  const out: WeatherDay[] = [];
  const a = daysFromCivil(fromYear, 1, 1);
  const b = daysFromCivil(toYear, 12, 31);
  let yearFactor = 1;
  let curYear = -1;
  for (let d = a; d <= b; d++) {
    const { y, m } = civilFromDays(d);
    if (y !== curYear) {
      curYear = y;
      yearFactor = 0.6 + 0.8 * r(); // dry vs wet years
    }
    const [prob, mean, et0] = CLIM[m]!;
    const rain = r() < prob ? -Math.log(1 - r()) * mean * yearFactor : 0;
    out.push({
      date: dayToIso(d),
      tmin: 22,
      tmax: 33,
      rain_mm: Math.round(rain * 10) / 10,
      rh: 75,
      wind_ms: 1.5,
      srad_mj: 18,
      et0_mm: et0 * (0.9 + 0.2 * r()),
    });
  }
  return out;
}

const coverageMsk = {
  province_code: '44',
  enabled: true,
  salinity_origin: 'inland_rock_salt' as const,
  default_variety: 'KDML105' as const,
  has_ldd_soil: false,
  has_ldd_saline: false,
  has_dgr: true,
};

/** LDD placeholder case: soil [] and saline [] (SPEC §12). */
export const profileLddEmpty: FieldProfile = {
  ok: true,
  area_m2: 16000,
  area_rai: 10,
  admin: {
    subdistrict_code: '440101',
    subdistrict_name_th: 'ตลาด',
    district_name_th: 'เมืองมหาสารคาม',
    province_code: '44',
    province_name_th: 'มหาสารคาม',
  },
  soil: [],
  saline: [],
  groundwater: {
    ec_dsm_weighted: 2.5,
    depth_m_weighted: 1.8,
    parts: [{ ec_dsm: 2.5, depth_m: 1.8, quality_class: 'brackish', w: 1 }],
  },
  geology: [{ unit_code: 'KTms', is_maha_sarakham: true, rock_salt_depth_m: 80, w: 1 }],
  in_irrigation_zone: false,
  nearest_water_body: { name: 'ลำน้ำชี', kind: 'river', distance_m: 2500 },
  grid: {
    elev_m: 150,
    clay_pct: 18,
    soc_gkg: 5,
    rain_normal_mm: 1250,
    et0_normal_mm: 1550,
    plant_doy_wet: 182,
    plant_doy_dry: 15,
    si_dry_season: 0.24,
    coast_dist_km: 450,
    weather_grid_id: 1,
  },
  coverage: coverageMsk,
  confidence: {
    geology: { level: 'medium', source: 'DMR 1:250k' },
    groundwater: { level: 'medium', source: 'DGR 1:100k' },
    soil: { level: 'low', source: 'SoilGrids 250m' },
    salinity: { level: 'low', source: 'fallback' },
  },
  data_versions: { dmr: 'seed', dgr: 'seed' },
};

/** Same field with LDD data present. */
export const profileWithLdd: FieldProfile = {
  ...profileLddEmpty,
  soil: [
    { soil_group: '17', texture: 'loamy sand', ksat_mm_day: 6, awc_mm_m: 110, w: 0.6 },
    { soil_group: '22', texture: 'sandy loam', ksat_mm_day: 10, awc_mm_m: 100, w: 0.4 },
  ],
  saline: [{ salinity_level: 'moderate', w: 0.7 }],
  coverage: { ...coverageMsk, has_ldd_soil: true, has_ldd_saline: true },
  confidence: {
    ...profileLddEmpty.confidence,
    soil: { level: 'medium', source: 'LDD 1:25k' },
    salinity: { level: 'medium', source: 'LDD 1:25k' },
  },
};

/** Coastal-intrusion field (e.g. lower central plain), LDD empty, irrigated zone. */
export const profileCoastal: FieldProfile = {
  ...profileLddEmpty,
  admin: { ...profileLddEmpty.admin, province_code: '74', province_name_th: 'สมุทรสาคร' },
  groundwater: { ec_dsm_weighted: null, depth_m_weighted: null, parts: [] },
  geology: [],
  in_irrigation_zone: true,
  grid: {
    ...profileLddEmpty.grid!,
    clay_pct: 45,
    si_dry_season: 0.2,
    coast_dist_km: 10,
    plant_doy_dry: 20,
  },
  coverage: {
    ...coverageMsk,
    province_code: '74',
    salinity_origin: 'coastal_intrusion',
    default_variety: 'PTT1',
  },
};

export const practicesIrrigated: Practices = {
  ...DEFAULT_PRACTICES,
  variety: 'RD41',
  waterSource: 'irrigated',
  waterRegime: 'continuous',
  establishment: 'transplant',
  nKgPerRai: 15,
};

export const practicesDefault: Practices = { ...DEFAULT_PRACTICES };
