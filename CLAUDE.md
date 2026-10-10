# CLAUDE.md — BoengNa (เบิ่งนา) · Thai Rice Digital Twin

เว็บให้เกษตรกรปัก 4 มุมแปลงนาบนแผนที่ภาพถ่ายดาวเทียม แล้วประเมิน น้ำ / ผลผลิต / ก๊าซเรือนกระจก / ความเค็ม ทั้งปัจจุบันและ 5–10 ปี

**แหล่งความจริงเดียว: `docs/SPEC.md`** — อ่านหัวข้อที่เกี่ยวกับงานก่อนลงมือทุกครั้ง
- แหล่งข้อมูลและผล probe: `docs/DATA_SOURCES.md`
- การตัดสินใจนอกสเปก: `docs/DECISIONS.md` (เพิ่มรายการใหม่ทุกครั้งที่เลือกทางเอง)

## Stack
pnpm workspaces · Next.js 15 App Router + TS strict (`apps/web`) · Tailwind + shadcn/ui · Supabase (Postgres + PostGIS) · Auth.js v5 (อีเมล+รหัสผ่าน, Google เป็นตัวเลือก — ไม่ใช้ Supabase Auth, D-032) · MapLibre GL JS (`maplibre-gl`) + Esri World Imagery (ฟรี ไม่ใช้ key, D-030) · vitest · Playwright

## โครงสร้าง
- `packages/contracts` — zod schema + types ที่ทุกส่วนใช้ร่วม (**Orchestrator เป็นเจ้าของ** ห้ามประกาศ type ซ้ำที่อื่น)
- `packages/model` — สูตรคำนวณ pure TS
- `apps/web` — Next.js
- `supabase/` — migrations, seed, tests
- `etl/` — Python ETL

## กติกาสำคัญ
- ขอบเขต: ทั้งประเทศ แต่เปิดใช้รายจังหวัดผ่าน `ref.province_coverage.enabled` (ตอนนี้เปิดทั้ง 77 จังหวัด · มหาสารคาม `44` = นำร่อง มีข้อมูลละเอียดสุด · จังหวัดอื่นใช้ NASA POWER + nearest-weather fallback, confidence ต่ำ — D-029)
- **LDD placeholder:** `ref.soil_units`, `ref.saline_soil_zones` อาจว่าง — ทุกโค้ดต้องทำงานได้และคืน `confidence: 'low'`
- หน่วยในโค้ดเป็น SI · แปลงเป็นไร่-งาน-ตร.ว. เฉพาะชั้นแสดงผล
- UI ภาษาไทย อยู่ใน `apps/web/messages/th.json` · mobile-first
- Auth: ใช้ `auth()` จาก `apps/web/auth.ts` · DB ฝั่ง server ผ่าน `lib/supabase/server.ts` (mint JWT ให้ RLS) · Supabase token ห้ามส่งถึง browser · namespace uuid v5 ของ user id ห้ามเปลี่ยน · password hash อยู่ใน `app.user_credentials` เข้าถึงผ่าน RPC `auth_*` ด้วย service_role token จาก `lib/auth/credentials.ts` เท่านั้น
- ห้าม hardcode key · อัปเดต `.env.example` ทุกครั้งที่เพิ่มตัวแปร · ห้ามใช้ `SUPABASE_SERVICE_ROLE_KEY` ฝั่ง client
- ก่อนส่งงาน: `pnpm lint && pnpm test`
- Subagent: แก้เฉพาะ path ที่ตัวเองเป็นเจ้าของ (SPEC §15.2) และจบงานด้วย Handoff (SPEC §15.5)
