# DATA_SOURCES — Thai Rice Digital Twin

> ผล probe จริงด้วย `curl` เมื่อ **2026-10-10** (จาก macOS, เครือข่ายไทย) · วางไฟล์นี้ที่ `docs/DATA_SOURCES.md`
> พื้นที่ทดสอบ: มหาสารคาม (bbox `102.85,15.6,103.55,16.6`) และขอนแก่น (`16.43, 102.83`)
> สถานะ: ✅ ดึงได้อัตโนมัติ · ⚠️ ได้แต่มีข้อจำกัด · ⏸ placeholder (ยังไม่มีช่องทาง) · ❌ ใช้ไม่ได้

## สรุป

| # | แหล่ง | ใช้กับตาราง | สถานะ | Auth | Format | รอบ |
|---|---|---|---|---|---|---|
| 1 | DMR หน่วยหิน 1:250k | `ref.geology_units` | ✅ | ไม่ต้อง | ArcGIS REST → GeoJSON | semiannual |
| 2 | **LDD ชุดดิน / ดินเค็ม** | `ref.soil_units`, `ref.saline_soil_zones` | ⏸ | – | shapefile (ต้องขอ) | manual |
| 3 | DGR แผนที่น้ำบาดาล 1:100k | `ref.groundwater_zones` | ⚠️ 62/77 จังหวัด | ไม่ต้อง | `.rar` / `.zip` | semiannual |
| 4 | ThaiWater (สสน.) | `obs.reservoir_storage`, `obs.water_quality`, ฝน | ✅ license ไม่ชัด | ไม่ต้อง (public) | JSON | daily |
| 5 | TMD | bias-correct เท่านั้น | ⚠️ ไม่มีย้อนหลัง | key | JSON | daily |
| 6 | GISTDA เขตชลประทาน | `ref.irrigation_zones` | ✅ | ไม่ต้อง | ArcGIS REST | semiannual |
| 7 | GISTDA ขอบเขตจังหวัด/อำเภอ 1:50k | `ref.admin_boundaries` | ✅ | ไม่ต้อง | ArcGIS REST | semiannual |
| 8 | HDX COD-AB (ตำบล) | `ref.admin_boundaries` (subdistrict) | ✅ | ไม่ต้อง | zip 437 MB | semiannual |
| 9 | ERA5-Land (Open-Meteo S3 / CDS) | `obs.weather_daily` backfill | ✅ | ไม่ต้อง (S3) / account (CDS) | Open-Meteo `.om` / NetCDF | static |
| 10 | Open-Meteo API | `obs.weather_daily` รายวัน + พยากรณ์ | ✅ | ไม่ต้อง (free 10k call/วัน) | JSON | daily |
| 11 | NASA POWER | สำรองอากาศ | ✅ | ไม่ต้อง | JSON | – |
| 12 | SoilGrids 250m | `ref.grid_cells.sg_*` (+ fallback LDD) | ✅ อ่าน COG | ไม่ต้อง | COG / REST | semiannual |
| 13 | CHIRPS | ฝน (grid) | ✅ | ไม่ต้อง | GeoTIFF | quarterly |
| 14 | JRC Global Surface Water | แหล่งน้ำ | ✅ | ไม่ต้อง | GeoTIFF (97 MB/tile) | semiannual |
| 15 | Copernicus DEM GLO-30 | `ref.grid_cells.elev_m/slope_pct` | ✅ | ไม่ต้อง | COG (43 MB/tile) | static |
| 16 | NEX-GDDP-CMIP6 | `obs.weather_daily_proj` | ✅ | ไม่ต้อง | NetCDF (S3) | static |
| 17 | GISTDA พื้นที่ปลูกข้าวรายครึ่งเดือน 2015–2018 | ปฏิทินปลูก `plant_doy_*` | ✅ | ไม่ต้อง | ArcGIS REST | static |

---

## รายละเอียดต่อแหล่ง

### 1. DMR — หน่วยหิน 1:250,000 ✅
- Service: `https://gisportal.dmr.go.th/arcgis/rest/services/GEOL/ROCK_UNIT_250K/MapServer/0`
- Capabilities `Map,Query,Data` · `maxRecordCount = 2000` → แบ่งหน้าด้วย `resultOffset`
- ทั้งประเทศ **7,093 polygon** · `TEXT_SYM='KTms'` (หมวดหินมหาสารคาม) **21 polygon**
- Fields: `OBJECTID, TEXT_SYM, YEAR_COMPI, ...AREA, Shape.STArea(), Shape.STLength()`
- ตัวอย่าง:
  ```
  .../query?where=1%3D1&geometry=103.2,16.0,103.3,16.1&geometryType=esriGeometryEnvelope
           &inSR=4326&outSR=4326&outFields=*&f=geojson
  ```
- Check-for-change: `returnCountOnly=true`
- ⚠️ ไม่มีความลึกชั้นเกลือหิน → `rock_salt_depth_m` = null · map `is_maha_sarakham = (TEXT_SYM = 'KTms')`
- บริการอื่นที่น่าใช้: `GEOL/GEOL_STR_250K` (โครงสร้างธรณี), `GEOL/ROCK_UNIT_250K_PROV` (รายจังหวัด)

