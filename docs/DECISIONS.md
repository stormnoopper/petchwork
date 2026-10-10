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

## D-018 · 2026-10-10 · map-ui
**LayerToggle** — deck.gl `GoogleMapsOverlay({interleaved:false})` + `MVTLayer` โหลดด้วย `import()` ตอนเปิดชั้นแรกเท่านั้น (~270 KiB gzip) · ปิด loaders.gl worker (เลี่ยงโหลดจาก CDN) · `pickable:false` ทุกชั้นใน Phase 1 · ชั้น LDD แสดงเมื่อ `profile.coverage.has_ldd_*` เป็น true เท่านั้น · `FieldDrawer` รับ `initialVertices` (อ่านครั้งเดียวตอน mount) สำหรับกู้ draft

## D-019 · 2026-10-10 · api-integrator
**/api/analyze** ใช้ anon client ไม่ผูก cookie · cache in-memory LRU ต่อ instance (analyze 500/1h, weather ต่อ grid 200/1h) — serverless ไม่แชร์ข้าม instance ต้องย้ายไป KV ถ้าจำเป็น · HTTP 400 (zod) / 422 (RPC error) / 500 · response ~409 KB (weather 10 ปี) → ต้องเปิด gzip/brotli · geom ส่งเข้า PostgREST เป็น EWKT · ownership error (42501) แปลงเป็น 404 · auth dev = email magic link + OTP 6 หลัก (phone OTP = TODO) · `measuredEc*` / `lastYieldKgPerRai` ยังไม่ถูกเก็บ (ควรไป `app.field_observations`)

## D-020 · 2026-10-10 · Orchestrator
**Contract v0.4** — id ใช้ `z.guid()` แทน `z.uuid()` (zod v4 strict RFC ปฏิเสธ `DEMO_FIELD_ID`) · เพิ่ม `ApiError`, `FieldDetailResponse`, `UpdateFieldRequest`, `EnqueueRunRequest` · supabase auth `site_url` = `http://localhost:3000` + redirect allowlist

## D-021 · 2026-10-10 · frontend-ui
**ResultPanel / รายงาน** — bottom sheet เขียนเอง (`ResponsivePanel`, DOM เดียว non-modal) แทน Base UI Drawer เพื่อให้หมุนจอแล้ว state ไม่หาย · draft ก่อน login เก็บใน session+localStorage TTL 1 ชม. ลบทันทีเมื่อกู้ (magic link เปิดแท็บใหม่) · ResultPanel คำนวณฝั่ง client เสมอด้วย practices เดียวกับ server · P10–P90 ของน้ำและ GHG มาจาก ensemble รายปี · รายงานแปลง Phase 1 คำนวณฝั่ง server จาก profile + weather (ยังไม่ใช้ twin runs) · กราฟ 2 ชุดแยก ไม่ใช้ dual axis

## D-022 · 2026-10-10 · etl-engineer
**ETL runtime** — Python 3.12 ใน `uv` venv (`etl/.venv`; 3.14 ยังไม่มี wheel rasterio/pyogrio) · แตก RAR5 ด้วย `/usr/bin/bsdtar` · `ingest_jobs.status` = running|success|skipped|dry_run|blocked|failed · ขอบเขต cron ผ่าน repo variable `ETL_SCOPE` (default `pilot`) · เพิ่ม `etl-manual.yml` สำหรับ tier static/manual และปุ่ม "รันตอนนี้"

## D-023 · 2026-10-10 · etl-engineer
**DGR ไม่มี EC และความลึก** — ใช้ชั้น `GWAV_*.shp` (EPSG:24047) · `ec_dsm = TDS/640` (FAO-29) · TDS/yield ใช้ค่ากลางช่วง (ปลายเปิด `>1,500`→2,250, `>20`→25 = ASSUMPTION) · `depth_m = null` · B/G/R → fresh/brackish/saline · **ต้องให้กรมทรัพยากรน้ำบาดาลตรวจ** · ผลต่อโมเดล: CR จากน้ำใต้ดินใช้ default ความลึก (ไม่มีข้อมูลจริง)

