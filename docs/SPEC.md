# Thai Rice Digital Twin — Prompt สำหรับ Claude Code (v2 · ทั้งประเทศ)

> ไฟล์นี้คือ brief สำหรับ Claude Code ให้สร้างระบบตั้งแต่ศูนย์
> ปรับจากสเปกเดิม (Oct 2, 2026 · @Sili) โดยเปลี่ยนเป็น **Next.js + Supabase + Google Maps API**
> และเปลี่ยนการเลือกแปลงจาก "หมุด 1 จุด + วงกลมตามขนาดไร่" เป็น **"ปัก 4 จุดบนแผนที่ให้เป็น polygon"**
>
> **v2 (Oct 10, 2026):** ขยาย scope จากภาคอีสานเป็น **ทั้งประเทศ (77 จังหวัด)** · schema/ETL รองรับทั้งประเทศตั้งแต่แรก แต่เปิดใช้ทีละจังหวัดผ่าน `ref.province_coverage` · แหล่งข้อมูลผ่านการ probe จริงแล้ว (ดู `docs/DATA_SOURCES.md`) · **ชั้น LDD (ดินเค็ม/ชุดดิน) คงตารางและ field ไว้เป็น placeholder** — ยังไม่มีช่องทางดึงอัตโนมัติ ใช้ fallback จนกว่าได้ไฟล์จาก LDD

---

## 0. วิธีทำงาน (อ่านก่อนเริ่ม)

- ทำงานตาม **Phase** ในหัวข้อ 11 ทีละ phase ห้ามข้าม และ commit แยกตาม task
- ก่อนเขียนโค้ดแต่ละ phase ให้สรุปแผนสั้น ๆ (ไฟล์ที่จะสร้าง/แก้) แล้วค่อยลงมือ
- ทุก migration ของ DB ต้องอยู่ใน `supabase/migrations/` และรันได้ซ้ำด้วย `supabase db reset`
- ห้าม hardcode key ใด ๆ ใช้ `.env.local` และอัปเดต `.env.example` ทุกครั้งที่เพิ่มตัวแปร
- UI ทั้งหมดเป็น **ภาษาไทยง่าย ๆ** ออกแบบ **mobile-first** (ผู้ใช้หลักคือเกษตรกรที่ใช้มือถือ)
- ถ้าเจอจุดที่สเปกไม่ชัด ให้เลือกทางที่ง่ายที่สุดที่ไม่ปิดทางขยาย แล้วจดไว้ใน `docs/DECISIONS.md`
- **ทำงานแบบ Multi-agent (หัวข้อ 15):** session หลักทำหน้าที่ **Orchestrator** วางแผน กำหนด contract และรวมงาน ส่วนงานเฉพาะทางให้มอบหมายให้ subagent ใน `.claude/agents/` ทำ งานที่ไม่ขึ้นต่อกันให้สั่งพร้อมกันได้
- ก่อนเริ่มงาน ให้บันทึกไฟล์นี้เป็น `docs/SPEC.md` และสร้าง `CLAUDE.md` สั้น ๆ ที่ชี้มายังไฟล์นี้ เพราะ subagent ไม่เห็นบทสนทนาของ session หลัก

---

## 1. ภาพรวมโครงการ

เว็บแอปให้เกษตรกรไทยทุกภาค **ปัก 4 จุดรอบแปลงนาบน Google Maps** ระบบสร้าง polygon คำนวณพื้นที่ (ไร่-งาน-ตารางวา) อัตโนมัติ แล้วนำ polygon ไปซ้อนกับ **ข้อมูลเชิงพื้นที่ที่ fetch เก็บไว้ล่วงหน้าใน Supabase** เพื่อประเมิน 4 ด้าน ทั้งปัจจุบันและล่วงหน้า 5–10 ปี:

1. ปริมาณน้ำที่ใช้ได้ / น้ำที่ขาด
2. ผลผลิตข้าว (กก./ไร่ พร้อม P10–P90)
3. ก๊าซเรือนกระจก (CH4, N2O, CO2 → CO2e)
4. ความเค็มของดิน (ECe, ระดับความเสี่ยง)

**ความเค็มเป็นแกนกลางของทุกการคำนวณ** ไม่ใช่ output แยก โดยแยกตาม **กลไกที่มาของเกลือ** (`salinity_origin`):
- `inland_rock_salt` — **อีสาน:** ใต้ที่ราบสูงโคราชมีชั้นเกลือหินของหมวดหินมหาสารคาม (`KTms`) น้ำใต้ดินเค็มยกตัวพาเกลือขึ้นผิวดิน ดินเค็มราว 17.8 ล้านไร่ (≈17% ของภาค, เค็มจัด 1.5 ล้านไร่)
- `coastal_intrusion` — **ภาคกลางตอนล่าง / ตะวันออก / ใต้:** น้ำทะเลหนุนเข้าแม่น้ำและคลองในฤดูแล้ง + ดินเค็มชายฝั่ง → ขึ้นกับระยะจากชายฝั่ง/ปากแม่น้ำ และค่าความเค็มน้ำในลำน้ำ (ThaiWater)
- `none` — พื้นที่อื่น (ภาคเหนือส่วนใหญ่) ยังคำนวณ ECe แต่ค่าฐานต่ำ

**การเปิดใช้:** ระบบรองรับทั้งประเทศ แต่เปิดให้ผู้ใช้ประเมินได้เฉพาะจังหวัดที่ `ref.province_coverage.enabled = true` (เริ่มที่มหาสารคาม) เพื่อไม่ให้แสดงผลจากข้อมูลที่ยังไม่พร้อม

**ผู้ใช้หลัก:** เกษตรกรรายย่อย (มือถือ), เจ้าหน้าที่เกษตรอำเภอ, วิสาหกิจชุมชน/สหกรณ์
**ผู้ใช้รอง:** นักวิจัย, หน่วยงานรัฐ, ผู้ดูแลโครงการคาร์บอนเครดิต (ผ่าน API)

**หลักการออกแบบ**
- **Geospatial-first:** ข้อมูลทุกชั้นผูกกับพิกัด (SRID 4326)
- **Pre-fetched data:** ข้อมูลภายนอกทั้งหมดดึงเข้า Supabase ด้วย ETL ตามรอบ หน้าเว็บ **ไม่เรียก API ภายนอกตอนผู้ใช้ใช้งาน** (ยกเว้น Google Maps)
- **Traceable:** ทุกผลลัพธ์เก็บ `model_version` + `input_hash` + แหล่งข้อมูล ไม่เขียนทับ
- **Interactive-first:** ผลประเมินเบื้องต้นต้องขึ้นภายใน ~1–2 วินาทีหลังปักจุดครบ และอัปเดตเมื่อลากจุด

---

## 2. Tech Stack

| ชั้น | เทคโนโลยี | หมายเหตุ |
|---|---|---|
| Web | **Next.js 15 (App Router) + TypeScript** | Server Components + Route Handlers |
| UI | Tailwind CSS + shadcn/ui | ฟอนต์ไทย: `IBM Plex Sans Thai` หรือ `Noto Sans Thai` |
| Map | **MapLibre GL JS** (`maplibre-gl` v5) + ภาพดาวเทียมฟรี **Esri World Imagery** (สลับเป็น EOX Sentinel-2 cloudless ได้ด้วย `NEXT_PUBLIC_BASEMAP=esri\|eox`) + ชั้นชื่อสถานที่/ถนน Esri Reference | ไม่ใช้ API key · style สร้างในโค้ด (`components/map/basemap.ts`) · ดู DECISIONS D-030 |
| Map overlay | MapLibre native `vector` source + fill/line layers (data-driven expressions) | แสดงชั้นดินเค็ม/ดิน/น้ำบาดาลจาก vector tiles ของเราเอง (`/api/tiles`) · ไม่ใช้ deck.gl |
| Geometry ฝั่ง client | `@turf/turf` | ตรวจ self-intersection, centroid, เรียงจุด |
| Charts | Recharts | กราฟผลผลิต/น้ำ/ECe รายปี |
| DB | **Supabase (Postgres + PostGIS)** | แทน PostgreSQL+TimescaleDB เดิม |
| Auth | **Auth.js v5 (NextAuth) — Google Login อย่างเดียว** | server mint Supabase JWT (HS256) ต่อ request เพื่อให้ RLS `auth.uid()` ทำงาน · ผู้ใช้อยู่ใน `app.users` (ดู DECISIONS D-026) · ระยะ 3 พิจารณา LINE Login |
| Job queue | **Supabase Queues (pgmq)** + `pg_cron` | งานหนัก (twin 10 ปี) รันแบบ background |
| Realtime | Supabase Realtime | แจ้งหน้าเว็บเมื่อ job เสร็จ |
| Model (Phase 1) | TypeScript ใน `packages/model` | สูตร FAO-56 / IPCC / Maas–Hoffman เรียกได้ทั้ง server และ client |
| Model (Phase 2) | Python worker (`pyfao56`, `DSSATTools`) | Docker, ดึง job จาก pgmq |
| ETL | Python (`geopandas`, `GDAL`, `requests`) + GitHub Actions cron | โหลดเข้า Supabase ผ่าน `psycopg` / `ogr2ogr` |
| Satellite | Google Earth Engine (Python API) | เก็บเฉพาะค่าสรุปต่อแปลง/ต่อกริด |
| Deploy | Vercel (web) + Supabase (region Singapore `ap-southeast-1`) + worker บน Cloud Run/Fly.io | เพื่อ PDPA ให้ข้อมูลอยู่ในภูมิภาค |

> **หมายเหตุ TimescaleDB:** Supabase เลิกรองรับ extension `timescaledb` ใน Postgres เวอร์ชันใหม่ ให้ใช้ตารางปกติ + **declarative partitioning ตามปี** + BRIN index บนคอลัมน์วันที่แทน

---

## 3. โครงสร้าง Repo

