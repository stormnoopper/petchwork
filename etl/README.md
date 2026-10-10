# ETL — Thai Rice Digital Twin

Python ETL ที่ดึงข้อมูลอ้างอิงเข้า Supabase ตาม SPEC §6 / §6.1
Pipeline ต่อแหล่ง: **check → fetch → stage → validate → swap/merge → record → recompute → notify**

## ติดตั้ง (local)

```bash
# Python 3.11–3.13 (rasterio/pyogrio wheels ยังไม่ครบบน 3.14) — ใช้ uv:
uv venv --python 3.12 etl/.venv
uv pip install --python etl/.venv/bin/python -r etl/requirements.txt
# DGR .rar ต้องมี bsdtar (macOS มีในตัว, Ubuntu: apt install libarchive-tools) หรือ unar / 7z
```

`DATABASE_URL` (default = Supabase local `postgresql://postgres:postgres@127.0.0.1:55422/postgres`, D-011)

## ใช้งาน

```bash
etl/.venv/bin/python etl/run.py --list                        # รายชื่อแหล่ง + tier + ตารางปลายทาง
etl/.venv/bin/python etl/run.py --tier semiannual             # ทุกแหล่งที่ meta.data_sources.refresh_tier = semiannual
etl/.venv/bin/python etl/run.py --source dmr,dgr --dry-run    # fetch → stage → validate แล้วหยุด (ไม่ swap)
etl/.venv/bin/python etl/run.py --source dgr --provinces 44,40
etl/.venv/bin/python etl/run.py --source openmeteo --start 2026-10-01 --end 2026-10-07
etl/.venv/bin/python etl/run.py --source soilgrids,dem --nationwide
etl/.venv/bin/python etl/run.py --rollback dmr                # ย้อนเวอร์ชันล่าสุดจาก archive กลับมา
```