## D-024 · 2026-10-10 · etl-engineer
**Swap / validate** — swap ใน transaction เดียว เปลี่ยนชื่อ index/sequence แล้วคืนชื่อเดิม เก็บ archive 2 เวอร์ชัน · `changed_area` = envelope ของแถวที่เปลี่ยน · row delta เทียบตาราง live (ข้ามถ้ายังเป็น seed) · checksum prefix ด้วย scope (`bbox`/`nationwide`) · grid_update ล้างคอลัมน์ของแหล่งใน bbox ก่อนเติม · ERA5 pilot ผ่าน archive API `models=era5_seamless` (era5_land คืน null บางตัวแปร) · ทั้งประเทศต้องอ่าน S3 `.om` (ยังเป็น stub `skipped: use_bulk_s3`) · ลม 10 m → 2 m × 0.748 (FAO-56) · GISTDA `PV_CODE` = รหัส DOPA 2 หลัก, อำเภอ `AP_IDN`

## D-025 · 2026-10-10 · Orchestrator
**Migration 0600** — `obs.rain_station_daily`, `ref.groundwater_zones.aquifer_unit`, คิว pgmq `profile_refresh` (consumer ยังไม่มี — ETL fallback เรียก `analyze_polygon` แบบ sync) · `dgr_groundwater` คง tier semiannual (ไฟล์แผนที่รายจังหวัด) ส่วนระดับ/คุณภาพน้ำบาดาลรายไตรมาสยังไม่มีแหล่ง

## D-026 · 2026-10-10 · auth-migration (ผู้ใช้ตัดสินใจ)
**เปลี่ยนจาก Supabase Auth (magic link/OTP) เป็น Auth.js v5 (`next-auth@5.0.0-beta.32`) เข้าสู่ระบบด้วย Google อย่างเดียว** — แทนที่ SPEC §5.1 ข้อ 11 และส่วน auth ของ D-019/D-020/D-021 · session = JWT cookie (ไม่มี DB adapter) · app user id = UUID v5 ของ `google:<sub>` ด้วย namespace คงที่ `31416000-cb73-4bfe-806a-00976aed3fee` (`apps/web/lib/auth/identity.ts` — **ห้ามเปลี่ยน** ไม่งั้นแปลงเดิมหลุดเจ้าของ) · ตาราง `app.users` แทน `auth.users` และ FK `app.fields.user_id → app.users(id) on delete cascade` · RPC `public.ensure_app_user()` (security definer, ใช้ `auth.uid()`) เรียกใน `jwt` callback ตอน sign-in และ `POST /api/fields` เรียกซ้ำเมื่อเจอ FK 23503 · **RLS bridge:** server mint HS256 JWT (`sub`=user id, `role`/`aud`=`authenticated`, อายุ ≤1 ชม.) ด้วย `SUPABASE_JWT_SECRET` ต่อ request แล้วส่งเป็น `Authorization` ให้ PostgREST → policy เดิมที่ใช้ `auth.uid()` ใช้ได้ต่อ · token ไม่ออกไปถึง browser · ไม่มี middleware ตรวจสิทธิ์ใน server code ด้วย `auth()` · ฝั่ง client เช็ก login ผ่าน `GET /api/auth/session` (ไม่ใช้ SessionProvider; landing ยัง static) · `POST /auth/signout` คงไว้ (ปฏิเสธ cross-origin) · **production:** hosted Supabase ต้องยังรับ legacy HS256 JWT secret (ถ้าย้ายไป asymmetric signing keys ต้องเปลี่ยนเป็น Third-party auth หรือ mint ด้วย key ที่ project ยอมรับ)

## D-027 · 2026-10-10 · Orchestrator (ตามที่ผู้ใช้สั่ง)
**Dev login bypass** — ระหว่างยังไม่ตั้ง Google OAuth ใช้ Credentials provider `dev-bypass` (ผู้ใช้สังเคราะห์ `uuidv5('dev:local-tester')`, email `dev@localhost`) เปิดเฉพาะ `AUTH_DEV_BYPASS=1` **และ** `NODE_ENV !== 'production'` (ตรวจทั้งตอนสร้าง provider, signIn callback และ server action) · ห้ามตั้ง `AUTH_DEV_BYPASS` ใน env ของ production

## D-028 · 2026-10-10 · Orchestrator
**Seed ขอบเขต 77 จังหวัดจริง** (`supabase/seed_provinces.sql`, GISTDA 1:50k simplify 0.002°, ~0.6 MB) โหลดหลัง `seed.sql` แทน bbox หยาบ 3 จังหวัด · ทุกจังหวัดมีแถว `province_coverage` (enabled=false ยกเว้น 44) · แก้ bug: ปักในกรุงเทพได้ `OUTSIDE_THAILAND` → ตอนนี้ได้ `PROVINCE_NOT_ENABLED` · ETL จริงจะ swap ความละเอียดเต็มทับ