```
thai-rice-twin/
├─ apps/
│  └─ web/                         # Next.js
│     ├─ app/
│     │  ├─ (marketing)/
│     │  │  ├─ layout.tsx          # header/footer ของหน้าสาธารณะ
│     │  │  ├─ page.tsx            # Landing Page (หัวข้อ 5.0)
│     │  │  ├─ about/page.tsx
│     │  │  ├─ privacy/page.tsx    # นโยบาย PDPA
│     │  │  └─ terms/page.tsx
│     │  ├─ login/page.tsx
│     │  ├─ admin/data/page.tsx    # สถานะการอัปเดตข้อมูลหลังบ้าน (หัวข้อ 6.1)
│     │  ├─ map/page.tsx           # หน้าแผนที่หลัก: ปัก 4 จุด + ผลประเมินสด
│     │  ├─ fields/[id]/page.tsx   # รายงานแปลง + digital twin
│     │  ├─ fields/[id]/scenarios/page.tsx
│     │  ├─ api/
│     │  │  ├─ analyze/route.ts           # POST polygon → profile + quick model
│     │  │  ├─ fields/route.ts            # CRUD แปลง
│     │  │  ├─ fields/[id]/runs/route.ts  # สั่ง twin run (enqueue)
│     │  │  ├─ tiles/[layer]/[z]/[x]/[y]/route.ts   # MVT จาก PostGIS
│     │  │  └─ open/v1/...                # Open data API (Phase 3)
│     ├─ components/
│     │  ├─ map/FieldDrawer.tsx    # logic ปัก/ลาก 4 จุด
│     │  ├─ map/LayerToggle.tsx
│     │  ├─ map/AreaBadge.tsx
│     │  ├─ results/ResultPanel.tsx
│     │  └─ results/*Card.tsx
│     └─ lib/
│        ├─ supabase/{client,server}.ts
│        ├─ geo/{area,validate,order}.ts
│        └─ units.ts               # ไร่-งาน-ตารางวา ↔ ไร่ทศนิยม ↔ m² ↔ ha
├─ CLAUDE.md                       # บริบทสั้นสำหรับทุก agent + ชี้ไป docs/SPEC.md
├─ .claude/
│  └─ agents/                      # นิยาม subagent (หัวข้อ 15)
├─ packages/
│  ├─ contracts/                   # zod schema + TS types ที่ทุกส่วนใช้ร่วมกัน (Orchestrator เป็นเจ้าของ)
│  └─ model/                       # pure TS, unit-tested (vitest)
│     ├─ waterBalance.ts
│     ├─ yield.ts
│     ├─ ghg.ts
│     ├─ salinity.ts
│     └─ runSeason.ts              # รวม 4 ด้านรายวันในลูปเดียว
├─ workers/
│  └─ twin/                        # Python (Phase 2)
├─ etl/
│  ├─ sources/{dmr,ldd,dgr,thaiwater,tmd,openmeteo,chirps,cmip6,gee}.py
│  ├─ pipeline.py                  # fetch → checksum → staging → validate → swap → recompute
│  └─ run.py                       # CLI: python run.py --tier quarterly | semiannual | daily | --source ldd
├─ .github/workflows/
│  ├─ etl-daily.yml
│  ├─ etl-quarterly.yml            # ทุก 3 เดือน
│  ├─ etl-semiannual.yml           # ทุก 6 เดือน
│  └─ ci.yml
├─ supabase/
│  ├─ migrations/
│  ├─ seed.sql
│  └─ functions/                   # Edge Functions (ถ้าจำเป็น)
└─ docs/{DECISIONS.md,DATA_SOURCES.md}
```

ใช้ `pnpm` workspaces

---

## 4. Environment Variables (`.env.example`)

```bash
# Map (MapLibre + free imagery, no key — D-030)
NEXT_PUBLIC_BASEMAP=esri

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=            # ใช้ฝั่ง server/ETL/worker เท่านั้น
DATABASE_URL=                         # สำหรับ ETL (direct connection)

# ETL
THAIWATER_API_KEY=
TMD_API_KEY=
GEE_SERVICE_ACCOUNT_JSON=
```

---

## 5. UX: Landing Page, การปัก 4 จุด และ Responsive

### 5.0 Landing Page (`/`)

ทางเข้าหลักของระบบ เป้าหมายคือให้เกษตรกรเข้าใจภายใน 10 วินาทีว่าเว็บนี้ทำอะไรให้ และกดเริ่มใช้ได้ทันที **ไม่ต้องสมัครก่อน** (ต้อง login เฉพาะตอนบันทึกแปลง)

**ส่วนประกอบหน้า (เรียงจากบนลงล่าง)**

| ส่วน | เนื้อหา |
|---|---|
| Header | โลโก้ + เมนู (วิธีใช้, ข้อมูลที่ใช้, สำหรับหน่วยงาน) + ปุ่ม "เข้าสู่ระบบ" · ถ้า login แล้วเปลี่ยนเป็น "แปลงของฉัน" · บนมือถือย่อเป็น hamburger |
| Hero | หัวข้อภาษาง่าย เช่น *"รู้ล่วงหน้า นาของคุณจะได้น้ำ ได้ข้าว และเค็มแค่ไหน"* · คำโปรยหนึ่งบรรทัด · ปุ่มหลัก **"เริ่มประเมินแปลงนา ฟรี"** → `/map` · ปุ่มรอง "ดูตัวอย่างรายงาน" → `/fields/demo` · ภาพประกอบเป็น **ภาพนิ่ง** แผนที่ประเทศไทยไล่สีความเค็ม (ห้ามโหลด Google Maps ในหน้านี้ เพื่อให้เปิดเร็วและไม่เสียค่า API) |
| วิธีใช้ 3 ขั้น | ① แตะ 4 มุมแปลงบนแผนที่ → ② ระบบวิเคราะห์ดิน น้ำ หิน อากาศ → ③ ดูผลและคำแนะนำ · ใช้ไอคอน + ภาพหน้าจอมือถือ |
| ผลที่จะได้ 4 ด้าน | การ์ด น้ำ / ผลผลิต / ก๊าซเรือนกระจก / ความเค็ม พร้อมตัวอย่างตัวเลข |
| ทำไมความเค็มสำคัญ | 2 กลไก: ดินเค็มอีสานจากชั้นเกลือหินมหาสารคาม (17.8 ล้านไร่) + น้ำทะเลหนุนในลุ่มเจ้าพระยา/ชายฝั่ง · แผนที่จังหวัดที่เปิดใช้แล้ว (จาก `ref.province_coverage`) |
| ตัวอย่างรายงาน | ภาพหน้าจอรายงานแปลง + พยากรณ์ 10 ปีแบบมีช่วง P10–P90 |
| สำหรับหน่วยงาน/นักวิจัย | เจ้าหน้าที่เกษตร, สหกรณ์, คาร์บอนเครดิต, Open API (ป้าย "เร็ว ๆ นี้" จนถึง Phase 3) |
| แหล่งข้อมูล | รายชื่อหน่วยงาน (DMR, LDD, DGR, TMD, สสน., RID, GISTDA) + ERA5-Land / SoilGrids + attribution + **"อัปเดตข้อมูลล่าสุด: <วันที่>"** ดึงจาก `meta.data_snapshots` (หัวข้อ 6.1) |
| FAQ | ใช้ฟรีไหม · ต้องสมัครไหม · ข้อมูลแปลงของฉันปลอดภัยไหม (PDPA) · แม่นแค่ไหน · จังหวัดของฉันใช้ได้หรือยัง |
| Footer | นโยบายความเป็นส่วนตัว, เงื่อนไขการใช้งาน, ติดต่อ, attribution ข้อมูล |

**ข้อกำหนดทางเทคนิค**
- เป็น Server Component ทั้งหน้า ใช้ static generation + `revalidate = 86400` (วันที่อัปเดตข้อมูลรีเฟรชวันละครั้ง)
- `<html lang="th">`, `metadata` ครบ (title, description, Open Graph, `opengraph-image.tsx`), `sitemap.ts`, `robots.ts`
- ภาพใช้ `next/image` (WebP/AVIF) ส่วน hero ใส่ `priority`
- seed แปลงตัวอย่าง `demo` (อ่านได้สาธารณะ อ่านอย่างเดียว) ให้ปุ่ม "ดูตัวอย่างรายงาน" ใช้งานได้
- เป้าหมาย Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, LCP < 2.5s บน 4G

### 5.1 Flow ผู้ใช้ (หน้า `/map`)

1. เปิดหน้า → แผนที่ภาพถ่ายดาวเทียม (Esri World Imagery + ชั้นชื่อหมู่บ้าน/ถนน) ซูมไปที่ตำแหน่ง GPS ถ้าผู้ใช้อนุญาต ไม่งั้นซูมทั้งประเทศ (center ≈ 13.0, 101.0, zoom 5.5) หรือจังหวัดนำร่องถ้าเปิดใช้จังหวัดเดียว
2. ปุ่มลอย **"📍 ตำแหน่งฉัน"** ซูมไป zoom 17
3. แถบคำแนะนำด้านบน: *"แตะมุมแปลงนาของคุณให้ครบ 4 มุม"* พร้อมตัวนับ `1/4 … 4/4`
4. แตะแผนที่ → วาง **MapLibre `Marker`** หมายเลข 1–4 (วงกลมสีเขียว ตัวเลขขาว ขนาดใหญ่พอสำหรับนิ้ว ≥ 44px)
5. ตั้งแต่จุดที่ 2 วาดเส้นเชื่อมจุด (GeoJSON line layer), ครบ 4 จุด → เปลี่ยนเป็น polygon ปิด (GeoJSON fill + line, fill โปร่ง 25%, แดงเมื่อเส้นไขว้)
6. ทุกจุด **ลากได้** (`Marker({ draggable: true })`) → polygon, พื้นที่ และผลประเมินอัปเดตแบบ debounce 400ms
7. แสดง **AreaBadge** ลอยกลาง polygon: `12 ไร่ 2 งาน 35 ตร.ว.`
8. ปุ่ม **"ย้อนกลับ"** (ลบจุดล่าสุด) และ **"เริ่มใหม่"**
9. ครบ 4 จุดและผ่าน validation → เรียก `POST /api/analyze` อัตโนมัติ → **ResultPanel** เลื่อนขึ้นจากด้านล่าง (bottom sheet บนมือถือ / sidebar บน desktop)
10. ResultPanel มีฟอร์มเสริมแบบพับได้ (พันธุ์, นาปี/นาปรัง, วิธีปลูก, การจัดการน้ำ, ปุ๋ย, การเผาฟาง ฯลฯ — หัวข้อ 5.4) เปลี่ยนค่าแล้วคำนวณใหม่ทันทีฝั่ง client (ไม่ต้องยิง DB ซ้ำ เพราะ profile ได้มาแล้ว)
11. ปุ่ม **"บันทึกแปลงนี้"** → ถ้ายังไม่ login ให้ login ด้วย Google (Auth.js) → ตั้งชื่อแปลง → insert `app.fields` → ไป `/fields/[id]`

### 5.2 Geometry logic (`lib/geo/*`)

- **เรียงจุดอัตโนมัติ** (`order.ts`): เมื่อครบ 4 จุด เรียงตามมุมรอบ centroid (counter-clockwise) เพื่อกัน polygon ไขว้เป็นรูปผีเสื้อ แล้วเปลี่ยนเลขบน marker ตามลำดับใหม่
- **คำนวณพื้นที่** (`area.ts`): ใช้ `google.maps.geometry.spherical.computeArea(path)` (m²) และ cross-check ด้วย `turf.area`
  - `1 ไร่ = 1,600 m²`, `1 งาน = 400 m²`, `1 ตร.ว. = 4 m²`, `1 ไร่ = 0.16 ha`
- **Validation** (`validate.ts`) — แสดงข้อความภาษาไทยใต้แผนที่:
  | เงื่อนไข | การจัดการ |
  |---|---|
  | polygon ไขว้ตัวเอง (`turf.kinks` > 0) หลังเรียงแล้ว | แจ้ง "มุมแปลงไขว้กัน ลองลากจุดใหม่" — ห้ามวิเคราะห์ |
  | พื้นที่ < 0.5 ไร่ หรือ > 500 ไร่ | เตือน + ปุ่ม "ยืนยันว่าถูกต้อง" |
  | ด้านใดด้านหนึ่งยาว > 3 กม. | เตือน "แปลงใหญ่ผิดปกติ" |
  | อยู่นอกประเทศไทย | ตรวจฝั่ง server ใน `analyze_polygon` → `OUTSIDE_THAILAND` → แจ้ง "รองรับเฉพาะพื้นที่ในประเทศไทย" |
  | อยู่ในจังหวัดที่ยังไม่เปิดใช้ | `PROVINCE_NOT_ENABLED` → แจ้ง "จังหวัด<ชื่อ>ยังไม่เปิดให้ประเมิน" + รายชื่อจังหวัดที่เปิดแล้ว |