| flag | ความหมาย |
|---|---|
| `--tier daily\|quarterly\|semiannual\|static\|manual` | เลือกแหล่งตาม `meta.data_sources.refresh_tier` (แก้ใน DB ได้โดยไม่ต้องแก้โค้ด) |
| `--source a,b` | code หรือ alias: `dmr gistda irrigation admin dgr openmeteo era5land nasa dem soilgrids thaiwater ldd grid cmip6 jrc sentinel2 chirps` |
| `--dry-run` | หยุดหลัง validate — **ไม่แตะ ref/obs และ meta.data_sources** (เขียนแค่ `staging.*` + `meta.ingest_jobs`) |
| `--bbox w,s,e,n` / `--nationwide` | ขอบเขต (default = pilot มหาสารคาม `102.85,15.6,103.55,16.6`) |
| `--force` | ข้ามการเทียบ checksum (`skipped: unchanged`) |
| `--upload-raw` | อัปโหลดไฟล์ดิบไป Storage bucket `etl-raw/<source>/<date>/` (ต้องมี `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) — default เก็บ local `etl/.raw/` |
| `--no-recompute` | ไม่ mark stale / ไม่ refresh profile |

Exit code 0 เมื่อทุกแหล่งเป็น `success` / `skipped` / `dry_run`, อื่น ๆ = 1

## สถานะใน `meta.ingest_jobs.status`

`running` · `success` · `skipped` (unchanged / no_source / not_implemented / over_budget) · `dry_run` · `blocked` (validation ไม่ผ่าน → ไม่ swap) · `failed`
`log` เป็น JSON: check token, ไฟล์ดิบ + sha256, จำนวนแถว staged, ผล validate ทุกข้อ, recompute, เวลา

## Pipeline (pipeline.py)

1. **Check** — token ของต้นทาง (ArcGIS `returnIdsOnly` → จำนวน + hash ของ id, CKAN `last_modified`+size, HTTP ETag/Last-Modified, sha256 ของไฟล์ LDD) นำหน้าด้วย scope (`bbox:…`/`nationwide`) เทียบ `meta.data_sources.last_checksum` → เท่ากัน = `skipped: unchanged`
2. **Fetch** — retry exponential backoff 3 ครั้ง (429/5xx/timeout) เก็บไฟล์ดิบ `etl/.raw/<source>/<yyyy-mm-dd>/`
3. **Stage** — `staging.<table>` = `LIKE ref.<table> INCLUDING ALL` + sequence ของตัวเอง → COPY → `ST_Transform 4326` → `ST_MakeValid` → `ST_SimplifyPreserveTopology` → `ST_CollectionExtract/ST_Multi`
   - `replace` (polygon): แถวเดิมนอก scope ถูกเก็บไว้ (`keep_where`), ถ้าข้อมูลจริงยังเป็น seed (D-005) จะไม่เก็บแถว seed
   - `grid_update` (`ref.grid_cells`): copy ทั้งตาราง → เติม cell ที่ขาดใน bbox (id ตาม D-012) → set คอลัมน์ของแหล่งเป็น null ใน bbox → update ค่าจาก raster
   - `merge` (obs.*, weather_grid): upsert ตาม key
4. **Validate** — rows>0 · row delta ≤ ±30% เทียบตาราง live (ข้ามเมื่อยังไม่เคยโหลดจริง) · geometry valid 100% + SRID 4326 · not-null · ช่วงค่า (EC 0–50 dS/m ฯลฯ) · coverage จังหวัด (`ref.province_coverage.<flag>` ที่ตัด bbox ต้องมีข้อมูล) · grid: สัดส่วน non-null ขั้นต่ำ
5. **Swap** — transaction เดียว (`lock_timeout 15s`): rename index/sequence ของ live เติม `_v<version>` → `ref.x` → `archive.x_v<version>` → `staging.x` → `ref.x` → คืนชื่อ index/sequence เดิม → copy GRANT → ลบ archive เกิน 2 เวอร์ชัน · ผู้อ่านพร้อมกันรอไม่กี่ ms แล้วอ่านตารางใหม่ (ไม่เห็นตารางว่าง — มีเทสต์)
6. **Record** — `meta.data_snapshots` (version = UTC `YYYYMMDDTHHMMSS`, checksum, row_count, bbox, `changed_area`) + `meta.data_sources.last_checksum/last_success_at/next_run_at`
7. **Recompute** — `app.fields` ที่ตัด `changed_area` (envelope ของแถวที่เปลี่ยน) → `sim.model_runs.is_stale = true` → ถ้ามีคิว pgmq `profile_refresh` ส่งเข้าคิว ไม่งั้นเรียก `public.analyze_polygon` แล้ว upsert `sim.field_profile` ทันที
8. **Notify** — `ETL_ALERT_WEBHOOK` (Slack `text` / Discord `content`) ทั้งสำเร็จและล้มเหลว

## แหล่งข้อมูล (`sources/*.py`)

| code | ไฟล์ | ปลายทาง | หมายเหตุ |
|---|---|---|---|
| `dmr_rock_250k` | dmr.py | ref.geology_units | ArcGIS paging ≤2000 · `is_maha_sarakham = TEXT_SYM='KTms'` · `rock_salt_depth_m` null |
| `gistda_irrigation` | gistda.py | ref.irrigation_zones | ArcGIS 10.1 ไม่รองรับ paging → objectIds chunk |
| `gistda_admin` | gistda.py | ref.admin_boundaries | จังหวัด 77 ดึงทั้งประเทศเสมอ, อำเภอตาม scope · `PV_CODE` = รหัส 2 หลัก DOPA (= seed), อำเภอ `AP_IDN` 4 หลัก, `region` = `RE_ROYIN` |
| `dgr_groundwater` | dgr.py + dgr_fieldmap.yaml | ref.groundwater_zones | CKAN `.rar` ต่อจังหวัด → bsdtar → `GWAV_*.shp` |
| `soilgrids` | soilgrids.py | grid_cells.sg_clay_pct / sg_soc_gkg | อ่าน VRT/COG แบบ window (ไม่ใช้ REST) 0–30 cm ถ่วงความหนา |
| `cop_dem` | dem.py | grid_cells.elev_m / slope_pct | Copernicus GLO-30 COG ต่อ tile 1° |
| `open_meteo` | openmeteo.py | obs.weather_daily (+ ref.weather_grid) | daily, 7 ตัวแปร, wind 10 m → 2 m |
| `era5_land` | era5land.py | obs.weather_daily | pilot: archive API `era5_seamless` (budget guard) · nationwide: ออกแบบให้อ่าน S3 `.om` (ยังไม่ทำ, คืน skipped) |
| `thaiwater` | thaiwater.py | obs.reservoir_storage, obs.water_quality (+ staging.thaiwater_rain_24h) | ต้องแสดง **"คลังข้อมูลน้ำแห่งชาติ (สสน.)"** |
| `ldd_soil`, `ldd_saline` | ldd.py + ldd_fieldmap.yaml | ref.soil_units, ref.saline_soil_zones | placeholder — ไม่มีไฟล์ = `skipped: no_source` |
| `nasa_power` | nasapower.py | ref.weather_grid + obs.weather_daily | ทั้งประเทศฟรี (D-029): จุด 0.25° บนบก 854 จุด (−12 ที่ชน seed MSK), 2016 → เมื่อวาน, ET0 FAO-56 PM · ≤4 concurrent, เว้น 1.5 s, cache `etl/.raw/nasa_power/cache/` (resume) · MERGE ไม่ swap |
| `sentinel2`, `chirps`, `nex_gddp_cmip6`, `jrc_gsw`, `hdx_codab`, `gistda_rice_calendar`, `tmd` | phase2.py | – | stub `skipped: not_implemented` (docstring = TODO) |

### เพิ่มแหล่งใหม่
สร้าง class สืบจาก `sources.base.Source` → กำหนด `code` (ต้องมีใน `meta.data_sources`), `targets` (`Target(table, mode, required, ranges, coverage_flag, …)`) และ 3 เมธอด `check / fetch / produce` → ลงทะเบียนใน `sources/__init__.py`

## เพิ่มไฟล์ LDD (เมื่อได้รับจากกรมพัฒนาที่ดิน)

1. วางไฟล์ที่ `etl/.raw/ldd/manual/<yyyy-mm-dd>/` (`.shp` พร้อม `.dbf/.prj/.shx`, `.gpkg`, `.geojson` หรือ `.zip`)
   ชื่อไฟล์ต้องตรง glob ใน `sources/ldd_fieldmap.yaml` (`*soilgroup*`, `*ชุดดิน*`, `*salin*`, `*ดินเค็ม*` …)
   (ถ้าเก็บใน Storage `etl-raw/ldd/manual/` ให้ sync ลงมาก่อน)
2. แก้ชื่อ field ต้นทางใน `ldd_fieldmap.yaml` (`fields:` และ `salinity_level_map:`) ให้ตรงไฟล์จริง
3. `python etl/run.py --source ldd --dry-run` → ตรวจผล validate → รันจริงไม่ใส่ `--dry-run`
4. เมื่อ swap สำเร็จ ระบบตั้ง `ref.province_coverage.has_ldd_soil / has_ldd_saline = true` ให้จังหวัดที่มีข้อมูล และ mark แปลงที่ได้รับผลเป็น stale + คำนวณ profile ใหม่

## GitHub Actions

| workflow | cron (UTC) | tier |
|---|---|---|
| `etl-daily.yml` | `0 19 * * *` | daily |
| `etl-quarterly.yml` | `0 19 1 1,4,7,10 *` | quarterly |
| `etl-semiannual.yml` | `0 19 1 1,7 *` | semiannual |
| `etl-manual.yml` | dispatch เท่านั้น | static / manual / แหล่งใดก็ได้ (`source`) — ใช้กับปุ่ม "รันตอนนี้" ใน `/admin/data` |

ทุกตัวรันใน `ghcr.io/osgeo/gdal:ubuntu-small-latest`, รับ `workflow_dispatch` input `source`, `dry_run`, `force`
Secrets: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (เปิด `--upload-raw`), `ETL_ALERT_WEBHOOK`, `GEE_SERVICE_ACCOUNT_JSON`, `THAIWATER_API_KEY`, `TMD_API_KEY`
Repo variable `ETL_SCOPE` = `pilot` (default) | `nationwide`

Env เสริม: `ETL_RAW_DIR` (ที่เก็บไฟล์ดิบ), `ETL_OPENMETEO_BUDGET` (default 8000 call/วัน), `ETL_OPENMETEO_PAUSE_S` (default 30), `ETL_NASAPOWER_WORKERS` (≤4), `ETL_NASAPOWER_MIN_INTERVAL_S` (1.5), `ETL_NASAPOWER_LAND_KM` (15)

## โหลดข้อมูลจริงทั้งประเทศใหม่หลัง `supabase db reset` (dev local)

`supabase db reset` คืน DB เป็น seed (ข้อมูลสมมติมหาสารคาม + ขอบเขต 77 จังหวัดแบบ simplify, ทุกจังหวัด enabled — D-029)
ลำดับนี้โหลดข้อมูลจริงกลับเข้า dev DB (ทุกตัวไม่มี `--dry-run`):

```bash
etl/.venv/bin/python etl/run.py --source gistda --nationwide     # admin 77 จังหวัด + 928 อำเภอ, ชลประทาน 614   ~35 s
etl/.venv/bin/python etl/run.py --source dmr --nationwide        # หน่วยหิน 7,093 polygon                       ~20 s
etl/.venv/bin/python etl/run.py --source dgr --nationwide        # น้ำบาดาล 62 จังหวัด 11,055 polygon             ~80 s (โหลด 140 MB ครั้งแรก) / ~20 s (มีไฟล์แล้ว)
etl/.venv/bin/python etl/run.py --source nasa_power --nationwide # อากาศ 842 จุด × 2016→เมื่อวาน (~3.3M แถว)    ~25 นาที ครั้งแรก / ~3 นาที ถ้ามี cache
```

- ตำบล (subdistrict) ยังเป็น seed สมมติ 2 ตำบลในมหาสารคาม (HDX COD-AB ยังเป็น stub) → `admin.subdistrict_*` = null นอกนั้น
- `--source nasa_power` resume ได้: raw JSON ต่อจุดเก็บที่ `etl/.raw/nasa_power/cache/` (ไม่ถูกลบตอน reset) → หลัง reset รันซ้ำจะไม่ยิง API ใหม่ (ถ้าวันสิ้นสุดเดิม) · ถ้าเจอ HTTP 429 ซ้ำ ๆ ตัวโหลดหยุดยิง โหลดเฉพาะจุดที่ได้แล้ว → รอ ~2 นาทีแล้วรันคำสั่งเดิมอีกครั้ง (`skipped: already_loaded` = ครบแล้ว)
- pgTAP (`supabase test db`) ออกแบบให้ผ่านบน seed — หลังโหลดข้อมูลจริงเทสต์ที่อิง geometry seed อาจไม่ผ่าน (ตามคาด) → CI ใช้ reset + test เท่านั้น
- แปลงที่บันทึกไว้ใน `app.fields` ถูกลบตอน reset (ยกเว้น demo)

## เทสต์

```bash
cd etl && .venv/bin/python -m pytest -q
```
เทสต์ DB ใช้เฉพาะ schema ชั่วคราว `test_ref/test_staging/test_archive/test_meta` (สร้างและลบในเทสต์) — **ไม่เขียน `ref.*` จริง** (อ่าน seed เพื่อตรวจสูตร grid id เท่านั้น)

## ความปลอดภัย
- ไฟล์ที่ดาวน์โหลดเป็นข้อมูลไม่น่าเชื่อถือ: เก็บใต้ `etl/.raw/` (gitignored), แตกไฟล์ด้วย bsdtar ใต้โฟลเดอร์ raw และตรวจ path traversal / symlink, ไม่ execute อะไรจากไฟล์
- ไม่ log ค่า secret / connection string