## D-029a · 2026-10-10 · Orchestrator
**พื้นที่ที่แสดงและใช้ validate = WGS84 ellipsoidal** (authalic-sphere excess, `lib/geo/areaM2`) เท่ากับ PostGIS geography (ต่างกัน ~1e-12) · badge, ResultPanel และรายงานใช้ค่าเดียวกัน · ไม่ใช้ `google.maps.geometry.computeArea` (ทรงกลม R=6378137 ให้ค่าสูงกว่า ~0.35%) · bottom sheet default 25% และไม่เด้งขึ้นเมื่อผลมาถึง

## D-029 · 2026-10-10 · etl-engineer (ตามที่ผู้ใช้สั่ง: เปิดทุกจังหวัด, ไม่มีบริการเสียเงิน)
**เปิดใช้ทั้ง 77 จังหวัด** (แทน "Phase 1 = 44" ใน D-001/D-028) — `supabase/seed_provinces.sql` upsert `province_coverage` ทุกจังหวัด `enabled = true` · `salinity_origin`: อีสาน → `inland_rock_salt`, 23 จังหวัดติดทะเล (อ่าวไทย+อันดามัน: 10 11 74 75 24 20 21 22 23 76 77 86 84 80 90 94 96 85 82 83 81 92 91) → `coastal_intrusion`, ที่เหลือ → `none` (สุพรรณบุรี 72 เปลี่ยนจาก seed เดิม coastal/PTT1 เป็น none/RD41) · `default_variety` = **ASSUMPTION** อีสาน KDML105, เหนือ RD6, กลาง/ตะวันออก/ตะวันตก/ใต้ RD41 (ต้องให้กรมการข้าวตรวจ) · `has_dgr` = 62 จังหวัดที่มีไฟล์ DGR · pgTAP ทดสอบ `PROVINCE_NOT_ENABLED` โดยปิด 72 ใน transaction ของเทสต์
**analyze_polygon นอกกริด 0.01°** (migration `20261010000800`) — ไม่มี `ref.grid_cells` ตัด polygon → `grid` คง shape เดิม ค่าเป็น null ทั้งหมด ยกเว้น `weather_grid_id` = จุด `ref.weather_grid` ที่ใกล้สุด (KNN) ภายใน 50 km · `confidence.soil/salinity.source = 'fallback'` (low) เมื่อไม่มี clay / SI จริง
**อากาศทั้งประเทศจาก NASA POWER** (`etl/sources/nasapower.py`, ฟรี/public domain) — จุด 0.25° (lat/lon คูณ 0.25) ห่างจังหวัด ≤15 km = 854 จุด, id ตามสูตร D-012 จากพิกัดจุด, ข้าม 12 จุดที่ id ชนกับจุด seed 0.1° ของมหาสารคาม (ไม่เขียนทับ) · ช่วง 2016-01-01 → เมื่อวาน · ET0 = FAO-56 Penman-Monteith (ความสูงจาก POWER, fallback Hargreaves) · `source = 'nasa_power'` · โหลดตรงแบบ MERGE (append) ไม่ใช่ swap · POWER ตอบ 429 เมื่อยิงเร็ว (~600 request/4 นาที) → ≤4 concurrent + เว้น ≥1.5 s ต่อ request + cache raw ต่อจุด (resume ได้) · ความละเอียดจริง 0.5°×0.625° → **หยาบกว่า ERA5-Land 0.1° มาก** ใช้แทนชั่วคราวจนกว่าจะทำ ERA5-Land bulk (D-004)
**DGR ทั้งประเทศ** — `.zip` (10, 62) ชื่อไฟล์ TIS-620 → แตกด้วย Python `zipfile` + cp874 · `quality_class` คิดจาก TDS (legend ภาคใต้ต่างจากมาตรฐาน) · ตัด polygon แหล่งน้ำ (`W`) / ไม่มีข้อมูล (`NA`)