- ส่ง polygon ไป server เป็น **GeoJSON Polygon** (ring ปิด, `[lng, lat]`)

### 5.3 ชั้นข้อมูลบนแผนที่ (LayerToggle)

ปุ่มเปิด/ปิดชั้น (ค่าเริ่มต้น: ปิดทั้งหมด ยกเว้นตอนผู้ใช้กดดู):
- ดินเค็ม (LDD) — สีเหลือง→แดงตามระดับ · **ซ่อนปุ่มอัตโนมัติถ้า `ref.saline_soil_zones` ยังว่าง** (LDD placeholder)
- กลุ่มชุดดิน (LDD) — เงื่อนไขเดียวกัน
- คุณภาพน้ำบาดาล / EC (DGR)
- หมวดหินมหาสารคาม (DMR)
- เขตชลประทาน (RID)
- แหล่งน้ำ

ทำงานด้วย MapLibre `vector` source + fill/line layers (D-030) ชี้ไปที่ `/api/tiles/{layer}/{z}/{x}/{y}` ซึ่งเรียก RPC `public.mvt_tile(layer, z, x, y)` (ใช้ `ST_AsMVT`) และตั้ง `Cache-Control: public, max-age=86400`

### 5.4 Input เสริม (ไม่บังคับ — มีค่าเริ่มต้น)

| ข้อมูล | ใช้กับโมเดล | ค่าเริ่มต้น |
|---|---|---|
| พันธุ์ข้าว (หอมมะลิ 105, กข6, กข15, กข41, กข47, ปทุมธานี 1, สันป่าตอง 1 …) | ผลผลิต, ความทนเค็ม | ค่าเริ่มต้นตามภาค (`ref.province_coverage.default_variety`) |
| ฤดู/รอบปลูก (นาปี / นาปรังรอบ 1 / รอบ 2), วันปลูก | น้ำ, ผลผลิต, CH4 | นาปี, ปฏิทินจากดาวเทียมของกริดนั้น (เขตชลประทานภาคกลางมีได้ 2–3 รอบ/ปี) |
| นาดำ / นาหว่าน, น้ำฝน / ชลประทาน | น้ำ, CH4 | นาหว่าน, น้ำฝน (หรือชลประทานถ้า polygon อยู่ในเขต RID) |
| การจัดการน้ำ (ขังตลอด / AWD) | CH4 | ขังตลอด |
| ปุ๋ยเคมี/อินทรีย์ (N กก./ไร่), การเผาฟาง | ผลผลิต, N2O, CO2 | ค่าเฉลี่ยจังหวัด |
| ผลผลิตจริงปีก่อน (กก./ไร่) | calibrate twin | – |
| ค่า EC ดิน/น้ำที่วัดเอง | ความเค็ม | จากแผนที่ |

### 5.5 Responsive Design

ออกแบบ **mobile-first** ทุกหน้า แล้วขยายขึ้นด้วย breakpoint ของ Tailwind (`sm 640` · `md 768` · `lg 1024` · `xl 1280`)

**Layout หน้า `/map` ตามขนาดจอ**

| ขนาดจอ | Layout |
|---|---|
| มือถือแนวตั้ง (< 768px) | แผนที่เต็มจอ (`h-dvh`) · ปุ่มควบคุมลอยมุมล่างขวา · ResultPanel เป็น **bottom sheet** (shadcn `Drawer` / vaul) มี 3 ระดับ: ยกขึ้นนิดหน่อย 25% (สรุป 4 ตัวเลข), ครึ่งจอ 50%, เต็มจอ 90% · แผนที่ยังเห็นด้านบนเสมอเพื่อลากจุดต่อได้ |
| มือถือแนวนอน | ResultPanel ย้ายเป็นแผงข้างขวา กว้าง 45% แทน bottom sheet |
| แท็บเล็ต (768–1023px) | แนวตั้งใช้ bottom sheet แบบสูงสุด 60% · แนวนอนใช้แผงข้างขวากว้าง 360px |
| Desktop (≥ 1024px) | แผงข้างซ้ายกว้าง 400px (ฟอร์ม + ผลลัพธ์ เลื่อนดูได้) + แผนที่เต็มพื้นที่ที่เหลือ · `xl` ขึ้นไปกราฟวางเป็น 2 คอลัมน์ |

**หน้าอื่น**
- Landing: hero เรียงเป็นแนวตั้งบนมือถือ (ข้อความ → ปุ่ม → ภาพ) และเป็น 2 คอลัมน์ตั้งแต่ `lg` · การ์ด 4 ด้านเรียงเป็น 1 → 2 → 4 คอลัมน์
- `/fields/[id]`: บนมือถือใช้แท็บ (ภาพรวม / พยากรณ์ / ทางเลือก) · บน desktop ใช้ dashboard grid · ตารางเปรียบเทียบ scenario บนมือถือเปลี่ยนเป็นการ์ดซ้อน หรือเลื่อนแนวนอนโดยตรึงคอลัมน์แรกไว้
- รายงานแปลงมี print stylesheet (`@media print`) ขนาด A4 พิมพ์ได้ 1 หน้า

**กติกา**
- ปุ่มและ marker แตะได้ขนาด ≥ 44×44px · ระยะห่างระหว่างปุ่ม ≥ 8px
- ใช้ `dvh` แทน `vh` (แถบที่อยู่ของเบราว์เซอร์มือถือ) และเผื่อ `env(safe-area-inset-*)` สำหรับรอยบากและแถบ home
- input ฟอนต์ ≥ 16px กัน iOS ซูมอัตโนมัติ · เนื้อความขั้นต่ำ 16px · อัตราส่วนสีผ่าน WCAG AA (ใช้กลางแดดได้)
- แผนที่ (MapLibre): หน้า `/map` เลื่อนแผนที่ด้วยนิ้วเดียว + pinch zoom ปิดการหมุน/เอียง ส่วนแผนที่ฝังในหน้าเลื่อนได้ เช่น `/fields/[id]` ให้ใช้โหมด cooperative gestures เพื่อไม่ให้แย่งการ scroll หน้า
- ไม่ใช้ปุ่มควบคุม default ของแผนที่ (เหลือเฉพาะ attribution) ใช้ปุ่มของเราเองที่ใหญ่กว่า
- โหลดแผนที่ (maplibre-gl + CSS) และ Recharts ด้วย `next/dynamic` (`ssr: false`) เพื่อให้ JS เริ่มต้นเบา
- ทดสอบที่ viewport: **360×800** (Android ราคาประหยัด ซึ่งพบบ่อยในพื้นที่ชนบท), 390×844, 768×1024, 1024×768, 1366×768, 1920×1080 ด้วย Playwright (`projects` ต่ออุปกรณ์) + ภาพ screenshot เทียบ

---

## 6. แหล่งข้อมูล (Pre-fetch ด้วย ETL เข้า Supabase)

หน้าเว็บอ่านจาก Supabase เท่านั้น ETL ทำหน้าที่ดึง → แปลงพิกัดเป็น 4326 → simplify geometry → ตรวจคุณภาพ → upsert → บันทึก `meta.ingest_jobs`

| หมวด | แหล่งหลัก (ไทย) | วิธีดึง (probe แล้ว Oct 10, 2026) | เสริม (โลก/ดาวเทียม) | รอบ | สถานะ |
|---|---|---|---|---|---|
| 1. ธรณีวิทยา | DMR หน่วยหิน 1:250,000 (`GEOL/ROCK_UNIT_250K`, ทั้งประเทศ 7,093 polygon, `KTms` 21 polygon) | ArcGIS REST `query?f=geojson` แบ่งหน้าละ ≤ 2,000 (`resultOffset`) | ความลึกชั้นเกลือหิน: ยังไม่มีแหล่ง → `rock_salt_depth_m` เป็น null ได้ | ครึ่งปี | ✅ |
| 2. ดิน | **LDD: กลุ่มชุดดิน 1:25,000, ดินเค็ม/คราบเกลือ** | **ยังไม่มีช่องทางอัตโนมัติ** → ทำหนังสือขอ shapefile · ETL มี loader `ldd.py` รับไฟล์ที่วางใน Storage `etl-raw/ldd/manual/` | **SoilGrids 250m (อ่าน COG/WCS ไม่ใช่ REST)**, Sentinel-2 salinity index | 2–3 ปี | ⏸ placeholder |
| 3. อากาศ | TMD (ค่าสังเกตวันนี้เท่านั้น ไม่มีย้อนหลัง), ฝน ThaiWater | REST | **ERA5-Land** ย้อนหลังแบบ bulk จาก `s3://openmeteo/data/copernicus_era5_land/` หรือ Copernicus CDS · Open-Meteo API สำหรับ daily/พยากรณ์ · NASA POWER สำรอง · CHIRPS · NEX-GDDP-CMIP6 (S3) | รายวัน | ✅ |
| 4. น้ำใต้ดิน | DGR แผนที่น้ำบาดาล 1:100,000 รายจังหวัด (data.go.th, Open Data Common) | ไฟล์ **`.rar`** (บางจังหวัด `.zip`) → แตกด้วย `unar`/`7z` | GRACE | ครึ่งปี | ⚠️ 62/77 จังหวัด |
| 5. น้ำผิวดิน | ThaiWater public API (ไม่ต้องใช้ key, คืนทั้งประเทศ 1–5 MB/ครั้ง), เขตชลประทาน **GISTDA `L09_rice/พื้นที่ชลประทาน_`** (615 polygon) | REST → กรองฝั่ง ETL | JRC Global Surface Water, Sentinel-1 | รายชั่วโมง–รายวัน | ✅ |
| 6. พื้นที่ | ขอบเขตจังหวัด/อำเภอ GISTDA 1:50k (REST), ตำบลจาก HDX COD-AB (zip 437 MB) | REST / ไฟล์ | Copernicus DEM GLO-30 (S3 COG), Sentinel-2 NDVI, GISTDA พื้นที่ปลูกข้าวรายครึ่งเดือน | ตามแหล่ง | ✅ |

URL และผล probe ละเอียดอยู่ใน `docs/DATA_SOURCES.md`

**กลยุทธ์ "กริดล่วงหน้า"** (ทำให้ interactive เร็ว): สร้างตาราง `ref.grid_cells` ขนาด **0.01° (~1.1 กม.)** ครอบคลุม **ทั้งประเทศ (~430,000 cell)** แล้วให้ ETL เติมค่าที่มาจาก raster ลงกริดล่วงหน้า (DEM, SoilGrids, ค่าปกติภูมิอากาศ, ปฏิทินปลูก, ดัชนีเค็ม, ระยะจากชายฝั่ง) **ด้วยการอ่าน raster ทั้งก้อน (rasterio zonal stats) ห้ามยิง point API ทีละ cell** ส่วนอากาศรายวันเก็บที่กริดหยาบ **0.1°** (`ref.weather_grid`, ~4,300 cell) → polygon ไหนก็ lookup ได้ทันทีโดยไม่ต้องเรียก API ภายนอก