### 2. LDD — ชุดดิน / ดินเค็ม ⏸ PLACEHOLDER
| ช่องทางที่ลอง | ผล |
|---|---|
| `https://dinonline.ldd.go.th/` | หน้าเว็บ HTML, ไม่มี OGC/REST ที่ `/geoserver/wms` (404) |
| `https://agri-map-online.moac.go.th/` | redirect → `https://agrimap-online.ldd.go.th` (Angular SPA, ยังไม่ได้แกะ API หลังบ้าน) |
| `ogc.ldd.go.th` | DNS resolve ไม่ได้ |
| `ldd.gdcatalog.go.th` | DNS resolve ไม่ได้ |
| data.go.th ค้น "ดินเค็ม" / "ชุดดิน" | มีแค่ CSV/XLSX/JPEG สถิติรายจังหวัด **ไม่มี polygon** |

**แผน:**
1. ทำหนังสือขอ shapefile กลุ่มชุดดิน 1:25,000 + แผนที่ดินเค็ม จาก LDD
2. ระหว่างรอ: ตารางมีครบแต่ว่าง → `analyze_polygon` / `baseEce()` ใช้ SoilGrids + Sentinel-2 SI + DGR EC, `confidence: 'low'`
3. เมื่อได้ไฟล์: วางที่ Storage `etl-raw/ldd/manual/<yyyy-mm-dd>/` → `python etl/run.py --source ldd` → pipeline ปกติ → mark แปลงที่ได้รับผลเป็น `stale`
4. อัปเดต `ref.province_coverage.has_ldd_soil / has_ldd_saline`
5. (ทางเลือก) แกะ XHR ของ agrimap-online — ต้องตรวจเงื่อนไขการใช้งานก่อน

### 3. DGR — แผนที่น้ำบาดาล 1:100,000 ⚠️
- Dataset (data.go.th, license **Open Data Common**): ค้น `แผนที่น้ำบาดาล` → package ของกรมทรัพยากรน้ำบาดาล, 63 resources
- URL รูปแบบ: `https://dgr.gdcatalog.go.th/dataset/e1472db9-e7b9-442a-88a1-cb25fe813c70/resource/<id>/download/.rar`
- Format: **`.rar` 60 ไฟล์**, `.zip` 2 ไฟล์ → ETL container ต้องมี `unar` หรือ `7z`
- ตัวอย่าง: มหาสารคาม `resource/b9e68d60-4bbb-4781-80f3-dcd394e073b3` = 2.5 MB
- อีสานครบ 20 จังหวัด
- **ไม่มีไฟล์ 14 จังหวัด:** เชียงราย เชียงใหม่ น่าน พะเยา แพร่ แม่ฮ่องสอน ลำปาง ลำพูน อุตรดิตถ์ ยะลา ระนอง สงขลา สตูล สุราษฎร์ธานี
- **มีรายการแต่ไม่มี URL:** เพชรบูรณ์
- `gis.dgr.go.th` (http/https, `/arcgis/rest/services`) — **timeout**
- ⚠️ ยังไม่ได้แตกไฟล์ดู schema → ใช้ `etl/sources/dgr_fieldmap.yaml` map field ต่อจังหวัด
- ใช้ resource list ของ CKAN (`package_show`) เป็นตัว check-for-change (`last_modified`)

### 4. ThaiWater (สสน.) ✅ (license ไม่ชัด)
- `https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load` — 1.4 MB, ทั้งประเทศ
- `https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h` — 4.7 MB, ทั้งประเทศ, มี `geocode` (จังหวัด/อำเภอ/ตำบล)
- ไม่ต้องใช้ key สำหรับ public endpoint · กรองจังหวัดฝั่ง ETL
- ต้องแสดง attribution **"คลังข้อมูลน้ำแห่งชาติ (สสน.)"** เสมอ

### 5. TMD ⚠️
- `https://data.tmd.go.th/api/WeatherToday/V2/?uid=...&ukey=...&format=json` — ได้ค่าสังเกตวันนี้ของทุกสถานี
- ทดสอบด้วย demo key สาธารณะ → **production ต้องสมัคร key เอง** (`TMD_API_KEY`)
- ไม่มีข้อมูลย้อนหลังใน endpoint นี้ → ใช้เป็นค่าอ้างอิง bias-correct ไม่ใช่แหล่งหลัก

### 6–7. GISTDA ✅
- Root: `https://gistdaportal.gistda.or.th/data/rest/services?f=json`
- เขตชลประทาน: `L09_rice/พื้นที่ชลประทาน_/MapServer/0` — **615 polygon** ทั้งประเทศ (มหาสารคาม bbox 33)
  - ใช้แทน `gis.rid.go.th` (Leaflet portal, ไม่มี REST — `/arcgis/rest/services` 404)