## D-030 · 2026-10-10 · map-ui (ผู้ใช้ตัดสินใจ: ไม่ใช้บริการเสียเงิน)
**MapLibre + Esri World Imagery แทน Google Maps (ต้นทุน)** — ลบ `@vis.gl/react-google-maps`, `@types/google.maps`, `@deck.gl/*` ใช้ `maplibre-gl@5.24.0` (pin) โหลดผ่าน `next/dynamic` ssr:false เฉพาะ `/map` (JS+CSS) · style สร้างในโค้ด `components/map/basemap.ts`: raster Esri World Imagery (source maxzoom 18 — z19 ในชนบทไทยเป็นภาพ "Map data not yet available" จึง over-zoom แทน) + Esri Reference `World_Transportation` และ `World_Boundaries_and_Places` (ชื่อถนน/หมู่บ้าน) · **สลับ provider** ด้วย `NEXT_PUBLIC_BASEMAP=esri|eox` (eox = Sentinel-2 cloudless 2020, 10 m, maxzoom 16) · AttributionControl มุมล่างซ้าย: มือถือ (<640px) แบบย่อ "i" เริ่มปิด, จอกว้างแสดงข้อความตลอด · **deck.gl ถูกเอาออก**: LayerToggle ใช้ MapLibre `vector` source ชี้ `/api/tiles/<layer>/{z}/{x}/{y}` (`source-layer` = ชื่อ layer ตาม `mvt_tile`) + fill/line/circle layers สีจาก `layerStyles.ts` เขียนเป็น expression (ทดสอบด้วย `@maplibre/maplibre-gl-style-spec` เทียบกับฟังก์ชัน JS) แทรกใต้ชั้นชื่อสถานที่และใต้รูปแปลงที่วาด · soil_units ใน expression รองรับกลุ่มชุดดิน 1–62 (นอกนั้นสีเทา ต่างจาก hash ใน JS) · พฤติกรรมการปักจุด (D-008) คงเดิม; ปิดการหมุน/เอียงแผนที่, ซูม default 5.5 · ตอนกู้ draft fitBounds ใช้ padding 80 + เผื่อแถบบน/ปุ่มล่าง (top 140, bottom 170) ไม่ให้มุมแปลงถูกปุ่มบัง · ลบหน้าจอ MissingApiKey (ไม่ต้องใช้ key แล้ว) · **ข้อควรระวัง:** Esri World Imagery ใช้ฟรีได้สำหรับ non-commercial/พัฒนา — ก่อนเปิดใช้เชิงพาณิชย์ต้องตรวจ Esri Terms of Use (อาจต้องมีบัญชี ArcGIS Location Platform) หรือสลับเป็น `eox` (CC BY-NC-SA 4.0 สำหรับปี 2020 — เชิงพาณิชย์ต้องขอ license EOX เช่นกัน) · ภาพแต่ละพื้นที่ถ่ายคนละวัน (ไม่ใช่ภาพปัจจุบัน) · ยังไม่ cache tile สำหรับ offline/PWA

## D-031 · 2026-10-11 · Orchestrator (ผู้ใช้สั่ง: เอา FAQ ออก, ขอหน้ารวมข้อมูลดิบ)
**ลบส่วน "คำถามที่พบบ่อย" ออกจาก Landing** (และ `landing.faq` ใน `th.json`) · **หน้า `/data` ข้อมูลดิบ (สาธารณะ ไม่ต้องล็อกอิน)** — แค็ตตาล็อก `meta.data_sources` + snapshot ล่าสุด และ 16 ตาราง `ref.*`/`obs.*` (allow-list ใน `public.raw_data_tables()` และ `RAW_DATA_TABLES` ใน contracts — ต้องแก้คู่กัน) · `/data/<schema.table>` แสดงทีละ 50 แถว กรองเท่ากับได้ 1 คอลัมน์ (ค่าถูก cast เป็นชนิดคอลัมน์) เปิดลึกได้ถึง offset 100,000 · `GET /api/data/<table>/csv` ≤ 5,000 แถว (UTF-8 BOM) · **ไม่ส่ง geometry ดิบ**: polygon → `lat`,`lon` (point on surface) + `area_rai`; point → `lat`,`lon` · ไม่รวมตารางที่ผูกกับผู้ใช้ (`app.*`, `sim.*`, `obs.sat_indices`) และ `meta.api_clients` · `obs.weather_daily` ไม่กรอง → จำนวนแถวเป็นค่าประมาณจาก `reltuples` (นับจริงช้า) · migration `20261010000900` (RPC `raw_data_catalog`, `raw_data_rows` security definer, grant anon) · เมนูหัวเว็บเพิ่ม "ข้อมูลดิบ" · ข้อควรระวัง: สัญญาอนุญาตบางแหล่ง (thaiwater = unclear, LDD = by request) ต้องตรวจก่อนเปิดดาวน์โหลดสาธารณะบน production