**งบปริมาณข้อมูล (ทั้งประเทศ)**
| รายการ | ขนาดโดยประมาณ | ผล |
|---|---|---|
| `obs.weather_daily` 0.1° × 20 ปี | ~31 ล้านแถว ≈ 3.7 GB | ต้องใช้ **Supabase Pro** (Free 500 MB ไม่พอ) |
| ดึงย้อนหลังผ่าน Open-Meteo API | ~2.2 ล้าน call ≈ 220 วันบน free tier | **ห้ามใช้ API สำหรับ backfill** → ใช้ ERA5-Land bulk |
| `ref.grid_cells` 0.01° | ~430k แถว | ปกติ |
| SoilGrids REST | ~5 call/นาที | ใช้ไม่ได้กับทั้งประเทศ → อ่าน COG |

**ข้อควรระวัง:**
- ThaiWater ไม่ระบุ license ชัด → cache ฝั่ง backend และแสดง attribution "คลังข้อมูลน้ำแห่งชาติ (สสน.)" เสมอ
- **LDD placeholder:** ตาราง `ref.soil_units`, `ref.saline_soil_zones` และ field ที่เกี่ยวข้องสร้างครบตาม schema แต่ **ว่างได้** · `analyze_polygon` และโมเดลต้องทำงานได้เมื่อตารางว่าง โดยใช้ SoilGrids + Sentinel-2 + DGR EC แทน และติดธง `confidence: 'low'` + `source: 'fallback'` · เมื่อได้ไฟล์ LDD ให้โหลดผ่าน pipeline ปกติ (stage → validate → swap → recompute) แล้วแปลงที่เคยคำนวณถูก mark `stale` อัตโนมัติ
- **DGR ขาด 14 จังหวัด** (เชียงราย เชียงใหม่ น่าน พะเยา แพร่ แม่ฮ่องสอน ลำปาง ลำพูน อุตรดิตถ์ ยะลา ระนอง สงขลา สตูล สุราษฎร์ธานี) + เพชรบูรณ์ไม่มีลิงก์ → ขอจาก DGR · ระหว่างนี้ groundwater = null, `confidence: 'low'`
- ไฟล์ DGR ข้างใน `.rar` ยังไม่ได้ตรวจ schema → ETL ต้อง map field ด้วย config ต่อจังหวัด (`etl/sources/dgr_fieldmap.yaml`) ไม่ hardcode

### 6.1 อัปเดตข้อมูลหลังบ้านอัตโนมัติ (ทุก 3–6 เดือน)

ข้อมูลอ้างอิงต้องอัปเดตเองตามรอบโดยไม่ต้องมีคนกด และ**ห้ามทำให้เว็บล่มหรือได้ข้อมูลครึ่ง ๆ กลาง ๆ** ระหว่างอัปเดต

**รอบการอัปเดต** (กำหนดใน `meta.data_sources.refresh_tier` เพื่อปรับได้โดยไม่ต้องแก้โค้ด)

| Tier | รอบ | แหล่งข้อมูล | ตัวรัน |
|---|---|---|---|
| `daily` | ทุกวัน 02:00 น. | อากาศรายวัน (Open-Meteo/TMD), ฝนและอ่างเก็บน้ำ (ThaiWater) | GitHub Actions cron (หรือ `pg_cron` → Edge Function สำหรับงานเบา) |
| `quarterly` | **ทุก 3 เดือน** (1 ม.ค. / เม.ย. / ก.ค. / ต.ค.) | ระดับและคุณภาพน้ำบาดาล (DGR), คุณภาพน้ำ (ThaiWater), CHIRPS, Sentinel-2 NDVI/ดัชนีเค็ม → `ref.grid_cells` + `obs.sat_indices`, Sentinel-1 พื้นที่น้ำขัง, ปฏิทินปลูก | GitHub Actions `etl-quarterly.yml` |
| `semiannual` | **ทุก 6 เดือน** (1 ม.ค. / ก.ค.) | ตรวจไฟล์ LDD ที่วางมือใน Storage (placeholder), น้ำบาดาลรายจังหวัด (DGR), เขตชลประทาน (GISTDA), ขอบเขตปกครอง, JRC Surface Water, SoilGrids, หน่วยหิน (DMR) | GitHub Actions `etl-semiannual.yml` |
| `static` | ครั้งเดียว / สั่งเอง | CMIP6, DEM, **ERA5-Land backfill 20 ปี** | `workflow_dispatch` |

ตัวอย่าง cron (เวลาเป็น UTC, 19:00 UTC = 02:00 น. ไทยของวันถัดไป):
```yaml
# .github/workflows/etl-quarterly.yml
on:
  schedule: [{ cron: "0 19 1 1,4,7,10 *" }]
  workflow_dispatch:
    inputs: { source: { description: "รันเฉพาะแหล่ง (เว้นว่าง = ทั้ง tier)", required: false } }
jobs:
  etl:
    runs-on: ubuntu-latest
    timeout-minutes: 300
    container: ghcr.io/osgeo/gdal:ubuntu-small-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install -r etl/requirements.txt
      - run: python etl/run.py --tier quarterly ${{ inputs.source && format('--source {0}', inputs.source) || '' }}
        env: { DATABASE_URL: "${{ secrets.DATABASE_URL }}", GEE_SERVICE_ACCOUNT_JSON: "${{ secrets.GEE_SERVICE_ACCOUNT_JSON }}", ETL_ALERT_WEBHOOK: "${{ secrets.ETL_ALERT_WEBHOOK }}" }
```
> ใช้ GitHub Actions เพราะ ETL ต้องใช้ Python + GDAL ซึ่ง `pg_cron` รันไม่ได้ ถ้างานยาวเกิน 6 ชม. ให้ย้ายไป Cloud Run Jobs + Cloud Scheduler โดยใช้ `etl/run.py` ตัวเดิม

**Pipeline ต่อแหล่ง (`etl/pipeline.py`)**
1. **Check** — ตรวจว่าต้นทางเปลี่ยนไหม (ETag / Last-Modified / sha256 ของไฟล์ / จำนวน feature จาก ArcGIS `returnCountOnly`) ถ้าไม่เปลี่ยน ให้บันทึก `skipped` แล้วจบ
2. **Fetch** — ดาวน์โหลดพร้อม retry (exponential backoff 3 ครั้ง) และเก็บไฟล์ดิบไว้ใน Supabase Storage bucket `etl-raw/<source>/<date>/` เพื่อตรวจย้อนหลัง
3. **Stage** — แปลงเป็น 4326, `ST_MakeValid`, simplify แล้วโหลดลง schema `staging` (ตารางชื่อเดียวกับ `ref.*`)
4. **Validate** — จำนวนแถวเปลี่ยนไม่เกิน ±30% จากรอบก่อน, geometry valid 100%, ครอบคลุมจังหวัดที่ต้นทางมีข้อมูล (เทียบกับ `ref.province_coverage` ของแหล่งนั้น), ไม่มีค่า null ในคอลัมน์บังคับ, ค่าอยู่ในช่วงสมเหตุสมผล (เช่น EC 0–50 dS/m) · ถ้าไม่ผ่าน ให้หยุด ไม่แตะข้อมูลจริง และแจ้งเตือน
5. **Swap** — ใน transaction เดียว: rename `ref.x` → `archive.x_<version>` และ `staging.x` → `ref.x` แล้วสร้าง index ใหม่ (ผู้ใช้ไม่เห็นช่วงข้อมูลว่าง) · เก็บ archive ย้อนหลัง 2 เวอร์ชันไว้ rollback
6. **Record** — insert `meta.data_snapshots` (เวอร์ชัน, checksum, จำนวนแถว, วันที่) และอัปเดต `meta.ingest_jobs`
7. **Recompute** — หาแปลงที่ geometry ตัดกับพื้นที่ที่ข้อมูลเปลี่ยน (`ST_Intersects` กับ diff ระหว่างเวอร์ชันเก่าและใหม่) → ส่งเข้าคิว `profile_refresh` เพื่ออัปเดต `sim.field_profile` และ mark ผลจำลองเดิมว่า `stale` (**ไม่ลบ** เพราะผลเก่าต้องตรวจย้อนได้)
8. **Notify** — ส่งสรุปไป `ETL_ALERT_WEBHOOK` (Slack/Discord หรือ LINE Messaging API) ทั้งตอนสำเร็จและล้มเหลว · ถ้า tier ใดไม่สำเร็จเกินรอบที่กำหนด ให้ขึ้นแบนเนอร์ใน `/admin/data`

**ตารางเพิ่ม**
```sql
alter table meta.data_sources
  add column refresh_tier text check (refresh_tier in ('daily','quarterly','semiannual','static')),
  add column last_checksum text, add column last_success_at timestamptz, add column next_run_at timestamptz;

create table meta.data_snapshots (
  id bigserial primary key, source_code text references meta.data_sources(code),
  version text not null, checksum text, row_count int, bbox geometry(Polygon,4326),
  changed_area geometry(MultiPolygon,4326),     -- ใช้หาแปลงที่ต้อง recompute
  storage_path text, created_at timestamptz default now()
);
create schema if not exists staging;
create schema if not exists archive;
alter table sim.model_runs add column is_stale boolean default false;
```

**หน้า `/admin/data`** (เฉพาะ role `admin` ตรวจจาก `app_metadata.role` ใน JWT)
- ตารางทุกแหล่ง: tier, อัปเดตล่าสุด, รอบถัดไป, สถานะ (✅ / ⚠️ / ❌), จำนวนแถว, ลิงก์ log
- ปุ่ม **"รันตอนนี้"** → เรียก GitHub API `workflow_dispatch` พร้อม `source`
- ปุ่ม **"ย้อนกลับเวอร์ชันก่อน"** → swap กลับจาก `archive`
- ผู้ใช้ทั่วไปเห็นแค่ "อัปเดตข้อมูลล่าสุด" บน Landing และในรายงานแปลง (บอกด้วยว่ารายงานคำนวณจากข้อมูลเวอร์ชันไหน)

เพิ่มใน `.env.example`: `ETL_ALERT_WEBHOOK=`, `GITHUB_DISPATCH_TOKEN=` (ใช้ฝั่ง server เท่านั้น)

---

## 7. Database (Supabase)

### 7.1 Extensions & Schemas

```sql
create extension if not exists postgis with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pgmq;

create schema if not exists ref;   -- แผนที่อ้างอิง (read-only สำหรับ client)
create schema if not exists obs;   -- อนุกรมเวลา
create schema if not exists app;   -- ข้อมูลผู้ใช้ (RLS)
create schema if not exists sim;   -- ผลจำลอง (ไม่เขียนทับ)
create schema if not exists meta;  -- แหล่งข้อมูล, ingest jobs, model versions
```

> **การเข้าถึงจาก Next.js:** ไม่ expose schema `ref/obs/sim/meta` ผ่าน PostgREST โดยตรง ให้เข้าผ่าน **RPC function ใน `public`** (`security definer`, `set search_path`) ส่วน `app` expose ได้แต่ต้องเปิด **RLS** ทุกตาราง

### 7.2 ตารางหลัก

