# DECISIONS

รูปแบบ: `D-<ลำดับ> · <วันที่> · <ผู้ตัดสิน>` — บริบท → ทางเลือกที่เลือก → เหตุผล

## D-001 · 2026-10-10 · Orchestrator
**ขอบเขตทั้งประเทศ แต่เปิดใช้รายจังหวัด** — ตาราง `ref.province_coverage.enabled` คุมการเปิด · Phase 1 เปิดเฉพาะมหาสารคาม (province code `44`) เพราะข้อมูล DMR (KTms), DGR, GISTDA ชลประทาน, SoilGrids พร้อมครบ

## D-002 · 2026-10-10 · Orchestrator
**LDD เป็น placeholder** — ไม่มีช่องทางดึงอัตโนมัติ (ดู DATA_SOURCES §2) · ตารางสร้างครบแต่ว่างได้ · fallback = SoilGrids + Sentinel-2 SI + DGR EC, `confidence: 'low'`

## D-003 · 2026-10-10 · Orchestrator
**ชื่อโฟลเดอร์ repo = `petchwork`** (ตามที่ผู้ใช้กำหนด) แทน `thai-rice-twin/` ใน SPEC §3 · โครงสร้างภายในตาม SPEC

## D-004 · 2026-10-10 · Orchestrator
**อากาศย้อนหลังใช้ ERA5-Land bulk** ไม่ใช้ Open-Meteo API backfill (≈2.2M call) · Open-Meteo API ใช้เฉพาะ daily/forecast

## D-005 · 2026-10-10 · Orchestrator
**Seed ข้อมูลพัฒนา (task 1.3) เป็น polygon สมมติ** ในมหาสารคาม รวมถึงขอบเขตจังหวัดแบบหยาบ (bbox) — ETL จริง (1.9) จะ swap ทับ · seed ตั้ง `data_snapshots.version = 'seed'`

## D-006 · 2026-10-10 · frontend-ui
**OG image ใช้ IBM Plex Sans Thai subset จาก Google Fonts ตอน build** — ถ้าดึงไม่ได้ fallback เป็นการ์ดภาษาอังกฤษ (build ไม่พัง)

## D-007 · 2026-10-10 · frontend-ui
**"ตัวอย่างรายงาน" บน Landing เป็น HTML mock + inline SVG** แทนภาพหน้าจอ · ตัวเลขในการ์ด 4 ด้านเป็นค่าตัวอย่าง ติดป้าย "ตัวอย่าง" · ป้าย "แปลงของฉัน" ใน header รอ client island ตอนทำ auth (1.8) เพื่อให้ landing ยัง static

## D-008 · 2026-10-10 · map-ui
**พฤติกรรมการปักจุด** — เรียงจุด CCW เมื่อวางจุดที่ 4 และเมื่อปล่อยลาก (ไม่ทำระหว่างลาก) แล้วหมุน ring ให้จุดแรกที่แตะยังเป็นเลข 1 · "ย้อนกลับ" ลบจุดเลขสูงสุด · คำเตือนพื้นที่ (<0.5 / >500 ไร่) ต้องกดยืนยันก่อน analyze ส่วนด้าน >3 กม. แค่เตือน · ไม่มี Map ID ใช้ `DEMO_MAP_ID` (dev เท่านั้น)

## D-009 · 2026-10-10 · model-scientist (รับโดย Orchestrator)
**โมเดล Phase 1 (`MODEL_VERSION 0.1.0`)** — W เป็น storage (mm) ระดับ AWD −150 mm แปลงด้วย Sy 0.1 · ใช้ ETa = Ks·ETc เพื่อรักษามวล · `runSeasonEnsemble` คืน `{quick, years}` (scalar ของ quick จากปีล่าสุด, yield/ECe เป็น P10–P90 ข้ามปี) · class ความเค็มจาก max(baseEce, ECe P50) · N2O เฉพาะ direct (EF1) · CO2 จากเผาฟางไม่นับ (biogenic) · ฟางไม่เผาเหลือในแปลง 50% (CFOA 0.19) · ค่า `// ASSUMPTION:` ทั้งหมดใน `packages/model/src/constants/` ต้องให้ผู้เชี่ยวชาญ/กรมการข้าวตรวจก่อน production

## D-010 · 2026-10-10 · Orchestrator
**Contract v0.2** — `DEFAULT_PRACTICES.waterRegime` เปลี่ยนเป็น `'rainfed'` (เดิมขัดกับ waterSource rainfed) · เพิ่ม `grid.river_ec_dry_dsm` (optional, nullable) สำหรับ coastal_intrusion · ETL ต้องเก็บ `si_dry_season` = sqrt(Blue×Red) ของ S2 reflectance 0–1

## D-011 · 2026-10-10 · db-architect
**Supabase local ใช้ port 554xx** (API 55421, DB 55422, Studio 55423) เพราะเครื่องมีโปรเจกต์อื่นใช้ 543xx · ไม่มี `psql` บน host ใช้ `docker exec -i supabase_db_petchwork psql -U postgres`

## D-012 · 2026-10-10 · db-architect
**Grid id คำนวณจากพิกัด** — `grid_cells.id = floor((lat_min+90)*100)*36000 + floor((lon_min+180)*100)` · `weather_grid.id = floor((lat+90)*10)*3600 + floor((lon+180)*10)` · ETL ต้องใช้สูตรเดียวกัน

## D-013 · 2026-10-10 · db-architect
**analyze_polygon** — ค่า `grid` เป็นค่าเฉลี่ยถ่วงพื้นที่ · `plant_doy_*` / `weather_grid_id` จาก cell ที่ทับมากที่สุด · หาจังหวัดด้วย `ST_PointOnSurface` · ปฏิเสธ polygon > 50 km² ด้วย `INVALID_POLYGON` · groundwater confidence `{medium,'DGR 1:100k'}` / `{low,'fallback'}` · `weather_series` คำนวณ ET0 ด้วย Hargreaves ถ้า null และคืน jsonb array ก้อนเดียว (เลี่ยง PostgREST max_rows 1000)

## D-014 · 2026-10-10 · db-architect
**MVT ผ่าน PostgREST media type** — `mvt_tile` คืน domain `"application/vnd.mapbox-vector-tile"` · route tiles ต้องยิง `/rest/v1/rpc/mvt_tile` พร้อม `Accept: application/vnd.mapbox-vector-tile`

## D-015 · 2026-10-10 · db-architect
**Demo field** = `app.fields.is_demo` เจ้าของเป็น system user uuid คงที่ · trigger บน `app.fields` เติม admin codes, upsert `sim.field_profile`, mark runs `is_stale` เมื่อ geometry เปลี่ยน → `/api/fields` POST insert ด้วย client ของผู้ใช้ได้เลย ไม่ต้อง service role · `input_hash` คำนวณฝั่ง DB ใน `enqueue_twin_run` (ไม่ต้องตรงกับ TS)

## D-016 · 2026-10-10 · db-architect
**meta.data_sources** แยก `ldd_soil` / `ldd_saline`, เพิ่ม `sentinel2` และ tier `manual` · seed มีแค่ 3 จังหวัด (44 enabled, 40, 72) → polygon จังหวัดอื่นได้ `OUTSIDE_THAILAND` จนกว่า ETL โหลดครบ 77 จังหวัด

## D-017 · 2026-10-10 · Orchestrator
**Contract v0.3** — เพิ่ม `FieldResults`, `ResultSeasonRow`, `Field.is_demo`, `DEMO_FIELD_ID`