## D-032 · 2026-10-11 · Orchestrator (ผู้ใช้สั่ง: ปรับเป็นสมัคร Register/Login ปกติ)
**อีเมล + รหัสผ่านเป็นวิธีหลัก** (แทน "Google only" ใน D-026) — Auth.js Credentials provider `credentials` · หน้า `/register` (ชื่อ, อีเมล, รหัสผ่าน 8–128, ยืนยันรหัสผ่าน, ยอมรับเงื่อนไข+นโยบายความเป็นส่วนตัว) สมัครแล้วเข้าสู่ระบบให้ทันทีและพาไป `next` · `/login` ฟอร์มอีเมล/รหัสผ่าน · Google แสดงเฉพาะเมื่อมี `AUTH_GOOGLE_ID/SECRET` (`googleEnabled`) · dev bypass คงเดิม (D-027)
**user id** = uuidv5(`email:<lower(trim(email))>`) namespace เดิม — อีเมลเดียวกันที่เข้าด้วย Google เป็นคนละบัญชี (ยังไม่ merge) · **รหัสผ่าน** = scrypt N=2^15 r=8 p=1 salt 16 B (`lib/auth/password.ts`, `node:crypto` ไม่เพิ่ม dependency) รูปแบบ `scrypt$N$r$p$salt$hash` · อีเมลที่ไม่มีในระบบยังเสียเวลาเช็กเท่ากัน (dummy hash) และข้อความ error เหมือนกัน ("อีเมลหรือรหัสผ่านไม่ถูกต้อง") ไม่บอกว่าอีเมลมีอยู่ (ยกเว้นตอนสมัครซ้ำ ซึ่งเลี่ยงไม่ได้)
**ที่เก็บ** `app.user_credentials` (RLS เปิด ไม่มี policy, revoke ทุก role) · RPC `auth_register` / `auth_credentials` / `auth_record_login` security definer ให้ `service_role` เท่านั้น — server mint JWT `role=service_role` อายุ 60 วินาทีจาก `SUPABASE_JWT_SECRET` (`mintServiceToken`) ไม่ใช้ `SUPABASE_SERVICE_ROLE_KEY` · **ล็อกบัญชี** ผิด 5 ครั้งติด → 15 นาที (หลังหมดเวลา ผิดอีกครั้งล็อกซ้ำทันทีจนกว่าจะเข้าถูก) · migration `20261010001000`
**ยังไม่มี (ต้องมีบริการส่งอีเมลก่อน):** ยืนยันอีเมล, ลืมรหัสผ่าน/รีเซ็ต, เปลี่ยนรหัสผ่าน · ยังไม่มี rate limit ต่อ IP สำหรับ `/register` และการลองหลายอีเมล — ควรทำก่อน production (เช่น Upstash/edge middleware)

## D-033 · 2026-10-11 · Orchestrator (ผู้ใช้สั่ง deploy: Vercel + Supabase Cloud Free, ไม่ผ่าน GitHub)
**คอลัมน์ค่าอากาศ `obs.weather_daily(_proj)` numeric → real** (migration `20261011000100`) เพื่อให้ DB บน Supabase Free อยู่ใต้ 500 MB (obs 415 → 348 MB; cloud รวม 427 MB) · เพิ่ม overload `meta.et0_hargreaves(numeric, date, real, real)` ให้ `weather_series` · Production: Supabase project `boengna` (org BoengNa, ap-southeast-1) · โหลดข้อมูลด้วย `pg_dump --data-only` จาก local (ref/obs/meta/app/sim) ไม่รวม `staging`/`archive` แล้วลบผู้ใช้ dev ออก · ใช้ legacy HS256 JWT secret ของ project (สถานะ previously_used = ยัง verify ได้) — **ห้าม revoke legacy key ใน dashboard** ไม่งั้น RLS bridge (D-026) ใช้ไม่ได้ · secrets อยู่ที่ `~/.config/boengna/prod.env` (chmod 600, นอก repo) · **Hosted PostgREST ต้อง expose schema `app`** (ตั้งผ่าน Management API `PATCH /v1/projects/{ref}/postgrest` db_schema=`public, graphql_public, app`, extra_search_path=`public, extensions`) — `config.toml` มีผลเฉพาะ local; project ใหม่ต้องตั้งซ้ำ · Vercel project `boengna` (team ส่วนตัว stormnooppers-projects, Root Directory `apps/web`, Node 22) → https://boengna.vercel.app · Vercel region `sin1` (`apps/web/vercel.json`), `.vercelignore` กัน .env/etl/supabase · ข้อจำกัด: Free pause เมื่อไม่มีการใช้งาน 7 วัน, ETL รายวันจะทำให้ DB โตเกิน 500 MB ภายในไม่กี่เดือน