```sql
-- ===== ref =====
create table ref.admin_boundaries (
  id serial primary key, level text check (level in ('province','district','subdistrict')),
  code text unique, name_th text, province_code text,
  region text check (region in ('north','northeast','central','east','west','south')),
  geom geometry(MultiPolygon,4326) not null
);
-- จังหวัดที่เปิดให้ประเมิน + ความพร้อมข้อมูลรายแหล่ง (แก้ได้โดยไม่ต้อง deploy)
create table ref.province_coverage (
  province_code text primary key,
  enabled boolean not null default false,          -- เปิดให้ผู้ใช้ประเมินได้
  salinity_origin text check (salinity_origin in ('inland_rock_salt','coastal_intrusion','mixed','none')),
  default_variety text,
  has_ldd_soil boolean default false,              -- LDD placeholder: true เมื่อโหลดไฟล์ LDD แล้ว
  has_ldd_saline boolean default false,
  has_dgr boolean default false,
  note text
);
-- LDD placeholder: สร้างตารางครบ แต่ว่างได้จนกว่าได้ไฟล์จาก LDD
create table ref.soil_units (
  id serial primary key, soil_group text, soil_series text, texture text,
  drainage text, ph numeric, ksat_mm_day numeric, awc_mm_m numeric,
  source_id int, geom geometry(MultiPolygon,4326) not null
);
create table ref.saline_soil_zones (
  id serial primary key, salinity_level text check (salinity_level in ('very_high','high','moderate','low','none')),
  salt_crust_pct numeric,
  salinity_origin text check (salinity_origin in ('inland_rock_salt','coastal_intrusion')),
  source_id int, geom geometry(MultiPolygon,4326) not null
);
create table ref.geology_units (
  id serial primary key, unit_code text, unit_name text, is_maha_sarakham boolean,
  rock_salt_depth_m numeric, source_id int, geom geometry(MultiPolygon,4326) not null
);
create table ref.groundwater_zones (
  id serial primary key, quality_class text, ec_dsm numeric, tds_mgl numeric,
  depth_m numeric, yield_m3_hr numeric, source_id int, geom geometry(MultiPolygon,4326) not null
);
create table ref.irrigation_zones (id serial primary key, project_name text, source_id int, geom geometry(MultiPolygon,4326));
create table ref.water_bodies (id serial primary key, name text, kind text, capacity_mcm numeric, thaiwater_id text, geom geometry(Geometry,4326));

-- กริดล่วงหน้า (ค่า raster/ภูมิอากาศ/ดาวเทียม)
create table ref.grid_cells (
  id bigint primary key, weather_grid_id int,
  elev_m numeric, slope_pct numeric,
  sg_clay_pct numeric, sg_soc_gkg numeric,
  rain_normal_mm numeric, et0_normal_mm numeric,
  plant_doy_wet int, plant_doy_dry int,
  si_dry_season numeric,                       -- salinity index S2 ฤดูแล้ง
  coast_dist_km numeric,                       -- ระยะจากชายฝั่ง/ปากแม่น้ำ (coastal_intrusion)
  province_code text,
  updated_at timestamptz,
  geom geometry(Polygon,4326) not null
);
create table ref.weather_grid (id serial primary key, lat numeric, lon numeric, geom geometry(Point,4326));

-- ===== obs (partition ตามปี) =====
create table obs.weather_daily (
  weather_grid_id int not null, date date not null,
  tmin numeric, tmax numeric, rain_mm numeric, rh numeric, wind_ms numeric, srad_mj numeric, et0_mm numeric,
  source text, primary key (weather_grid_id, date)
) partition by range (date);
-- สร้าง partition รายปี 2000–2036 ใน migration + BRIN index บน date
-- ทั้งประเทศ 0.1° × 20 ปี ≈ 31M แถว → ต้อง Supabase Pro · CMIP6 (source='cmip6:*') เก็บตารางแยก obs.weather_daily_proj เพื่อไม่ให้ตารางหลักบวม
-- ตารางอื่น: obs.gw_level, obs.reservoir_storage, obs.water_quality, obs.sat_indices(field_id, date, ndvi, ndwi, si)

-- ===== app =====
create table app.fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  geom geometry(Polygon,4326) not null,         -- 4 จุดที่ผู้ใช้ปัก
  vertices jsonb not null,                       -- [{lat,lng}] ตามลำดับที่เรียงแล้ว
  area_rai numeric generated always as (ST_Area(geom::geography)/1600.0) stored,
  centroid geometry(Point,4326) generated always as (ST_Centroid(geom)) stored,
  province_code text, district_code text, subdistrict_code text,
  created_at timestamptz default now()
);
create table app.field_practices (
  id uuid primary key default gen_random_uuid(),
  field_id uuid references app.fields(id) on delete cascade,
  season_year int, season text check (season in ('wet','dry1','dry2')),   -- นาปี / นาปรังรอบ 1 / รอบ 2
  variety text, plant_date date, establishment text, water_source text,
  water_regime text check (water_regime in ('continuous','awd','rainfed')),
  n_kg_rai numeric, organic_t_rai numeric, straw_burn boolean
);
create table app.field_observations (
  id uuid primary key default gen_random_uuid(),
  field_id uuid references app.fields(id) on delete cascade,
  observed_on date, kind text check (kind in ('yield','ec_soil','ec_water')), value numeric, unit text
);

-- ===== sim =====
create table sim.field_profile (            -- snapshot ผล overlay ตอนบันทึก/รีเฟรช
  field_id uuid primary key references app.fields(id) on delete cascade,
  profile jsonb not null, data_versions jsonb, computed_at timestamptz default now()
);
create table sim.scenarios (id text primary key, label_th text, ssp text, management jsonb);
create table sim.model_runs (
  id uuid primary key default gen_random_uuid(),
  field_id uuid references app.fields(id) on delete cascade,
  scenario_id text references sim.scenarios(id),
  model_version text not null, input_hash text not null,
  status text default 'queued' check (status in ('queued','running','done','failed')),
  run_at timestamptz default now(), finished_at timestamptz, error text,
  unique (field_id, scenario_id, input_hash)   -- รันซ้ำ input เดิม = ไม่คำนวณใหม่
);
create table sim.results_season (
  run_id uuid references sim.model_runs(id) on delete cascade,
  year int, season text,
  water_avail_mm numeric, irrigation_need_mm numeric, deficit_days int,
  yield_p10 numeric, yield_p50 numeric, yield_p90 numeric,
  ch4_kg_ha numeric, n2o_kg_ha numeric, co2e_t_ha numeric,
  ece_p10 numeric, ece_p50 numeric, ece_p90 numeric, salinity_class text,
  primary key (run_id, year, season)
);
create table sim.results_daily (run_id uuid, date date, w_mm numeric, ece_dsm numeric, lai numeric, primary key (run_id, date));

-- ===== meta =====
create table meta.data_sources (id serial primary key, code text unique, name_th text, url text, license text, attribution_th text, scale text);
create table meta.ingest_jobs (id bigserial primary key, source_code text, started_at timestamptz, finished_at timestamptz, rows int, status text, log text);
create table meta.model_versions (version text primary key, components jsonb, released_at timestamptz);
create table meta.api_clients (id uuid primary key default gen_random_uuid(), name text, key_hash text, quota_per_day int);
```

ทุกตาราง geometry ต้องมี `create index ... using gist (geom)`

### 7.3 RLS (ตัวอย่าง)

```sql
alter table app.fields enable row level security;
create policy "own fields" on app.fields for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- ทำแบบเดียวกันกับ field_practices / field_observations (join ผ่าน field_id)
-- sim.* อ่านผ่าน RPC ที่ตรวจ ownership เท่านั้น
```

### 7.4 RPC หัวใจของระบบ: `public.analyze_polygon`

รับ GeoJSON polygon → คืน profile แบบ **ถ่วงน้ำหนักตามพื้นที่** ของทุกชั้น (แทนวงกลมรอบหมุดในสเปกเดิม)

```sql
create or replace function public.analyze_polygon(p_geojson jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public, ref, extensions
as $$
declare
  g geometry; area_m2 numeric; result jsonb; prov record;
begin
  g := ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326));
  area_m2 := ST_Area(g::geography);

  select b.code, c.enabled into prov
    from ref.admin_boundaries b left join ref.province_coverage c on c.province_code = b.code
   where b.level='province' and ST_Intersects(b.geom, ST_Centroid(g)) limit 1;
  if prov.code is null then
    return jsonb_build_object('ok', false, 'error', 'OUTSIDE_THAILAND');
  end if;
  if not coalesce(prov.enabled, false) then
    return jsonb_build_object('ok', false, 'error', 'PROVINCE_NOT_ENABLED', 'province_code', prov.code);
  end if;

  with
  admin as (
    select code, name_th from ref.admin_boundaries
    where level='subdistrict' and ST_Intersects(geom, ST_Centroid(g)) limit 1
  ),
  soil as (
    select s.soil_group, s.texture, s.ksat_mm_day, s.awc_mm_m,
           ST_Area(ST_Intersection(s.geom, g)::geography) / area_m2 as w
    from ref.soil_units s where ST_Intersects(s.geom, g)
  ),
  saline as (
    select z.salinity_level, ST_Area(ST_Intersection(z.geom, g)::geography) / area_m2 as w
    from ref.saline_soil_zones z where ST_Intersects(z.geom, g)
  ),
  gw as (
    select z.ec_dsm, z.depth_m, z.quality_class, ST_Area(ST_Intersection(z.geom, g)::geography) / area_m2 as w
    from ref.groundwater_zones z where ST_Intersects(z.geom, g)
  ),
  geo as (
    select u.unit_code, u.is_maha_sarakham, u.rock_salt_depth_m,
           ST_Area(ST_Intersection(u.geom, g)::geography) / area_m2 as w
    from ref.geology_units u where ST_Intersects(u.geom, g)
  ),
  grid as (
    select avg(elev_m) elev_m, avg(sg_clay_pct) clay, avg(rain_normal_mm) rain_normal,
           avg(et0_normal_mm) et0_normal, mode() within group (order by plant_doy_wet) plant_doy_wet,
           avg(si_dry_season) si, mode() within group (order by weather_grid_id) weather_grid_id
    from ref.grid_cells where ST_Intersects(geom, g)
  )
  select jsonb_build_object(
    'ok', true,
    'area_m2', area_m2, 'area_rai', area_m2/1600.0,
    'admin', (select to_jsonb(admin) from admin),
    'soil', (select jsonb_agg(to_jsonb(soil)) from soil),
    'saline', (select jsonb_agg(to_jsonb(saline)) from saline),
    'groundwater', jsonb_build_object(
        'ec_dsm_weighted', (select sum(ec_dsm*w)/nullif(sum(w),0) from gw),
        'depth_m_weighted', (select sum(depth_m*w)/nullif(sum(w),0) from gw),
        'parts', (select jsonb_agg(to_jsonb(gw)) from gw)),
    'geology', (select jsonb_agg(to_jsonb(geo)) from geo),
    'in_irrigation_zone', exists (select 1 from ref.irrigation_zones i where ST_Intersects(i.geom, g)),
    'nearest_water_body', (select jsonb_build_object('name', name, 'kind', kind,
        'distance_m', ST_Distance(geom::geography, g::geography))
        from ref.water_bodies order by geom <-> g limit 1),
    'grid', (select to_jsonb(grid) from grid),
    'coverage', (select to_jsonb(c) from ref.province_coverage c where c.province_code = prov.code),
    -- LDD placeholder: ถ้าไม่มีแถว soil/saline ตัดกับ polygon → ใช้ grid (SoilGrids + S2) และ confidence ต่ำ
    'confidence', jsonb_build_object(
        'geology','low (1:250k)',
        'groundwater', case when exists (select 1 from gw) then 'medium (1:100k)' else 'low (no DGR)' end,
        'soil',        case when exists (select 1 from soil) then 'high (LDD 1:25k)' else 'low (SoilGrids 250m)' end,
        'salinity',    case when exists (select 1 from saline) then 'high (LDD)' else 'low (Sentinel-2 SI)' end)
  ) into result;

  return result;
end $$;

grant execute on function public.analyze_polygon(jsonb) to anon, authenticated;
```