- ขอบเขต: `L05_AdminBoundary/L05_Province_GISTDA_50k` (77), `L05_AdminBoundary/L05_Amphoe_GISTDA_50k`
- อื่น ๆ: `L07_Hydrology/L07_Stream_RID_50k`, `L09_Landuse/L09_Landuse_GISTDA_50k`, `GWater/WaterShortage_Area`, `L09_rice/WL_Waterlogging`

### 8. HDX COD-AB Thailand ✅
- `https://data.humdata.org/api/3/action/package_show?id=cod-ab-tha`
- มี `.gdb.zip`, `.shp.zip`, `.geojson.zip` (**437 MB**), `.xlsx` · มีชื่อไทย · caveat: ชื่อเขตป้อมปราบฯ ผิด
- ใช้เฉพาะระดับตำบล (subdistrict) · โหลดครั้งเดียวต่อรอบ semiannual

### 9–10. อากาศ ✅
- **Backfill 20 ปี: ERA5-Land**
  - Open-Meteo open data: `https://openmeteo.s3.amazonaws.com/?list-type=2&prefix=data/copernicus_era5_land/` (ไม่ต้องใช้ key)
  - หรือ Copernicus CDS `reanalysis-era5-land` (ต้องมี account)
- **Daily + forecast: Open-Meteo API**
  - `https://archive-api.open-meteo.com/v1/archive?...&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,shortwave_radiation_sum,wind_speed_10m_max`
  - `https://api.open-meteo.com/v1/forecast?...`
  - คืน `et0_fao_evapotranspiration` มาเลย (FAO-56)
  - Free tier ~10,000 call/วัน · request ที่มี >10 ตัวแปร หรือ >2 สัปดาห์ ถูกนับเป็นหลาย call
- **ทำไมห้ามใช้ API backfill:** 0.1° ทั้งประเทศ ≈ 4,300 cell × 20 ปี ≈ **2.2 ล้าน call ≈ 220 วัน** บน free tier
- NASA POWER (`power.larc.nasa.gov/api/temporal/daily/point`) — สำรอง

### 12. SoilGrids ✅
- REST `https://rest.isric.org/soilgrids/v2.0/properties/query` ใช้ได้ แต่ fair-use ~5 call/นาที → **ใช้ตรวจจุดเท่านั้น**
- Bulk: อ่าน COG/WCS ของ ISRIC แล้วทำ zonal stats ลง `ref.grid_cells`
- ⚠️ พื้นที่เมืองคืน `null` (เช่น ขอนแก่นตัวเมือง) แต่พื้นที่นาได้ค่า (มหาสารคาม `16.05,103.25`: clay 23.6%, SOC 33.5 g/kg) → ETL ต้องรับ null

### 13–16. Raster / Projection ✅
- CHIRPS: `https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_daily/tifs/p05/<year>/`
- JRC GSW: `https://storage.googleapis.com/global-surface-water/downloads2021/occurrence/occurrence_100E_20Nv1_4_2021.tif` (ไทยต้องใช้หลาย tile)
- Copernicus DEM: `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N16_00_E102_00_DEM/...tif` (1°×1° ต่อ tile, ไทย ~60 tile)
- NEX-GDDP-CMIP6: `https://nex-gddp-cmip6.s3.us-west-2.amazonaws.com/` (มี SSP2-4.5 / SSP5-8.5 ตามที่ spec ต้องการ)
  - Open-Meteo climate API ใช้ได้ แต่เป็นชุดโมเดล HighResMIP ไม่มีตัวเลือก SSP ตามที่ spec ระบุ

---

## งบปริมาณข้อมูล (ทั้งประเทศ)

| รายการ | ขนาด | ข้อสรุป |
|---|---|---|
| `ref.grid_cells` 0.01° | ~430,000 แถว | ปกติ |
| `ref.weather_grid` 0.1° | ~4,300 จุด | ปกติ |
| `obs.weather_daily` 20 ปี | ~31 ล้านแถว ≈ 3.7 GB | **Supabase Pro** |
| CMIP6 5 GCM × 2 SSP × 10 ปี | ~3 เท่าของข้างบน | ตารางแยก `obs.weather_daily_proj` หรือเก็บสรุปรายฤดู |
| ไฟล์ดิบ (DEM, JRC, ERA5) | หลายสิบ GB | Storage `etl-raw/` + lifecycle ลบหลัง 2 เวอร์ชัน |

## Open items
- [ ] หนังสือขอข้อมูล LDD (ชุดดิน 1:25k + ดินเค็ม) — **blocker สำหรับ confidence สูง**
- [ ] ขอไฟล์ DGR 14 จังหวัด + เพชรบูรณ์
- [ ] แตก `.rar` DGR มหาสารคาม ตรวจ field (EC/TDS/ความลึก/ปริมาณ) → เขียน `dgr_fieldmap.yaml`
- [ ] ยืนยัน license ThaiWater สำหรับการ cache และแสดงผล
- [ ] สมัคร TMD API key
- [ ] หาแหล่งความลึกชั้นเกลือหิน (รายงาน DMR / บ่อเจาะ)
