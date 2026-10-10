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