RPC อื่นที่ต้องสร้าง:
- `public.weather_series(p_grid_id int, p_from date, p_to date)` → อากาศรายวันสำหรับโมเดล
- `public.mvt_tile(p_layer text, z int, x int, y int)` → bytea (whitelist ชื่อ layer, simplify ตาม zoom)
- `public.enqueue_twin_run(p_field_id uuid, p_scenario text)` → ตรวจ ownership, คำนวณ input_hash, insert `sim.model_runs` + `pgmq.send('twin_runs', ...)`
- `public.field_results(p_field_id uuid)` → ผลทุก scenario ของแปลงตัวเอง

---

## 8. API Routes (Next.js)

| Route | Method | ทำอะไร |
|---|---|---|
| `/api/analyze` | POST `{ polygon: GeoJSON, practices?: {...} }` | validate (zod) → `rpc('analyze_polygon')` → `rpc('weather_series')` ปีล่าสุด → รัน `packages/model.runSeason()` → คืน `{ profile, quick: results, attribution }` · cache ใน memory/KV ด้วย hash ของ polygon ปัดทศนิยม 6 ตำแหน่ง |
| `/api/fields` | GET / POST | list / สร้างแปลง (insert `app.fields` + snapshot `sim.field_profile`) |
| `/api/fields/[id]` | GET / PATCH / DELETE | รายละเอียด, แก้ไข 4 จุด (ต้อง recompute profile) |
| `/api/fields/[id]/runs` | POST `{ scenario_id }` | `rpc('enqueue_twin_run')` → คืน run_id · หน้าเว็บ subscribe Realtime บน `sim.model_runs` |
| `/api/tiles/[layer]/[z]/[x]/[y]` | GET | MVT, `Content-Type: application/x-protobuf` |
| `/api/open/v1/*` | GET | (Phase 3) export GeoJSON/CSV ระดับตำบล/กริด **ห้ามส่ง polygon รายแปลง + ชื่อเจ้าของ** (PDPA) ใช้ API key จาก `meta.api_clients` |

---

## 9. โมเดลคำนวณ 4 ด้าน (`packages/model`)

ทั้ง 4 ด้าน **คำนวณร่วมกันรายวันในลูปเดียว** (`runSeason.ts`) เพราะเชื่อมกัน: น้ำกำหนดการสะสมเกลือ → เกลือกดผลผลิต → การขังน้ำกำหนดมีเทน ทุกฟังก์ชันเป็น pure function มี unit test (vitest) และ export `MODEL_VERSION`

### 9.1 สมดุลน้ำรายวัน (แกนกลาง)

```
W_t = W_{t-1} + P_t + I_t + CR_t − ETc_t − DP_t − RO_t
ETc = Kc × ET0      (ET0 = FAO-56 Penman-Monteith; ใช้ค่าจาก obs.weather_daily ถ้ามี)
```
- P = ฝน (weather grid), DP = ซึมลึกตาม `ksat_mm_day` ของดิน, RO = น้ำล้นคันนา (ความสูงคัน default 150 mm), CR = น้ำใต้ดินยกตัว (ฟังก์ชันของ `gw.depth_m`; 0 ถ้าลึก > 3 m)
- Kc ข้าว: เตรียมแปลง/ตั้งตัว 1.05, กลางฤดู 1.20, ปลายฤดู 0.90–1.05 (FAO-56)
- น้ำที่ใช้ได้จากภายนอก = ฝนใช้ประโยชน์ + โควตาชลประทาน (ถ้า `in_irrigation_zone`) + สระในฟาร์ม + น้ำบาดาลที่ **EC < 0.75 dS/m**
- **Output:** น้ำที่ใช้ได้ต่อฤดู (ลบ.ม./ไร่ — คูณ mm × 1.6), ความต้องการเติมน้ำ, จำนวนวันขาดน้ำ

### 9.2 ผลผลิต

```
Y = Y_pot × f_water × f_salt × f_nutrient
f_salt = 1 − 0.12 × max(0, ECe − 3.0)     (Maas–Hoffman; clamp 0..1)
```
- `Y_pot` Phase 1: ตารางค่าตามพันธุ์ (`varieties.ts`: KDML105, RD6, RD15, RD41, RD47, PTT1, SPT1 + threshold/slope ความทนเค็มเฉพาะพันธุ์ + ไวแสง/ไม่ไวแสง) · Phase 2: จาก DSSAT CERES-Rice
- `f_water` = ΣETa/ΣETc ช่วงวิกฤต (ออกดอก ± 20 วัน)
- `f_nutrient` = ฟังก์ชันอิ่มตัวของ N kg/rai
- Calibrate ด้วยผลผลิตจริงที่ผู้ใช้กรอก + สถิติรายอำเภอ สศก.
- **Output:** กก./ไร่ P10/P50/P90 (Phase 1 ได้ช่วงจากการรันด้วยอากาศย้อนหลัง 10–20 ปีของกริดเดียวกัน)

### 9.3 ก๊าซเรือนกระจก (IPCC 2019)

```
CH4 (kg) = EF_c × SF_w × SF_p × SF_o × t × A
EF_c = 1.22 kg CH4/ha/วัน (ค่าตั้งต้นเอเชียตะวันออกเฉียงใต้)
A (ha) = area_rai × 0.16
```
- SF_w ระบอบน้ำ (ขังตลอด / AWD / น้ำฝน), SF_p สภาพน้ำก่อนปลูก, SF_o อินทรียวัตถุ (ฟาง, ปุ๋ยคอก), t = วันปลูก→เก็บเกี่ยว — เก็บค่าในตาราง constants พร้อมอ้างอิงตาราง IPCC
- N2O จากปุ๋ย N (IPCC EF1), CO2 จากยูเรีย + การเผาฟาง → CO2e ด้วย **GWP100 AR6**
- แสดง **ส่วนต่างถ้าเปลี่ยนเป็น AWD** (ศักยภาพ T-VER)

### 9.4 ความเค็ม

- **ค่าฐาน ECe** → ฟังก์ชัน `baseEce(profile)` แยกตาม `coverage.salinity_origin` (Phase 1 rule-based พร้อมตารางแมป, Phase 2 ML):
  - `inland_rock_salt`: ระดับดินเค็ม LDD (ถ่วงพื้นที่) + EC/ความลึกน้ำบาดาล DGR + `is_maha_sarakham` + `si_dry_season`
  - `coastal_intrusion`: ระดับดินเค็ม LDD + `coast_dist_km` + ความเค็มน้ำในลำน้ำช่วงแล้ง (ThaiWater) + `si_dry_season` · น้ำชลประทานมี `C_irr` สูงในฤดูแล้ง
  - **LDD placeholder:** ถ้า `profile.saline` ว่าง ให้ใช้ `si_dry_season` + EC น้ำบาดาล (ถ้ามี) แทน และคืน `confidence: 'low'` — unit test ต้องครอบคลุมกรณีนี้
- **จำลองรายวันคู่กับสมดุลน้ำ:**
```
S_t = S_{t-1} + CR_t·C_gw + I_t·C_irr − DP_t·C_soil,t
```
- **Output:** ECe (dS/m), 4 ระดับ (ไม่เค็ม / น้อย / ปานกลาง / จัด), คำแนะนำ (พันธุ์ทนเค็ม, ยิปซัม, ไม้ยืนต้นบนพื้นที่รับน้ำ)

### 9.5 Input hash
`input_hash = sha256(JSON.stringify({ polygon_rounded, practices, profile_data_versions, scenario, MODEL_VERSION }))` — ถ้ามีอยู่แล้วใน `sim.model_runs` ให้คืนผลเดิม

---

## 10. Digital Twin & พยากรณ์ 5–10 ปี (Phase 2)

**Worker** (`workers/twin`, Python, Docker): loop `pgmq.read('twin_runs')` → โหลด field + profile + weather → รัน → เขียน `sim.results_*` → update status (Realtime แจ้งหน้าเว็บ)

วงจร twin:
1. **Sync** — อากาศ/ฝน/ระดับน้ำ/ดาวเทียมล่าสุด (pg_cron + ETL รายวัน)
2. **Assimilate** — ปรับสถานะ (ความชื้น, ECe, NDVI) ด้วย Ensemble Kalman Filter
3. **Calibrate** — สิ้นฤดูปรับพารามิเตอร์ด้วยผลผลิตจริง/EC ที่ผู้ใช้กรอก
4. **Forecast** — ฤดูนี้ (1–6 เดือน) และ 5–10 ปี
5. **Advise** — แปลงเป็นคำแนะนำภาษาง่าย + แจ้งเตือน

พยากรณ์ระยะยาว:
- NEX-GDDP-CMIP6 (~25 กม.) ≥ 5 GCM × 2 SSP (SSP2-4.5, SSP5-8.5) bias-correct กับสถานี TMD → เก็บรายวันลง `obs.weather_daily` ด้วย `source='cmip6:<gcm>:<ssp>'`
- Weather generator หลายสิบชุดต่อปี → ได้การกระจาย P10–P90
- รันต่อเนื่องปีต่อปี **ไม่รีเซ็ตเกลือ/ความอุดมสมบูรณ์**
- Scenarios (`sim.scenarios` seed): ทำแบบเดิม / AWD / พันธุ์ทนเค็ม / เพิ่มสระน้ำ / ไม้ยืนต้นแนวคันนา
- CROPWAT: ใช้ `pyfao56` ใน worker และตรวจเทียบกับ CROPWAT 8.0 ตัวจริงเป็นระยะ
- DSSAT CERES-Rice: `DSSATTools` สร้าง `.WTH .SOL .RIX` จาก DB อัตโนมัติ (Linux build) → คูณ `f_salt` จากโมเดลเกลือของเรา (DSSAT ไม่มีโมดูลเค็ม)

**หน้า `/fields/[id]` แสดง:** แผนที่ polygon + สีตามระดับเค็ม, slider ปี 2027–2036, กราฟผลผลิตพร้อมแถบ P10–P90, น้ำขาด/เกินรายเดือน, CO2e ต่อไร่ + ศักยภาพคาร์บอนเครดิต, ตารางเปรียบเทียบ scenario, **ป้ายความเชื่อมั่น** ของทุกค่า และข้อความเตือนว่า *"เป็นการคาดการณ์ ไม่ใช่คำทำนายแน่นอน"*

---

## 11. แผนพัฒนา (ทำตามลำดับ)

