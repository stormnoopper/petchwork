# CLAUDE.md — Thai Rice Digital Twin

เว็บให้เกษตรกรปัก 4 มุมแปลงนาบน Google Maps แล้วประเมิน น้ำ / ผลผลิต / ก๊าซเรือนกระจก / ความเค็ม ทั้งปัจจุบันและ 5–10 ปี

**แหล่งความจริงเดียว: `docs/SPEC.md`** — อ่านหัวข้อที่เกี่ยวกับงานก่อนลงมือทุกครั้ง
- แหล่งข้อมูลและผล probe: `docs/DATA_SOURCES.md`
- การตัดสินใจนอกสเปก: `docs/DECISIONS.md` (เพิ่มรายการใหม่ทุกครั้งที่เลือกทางเอง)

## Stack
pnpm workspaces · Next.js 15 App Router + TS strict (`apps/web`) · Tailwind + shadcn/ui · Supabase (Postgres + PostGIS) · `@vis.gl/react-google-maps` · vitest · Playwright

## โครงสร้าง
- `packages/contracts` — zod schema + types ที่ทุกส่วนใช้ร่วม (**Orchestrator เป็นเจ้าของ** ห้ามประกาศ type ซ้ำที่อื่น)
- `packages/model` — สูตรคำนวณ pure TS
- `apps/web` — Next.js
- `supabase/` — migrations, seed, tests
- `etl/` — Python ETL

## กติกาสำคัญ
- ขอบเขต: ทั้งประเทศ แต่เปิดใช้รายจังหวัดผ่าน `ref.province_coverage.enabled` (Phase 1 = มหาสารคาม `MSK` / code `44`)
- **LDD placeholder:** `ref.soil_units`, `ref.saline_soil_zones` อาจว่าง — ทุกโค้ดต้องทำงานได้และคืน `confidence: 'low'`
- หน่วยในโค้ดเป็น SI · แปลงเป็นไร่-งาน-ตร.ว. เฉพาะชั้นแสดงผล
- UI ภาษาไทย อยู่ใน `apps/web/messages/th.json` · mobile-first
- ห้าม hardcode key · อัปเดต `.env.example` ทุกครั้งที่เพิ่มตัวแปร · ห้ามใช้ `SUPABASE_SERVICE_ROLE_KEY` ฝั่ง client
- ก่อนส่งงาน: `pnpm lint && pnpm test`
- Subagent: แก้เฉพาะ path ที่ตัวเองเป็นเจ้าของ (SPEC §15.2) และจบงานด้วย Handoff (SPEC §15.5)
