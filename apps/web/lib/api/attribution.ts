import { ATTRIBUTION_THAIWATER } from '@rice/contracts';

/** source_code → attribution text (mirrors meta.data_sources.attribution_th, which anon cannot read). */
export const SOURCE_ATTRIBUTION: Record<string, string> = {
  dmr_rock_250k: 'กรมทรัพยากรธรณี',
  ldd_soil: 'กรมพัฒนาที่ดิน',
  ldd_saline: 'กรมพัฒนาที่ดิน',
  dgr_groundwater: 'กรมทรัพยากรน้ำบาดาล',
  thaiwater: ATTRIBUTION_THAIWATER,
  tmd: 'กรมอุตุนิยมวิทยา',
  gistda_irrigation: 'GISTDA',
  gistda_admin: 'GISTDA',
  gistda_rice_calendar: 'GISTDA',
  hdx_codab: 'OCHA HDX',
  era5_land: 'Copernicus Climate Change Service',
  open_meteo: 'Open-Meteo.com',
  nasa_power: 'NASA POWER Project',
  soilgrids: 'ISRIC SoilGrids',
  chirps: 'UCSB CHC',
  jrc_gsw: 'EC JRC / Google',
  cop_dem: 'Copernicus DEM',
  sentinel2: 'Copernicus Sentinel-2',
  nex_gddp_cmip6: 'NASA NEX',
};

/** ThaiWater attribution is mandatory on every result (SPEC §12); other sources come from data_versions. */
const ALWAYS = ['thaiwater'];

/** Unique attribution lines for the sources used; ThaiWater is always included (SPEC §12). */
export function buildAttribution(dataVersions: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const code of [...ALWAYS, ...Object.keys(dataVersions)]) {
    const a = SOURCE_ATTRIBUTION[code];
    if (a) out.add(a);
  }
  return [...out];
}