### Phase 1 — MVP (schema/ETL ทั้งประเทศ · เปิดใช้ 1 จังหวัดนำร่อง: **มหาสารคาม**)
- [ ] 1.0 ตั้งค่า Multi-agent: `docs/SPEC.md`, `CLAUDE.md`, `.claude/agents/*.md` ครบตามหัวข้อ 15.2 และ `packages/contracts` เวอร์ชันแรก
- [ ] 1.1 Scaffold monorepo (pnpm, Next.js 15, Tailwind, shadcn/ui, ESLint, Prettier, vitest)
- [ ] 1.2 Supabase local (`supabase init`), migrations ตามหัวข้อ 7, RLS, seed ขอบเขตปกครอง **77 จังหวัด** + `ref.province_coverage` (เปิด `enabled` เฉพาะมหาสารคาม) + `meta.data_sources`
- [ ] 1.3 **Seed ข้อมูลตัวอย่าง** (`supabase/seed.sql`) — polygon สมมติของดิน/ดินเค็ม/น้ำบาดาล/หินในจังหวัดนำร่อง เพื่อให้ dev UI ได้ก่อน ETL จริงเสร็จ
- [ ] 1.4 หน้า `/map`: Google Maps + ปัก 4 จุด + ลาก + เรียงจุด + พื้นที่ ไร่-งาน-ตร.ว. + validation (หัวข้อ 5)
- [ ] 1.5 RPC `analyze_polygon` + `weather_series` + route `/api/analyze`
- [ ] 1.6 `packages/model`: water balance + IPCC Tier 1 + Maas–Hoffman + `runSeason` + unit tests
- [ ] 1.7 ResultPanel (4 การ์ด: น้ำ / ผลผลิต / GHG / ความเค็ม) + ฟอร์ม input เสริมคำนวณใหม่ฝั่ง client
- [ ] 1.8 Auth + บันทึกแปลง + หน้ารายงานแปลงหน้าเดียว (พิมพ์/แชร์ได้)
- [ ] 1.9 ETL จริง **ทั้งประเทศ**: DMR (ArcGIS REST แบ่งหน้า), DGR (.rar 62 จังหวัด), GISTDA ขอบเขต/ชลประทาน, ERA5-Land bulk 20 ปีลง weather grid, grid_cells จาก raster (SoilGrids/DEM/CHIRPS) · **LDD: เขียน loader + validation ไว้ แต่ข้ามถ้าไม่มีไฟล์ (status `skipped: no_source`)**
- [ ] 1.10 Layer toggle ด้วย MVT tiles
- [ ] 1.11 PWA (manifest + offline shell)
- [ ] 1.12 Landing Page + หน้า about/privacy/terms + แปลง demo (หัวข้อ 5.0)
- [ ] 1.13 Responsive ทุกหน้า: bottom sheet / side panel, print stylesheet, Playwright ทดสอบหลาย viewport (หัวข้อ 5.5)
- [ ] 1.14 ETL อัตโนมัติ: `pipeline.py` (check → stage → validate → swap → recompute → notify), workflow daily/quarterly/semiannual, `meta.data_snapshots`, หน้า `/admin/data` (หัวข้อ 6.1)

### Phase 2 — Twin
- [ ] Sentinel-2/1 ผ่าน GEE → `obs.sat_indices` + `ref.grid_cells.si_dry_season`
- [ ] โหลด LDD ดินเค็ม/ชุดดิน เมื่อได้ไฟล์ → recompute แปลงที่ได้รับผล
- [ ] โมเดลความเค็ม `coastal_intrusion` (ภาคกลาง/ตะวันออก/ใต้) + validate กับค่าวัดจริง
- [ ] ML ประมาณ ECe (เทียบค่าภาคสนาม 30–50 แปลงกับ มข./มมส.)
- [ ] Python worker + pgmq + Realtime
- [ ] pyfao56 + DSSAT CERES-Rice (calibrate KDML105, RD6, RD15)
- [ ] Data assimilation (EnKF)
- [ ] CMIP6 scenarios 5–10 ปี + หน้าเปรียบเทียบทางเลือก

### Phase 3 — ขยาย
- [ ] เปิด `enabled` ทยอยทั้ง 77 จังหวัด (อีสานก่อน → ภาคกลางเมื่อโมเดล `coastal_intrusion` ผ่าน validation), LINE Login + LINE OA แจ้งเตือน
- [ ] Open data API (`/api/open/v1`) + API key + rate limit
- [ ] DNDC + รายงานคาร์บอน T-VER

---

## 12. Acceptance Criteria (Phase 1)

- ปัก 4 จุดบนมือถือได้ด้วยนิ้วเดียว ลากจุดได้ลื่น และพื้นที่ตรงกับ `computeArea` ±0.5%
- ปักจุดในลำดับไขว้ (เช่น 1-3-2-4) ระบบเรียงใหม่ให้ polygon ไม่ไขว้อัตโนมัติ
- ปัก polygon นอกประเทศไทย → `OUTSIDE_THAILAND` · ในจังหวัดที่ยังไม่ `enabled` → `PROVINCE_NOT_ENABLED` พร้อมชื่อจังหวัด ไม่ crash
- **LDD placeholder:** เมื่อ `ref.soil_units` และ `ref.saline_soil_zones` ว่าง `/api/analyze` ยังคืนผลครบ 4 ด้าน และป้ายความเชื่อมั่นดิน/ความเค็มเป็น "ต่ำ" · LayerToggle ซ่อนชั้น LDD
- `/api/analyze` ตอบ < 1.5 วินาที (p95) บน polygon ≤ 500 ไร่
- polygon ที่คร่อม 2 หน่วยดิน → profile แสดงทั้ง 2 พร้อมน้ำหนักรวม = 1.0 (±0.01)
- เปลี่ยน AWD ↔ ขังตลอด → CH4 เปลี่ยนทันทีโดยไม่ยิง request ใหม่
- ECe = 5 dS/m → `f_salt = 0.76` (unit test)
- ทุกหน้าที่ใช้ข้อมูล ThaiWater แสดง attribution "คลังข้อมูลน้ำแห่งชาติ (สสน.)"
- ผู้ใช้ A มองไม่เห็นแปลงของผู้ใช้ B (ทดสอบ RLS)
- ทุกค่าผลลัพธ์แสดงป้ายความเชื่อมั่น (สูง/กลาง/ต่ำ) ตามความละเอียดข้อมูลต้นทาง
- **Landing:** จาก `/` กด "เริ่มประเมินแปลงนา" แล้วปักจุดและเห็นผลได้โดยไม่ต้อง login · Lighthouse mobile Performance ≥ 90 · แสดงวันที่อัปเดตข้อมูลล่าสุดจาก DB
- **Responsive:** ที่ 360×800 ไม่มี scroll แนวนอน, ปักและลากจุดได้ขณะ bottom sheet เปิดอยู่ระดับ 25% · ที่ 1366×768 แผงข้างและแผนที่แสดงพร้อมกันโดยไม่ทับกัน · หมุนจอแล้ว layout เปลี่ยนโดยไม่เสียจุดที่ปักไว้
- **ETL อัตโนมัติ:** รัน `python etl/run.py --tier quarterly` ซ้ำได้ (idempotent) · ถ้าต้นทางไม่เปลี่ยนต้องได้สถานะ `skipped` · ถ้าป้อนข้อมูลเสีย (เช่นแถวหายเกิน 30%) ต้องหยุดก่อน swap และ `ref.*` ไม่เปลี่ยน · ระหว่าง swap เรียก `/api/analyze` ต่อเนื่องได้โดยไม่ error · แปลงที่อยู่ในพื้นที่ข้อมูลเปลี่ยนถูก mark `stale` และ profile ถูกคำนวณใหม่

---

## 13. ความเสี่ยงที่ต้องสะท้อนในโค้ด/UI

- **ข้อมูลไม่ครบทุกจังหวัด:** LDD ยังไม่มี, DGR ขาด 14 จังหวัด → ทุกค่าต้องมี `confidence` และ `source` และ UI ห้ามซ่อนว่าเป็นค่าประมาณจาก fallback
- **ต้นทุนข้อมูลทั้งประเทศ:** Supabase Pro + Storage สำหรับไฟล์ดิบ ERA5/DEM · backfill ต้องรันบน Cloud Run Jobs (เกิน 6 ชม. ของ GitHub Actions)
- **ความละเอียดข้อมูลไม่เท่ากัน:** หิน 1:250k, น้ำบาดาล 1:100k หยาบกว่าแปลงมาก → ส่ง `confidence` ทุกชั้นออกจาก RPC และแสดงใน UI
- **4 จุดยังเป็นค่าประมาณ:** แปลงจริงอาจมีมากกว่า 4 มุม → ออกแบบ `vertices` เป็น array เพื่อขยายเป็น N จุดได้ภายหลัง (Phase 3) แต่ UI Phase 1 จำกัด 4
- **ค่าดาวเทียมปนแปลงข้างเคียง:** ใช้ buffer ภายใน (`ST_Buffer(geom::geography, -10)`) ตอนสรุปค่า Sentinel ถ้าแปลงใหญ่พอ
- **การเข้าถึงข้อมูลรัฐ:** ETL ต้องทนต่อการเปลี่ยน schema (validate ด้วย pydantic, log ลง `meta.ingest_jobs`, ไม่ลบข้อมูลเก่าถ้าดึงใหม่ล้มเหลว)
- **พยากรณ์ 10 ปี:** สื่อสารเป็นช่วง + ฉากทัศน์เสมอ ห้ามแสดงค่าเดียวโดด ๆ
- **PDPA:** polygon + ชื่อเจ้าของเป็นข้อมูลส่วนบุคคล → หน้า consent ก่อนบันทึก, export ระดับตำบล/กริดเท่านั้น, เก็บข้อมูลใน region Singapore
- **Google Maps cost:** จำกัด key ด้วย referrer, lazy-load แผนที่, ไม่เรียก Places/Geocoding ถ้าไม่จำเป็น (ใช้ `admin_boundaries` ของเราหาชื่อตำบลแทน reverse geocoding)

---

## 14. Coding Conventions

- TypeScript `strict`, ตรวจ input ทุก route ด้วย `zod`
- หน่วยในโค้ดเป็น SI (m², mm, ha, dS/m) แปลงเป็นไร่/ลบ.ม.ต่อไร่ เฉพาะชั้นแสดงผล (`lib/units.ts`)
- ค่าคงที่ทางวิชาการ (Kc, IPCC SF, Maas–Hoffman ต่อพันธุ์) อยู่ในไฟล์ `constants/*.ts` พร้อมคอมเมนต์อ้างอิงแหล่ง
- ข้อความ UI ทั้งหมดอยู่ใน `messages/th.json` (เผื่อเพิ่มภาษาอีสาน/อังกฤษ)
- ห้ามใช้ `SUPABASE_SERVICE_ROLE_KEY` ในโค้ดฝั่ง client เด็ดขาด
- ทุก PR/commit ต้องผ่าน `pnpm lint && pnpm test && supabase db lint`

---

## 15. Multi-Agent Workflow (Claude Code Subagents)

### 15.1 หลักการ

```
                ┌──────────────────────────────┐
                │  Orchestrator (session หลัก)  │  วางแผน · เขียน contracts · แบ่งงาน · รวมโค้ด · ตัดสินใจ
                └──────────────┬───────────────┘
   ┌───────────┬───────────┬───┴────────┬──────────────┬──────────────┐
db-architect  map-ui   frontend-ui  model-scientist  etl-engineer  api-integrator
   └───────────┴───────────┴───┬────────┴──────────────┴──────────────┘
                     qa-tester  →  code-reviewer (อ่านอย่างเดียว)
```

- **Contract ก่อน แล้วค่อยทำพร้อมกัน:** Orchestrator เขียน `packages/contracts` ให้เสร็จก่อน (zod schema ของ `AnalyzeRequest`, `AnalyzeResponse`, `FieldProfile`, `Practices`, `SeasonResult`, ชื่อ RPC และ signature) ทุก agent ต้อง import จากที่นี่ ห้ามประกาศ type ซ้ำเอง
- **แบ่งความเป็นเจ้าของไฟล์ชัดเจน:** แต่ละ agent แก้ได้เฉพาะ path ของตัวเอง (ตาราง 15.2) ถ้าต้องแก้ contract หรือไฟล์ของ agent อื่น ให้เขียนไว้ใน "คำขอเปลี่ยน" ตอนส่งงาน แล้วให้ Orchestrator ตัดสินและแก้เอง
- **Subagent ไม่เห็นบริบทของ session หลัก:** ทุกครั้งที่มอบงาน Orchestrator ต้องส่ง (1) task ID จากหัวข้อ 11 (2) หัวข้อใน `docs/SPEC.md` ที่ต้องอ่าน (3) เกณฑ์เสร็จจากหัวข้อ 12 (4) ไฟล์และ contract ที่เกี่ยวข้อง
- **ไม่ซ้อนชั้น:** ให้ subagent ทำงานจบในตัว ไม่ออกแบบให้ subagent ไปเรียก subagent ตัวอื่นต่อ การประสานงานทั้งหมดผ่าน Orchestrator
- **งานค้นหาหรืออ่านโค้ดจำนวนมาก** ให้ใช้ subagent สำรวจในตัวของ Claude Code (Explore) เพื่อไม่ให้ context ของ session หลักเต็ม

### 15.2 รายชื่อ Agent

| Agent | หน้าที่ | Path ที่เป็นเจ้าของ | อ่านหัวข้อ | Tools |
|---|---|---|---|---|
| `db-architect` | migrations, PostGIS, RLS, RPC (`analyze_polygon`, `mvt_tile`, `enqueue_twin_run`), seed | `supabase/**` | 6.1 (ตาราง), 7 | Read, Edit, Write, Bash, Grep, Glob |
| `map-ui` | Google Maps, ปัก/ลาก/เรียง 4 จุด, พื้นที่, validation, MVT layer | `apps/web/components/map/**`, `apps/web/lib/geo/**`, `apps/web/app/map/**` | 5.1–5.3, 5.5 | Read, Edit, Write, Bash, Grep, Glob |
| `frontend-ui` | Landing, layout, ResultPanel, การ์ดและกราฟ, รายงานแปลง, responsive, i18n | `apps/web/app/(marketing)/**`, `apps/web/app/fields/**`, `apps/web/components/results/**`, `apps/web/messages/**` | 5.0, 5.4, 5.5, 10 (ส่วน UI) | Read, Edit, Write, Bash, Grep, Glob |
| `model-scientist` | สูตรน้ำ/ผลผลิต/GHG/ความเค็ม, `runSeason`, constants พร้อมอ้างอิง, unit test | `packages/model/**` | 9 | Read, Edit, Write, Bash, Grep, Glob |
| `etl-engineer` | Python ETL, pipeline อัตโนมัติ, GitHub workflows, ข้อมูลของหน้า `/admin/data` | `etl/**`, `.github/workflows/etl-*.yml` | 6, 6.1 | Read, Edit, Write, Bash, Grep, Glob |
| `api-integrator` | Route handlers, zod validation, cache, auth flow, Supabase clients | `apps/web/app/api/**`, `apps/web/lib/supabase/**` | 8, 7.3 | Read, Edit, Write, Bash, Grep, Glob |
| `qa-tester` | vitest, Playwright หลาย viewport, ทดสอบ RLS, ตรวจ acceptance criteria | `**/*.test.ts`, `apps/web/e2e/**`, `supabase/tests/**` | 12 + หัวข้อของงานที่ตรวจ | Read, Edit, Write, Bash, Grep, Glob |
| `code-reviewer` | รีวิวคุณภาพ, ความปลอดภัย (key, RLS, PDPA), ความสอดคล้องกับ contract · **ไม่แก้โค้ด** | – (อ่านอย่างเดียว) | 13, 14 | Read, Grep, Glob, Bash |
| `twin-worker` *(Phase 2)* | Python worker, pgmq, pyfao56, DSSAT, EnKF, CMIP6 | `workers/**` | 10 | Read, Edit, Write, Bash, Grep, Glob |

### 15.3 รูปแบบไฟล์ Agent

ไฟล์อยู่ที่ `.claude/agents/<name>.md` เป็น Markdown ที่มี YAML frontmatter ด้านล่างเป็นตัวอย่างเต็ม 2 ตัว ตัวที่เหลือให้ Orchestrator สร้างตามแบบเดียวกันจากตาราง 15.2

```markdown
---
name: model-scientist
description: ใช้เมื่อต้องเขียนหรือแก้สูตรคำนวณน้ำ ผลผลิต ก๊าซเรือนกระจก หรือความเค็มใน packages/model รวมถึง constants และ unit test ของโมเดล
tools: Read, Edit, Write, Bash, Grep, Glob
---
คุณคือนักวิทยาศาสตร์เกษตรและวิศวกร TypeScript ของโปรเจกต์ Isan Rice Digital Twin

ก่อนเริ่มทุกครั้ง:
1. อ่าน CLAUDE.md และ docs/SPEC.md หัวข้อ 9 และ 14
2. อ่าน packages/contracts เพื่อใช้ type ที่กำหนดไว้ ห้ามประกาศ type ซ้ำ

กติกา:
- แก้ได้เฉพาะ packages/model/** เท่านั้น
- ทุกฟังก์ชันเป็น pure function ใช้หน่วย SI และมี unit test (vitest)
- ค่าคงที่ทางวิชาการต้องมีคอมเมนต์อ้างอิงแหล่ง (FAO-56, IPCC 2019, Maas–Hoffman)
- น้ำ เกลือ ผลผลิต และ CH4 ต้องคำนวณรายวันในลูปเดียวกัน (runSeason)
- รัน `pnpm --filter model test` ให้ผ่านก่อนส่งงาน

ตอนส่งงาน ให้ตอบตามรูปแบบ handoff ในหัวข้อ 15.5 ของ SPEC
```

```markdown
---
name: code-reviewer
description: ใช้ทันทีหลัง agent อื่นส่งงาน เพื่อรีวิวคุณภาพโค้ด ความปลอดภัย RLS/PDPA และความสอดคล้องกับ packages/contracts ก่อน merge
tools: Read, Grep, Glob, Bash
---
คุณคือ senior reviewer ที่อ่านอย่างเดียว ห้ามแก้ไฟล์

ตรวจตามลำดับ:
1. `git diff` ของงานที่ได้รับมอบหมาย
2. ใช้ type จาก packages/contracts จริงไหม มีการประกาศซ้ำหรือใช้ any ไหม
3. ความปลอดภัย: SUPABASE_SERVICE_ROLE_KEY หลุดไปฝั่ง client ไหม, ตาราง app.* เปิด RLS ไหม, RPC ตรวจ ownership ไหม, API เปิดเผย polygon หรือชื่อเจ้าของไหม
4. ข้อความ UI เป็นภาษาไทยและอยู่ใน messages/th.json ไหม, attribution สสน. ครบไหม
5. รัน `pnpm lint && pnpm test`

ส่งผลเป็น 3 ระดับ: 🔴 ต้องแก้ก่อน merge · 🟡 ควรแก้ · 🟢 ข้อเสนอแนะ พร้อมระบุไฟล์:บรรทัด
```

> ฟิลด์ `model` ใน frontmatter จะใส่หรือไม่ใส่ก็ได้ แต่ความถูกต้องของงานต้องไม่ขึ้นอยู่กับการเลือก model

### 15.4 ลำดับงานแบบ Wave (Phase 1)

| Wave | ทำพร้อมกัน | งาน (task ในหัวข้อ 11) | เงื่อนไขเริ่ม |
|---|---|---|---|
| **0** | ไม่ (ทำทีละขั้น) | Orchestrator: 1.0, 1.1, `packages/contracts` · `db-architect`: 1.2, 1.3 | – |
| **1** | ✅ | `db-architect`: RPC ใน 1.5 · `model-scientist`: 1.6 · `map-ui`: 1.4 · `frontend-ui`: 1.12 Landing · `etl-engineer`: 1.9 | Wave 0 merge แล้ว |
| **2** | ✅ | `api-integrator`: `/api/analyze`, auth, ส่วน API ของ 1.8 · `frontend-ui`: 1.7 และส่วน UI ของ 1.8 · `map-ui`: 1.10 · `etl-engineer`: 1.14 | RPC และ model ของ Wave 1 ผ่านเทสต์ |
| **3** | ✅ | `frontend-ui` + `map-ui`: 1.11, 1.13 · `qa-tester`: e2e + RLS + acceptance หัวข้อ 12 | Wave 2 รวมแล้ว |
| **4** | ไม่ | `code-reviewer` รีวิวทั้ง phase → agent เจ้าของแก้ข้อ 🔴 → `qa-tester` ตรวจซ้ำ | – |

ทุกงานต้องผ่านวงจรนี้: **agent ทำ → qa-tester เขียนและรันเทสต์ → code-reviewer รีวิว → Orchestrator merge**

**ทำงานพร้อมกันหลาย session (ถ้าต้องการเร็วขึ้น):** ใช้ git worktree แยกโฟลเดอร์ต่อสายงาน เช่น
```bash
git worktree add ../irt-model  -b feat/model
git worktree add ../irt-map    -b feat/map-ui
git worktree add ../irt-etl    -b feat/etl
```
แล้วเปิด Claude Code ในแต่ละโฟลเดอร์ เนื่องจาก path ที่แต่ละ agent เป็นเจ้าของไม่ทับกัน การ merge จะไม่ชนกัน ยกเว้น `packages/contracts` ซึ่งต้อง merge จาก Orchestrator ก่อนเสมอ

### 15.5 รูปแบบส่งงาน (Handoff)

ทุก subagent ต้องจบงานด้วยข้อความรูปแบบนี้ เพื่อให้ Orchestrator รวมงานได้โดยไม่ต้องอ่านโค้ดทั้งหมด

```markdown
## Handoff: <agent> · <task ID>
**สถานะ:** เสร็จ / เสร็จบางส่วน / ติดปัญหา
**ไฟล์ที่เปลี่ยน:** รายการ path
**เทสต์:** คำสั่งที่รัน + ผล (ผ่าน/ไม่ผ่าน)
**ตรง acceptance ข้อไหนแล้ว:** อ้างอิงหัวข้อ 12
**คำขอเปลี่ยน contract / ไฟล์ของ agent อื่น:** (ถ้ามี) อธิบายพร้อมเหตุผล
**การตัดสินใจที่ควรบันทึกใน DECISIONS.md:** (ถ้ามี)
**ค้างอยู่ / ความเสี่ยง:**
```

### 15.6 เกณฑ์ตรวจรับของ Multi-agent

- มีไฟล์ใน `.claude/agents/` ครบ 8 ตัวของ Phase 1 และแต่ละตัวมี `description` บอกชัดว่าควรถูกเรียกเมื่อไร
- ไม่มี type ของ `AnalyzeResponse`, `FieldProfile` หรือ `SeasonResult` ประกาศซ้ำนอก `packages/contracts` (ตรวจด้วย grep ใน CI)
- ทุก merge เข้า `main` มี handoff และผลรีวิวจาก `code-reviewer` แนบไว้ใน PR description
- ไม่มี commit ที่ agent แก้ไฟล์นอก path ของตัวเอง (ตรวจด้วย `CODEOWNERS` + สคริปต์ CI ที่เทียบ path ที่แก้กับ branch prefix)

---

**เริ่มจาก Phase 1 task 1.0 ได้เลย**
