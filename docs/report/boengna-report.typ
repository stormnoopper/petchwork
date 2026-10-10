// รายงานระบบ BoengNa (เบิ่งนา): การทำงานและที่มาของข้อมูล
// Build: typst compile docs/report/boengna-report.typ docs/report/boengna-report.pdf
// Ground truth: docs/SPEC.md, docs/DATA_SOURCES.md, docs/DECISIONS.md, packages/model, supabase/migrations, etl/
// Row counts: local Supabase DB (supabase_db_petchwork), queried read-only 2026-10-11.

#let emerald = rgb("#1f7a45")
#let emerald-light = rgb("#e8f3ec")
#let amber = rgb("#c58a0b")
#let amber-light = rgb("#fdf4dc")
#let red-soft = rgb("#b42318")
#let red-light = rgb("#fdecea")
#let ink = rgb("#1d2420")
#let muted = rgb("#5b665f")
#let line-c = rgb("#cfd8d2")

#let doc-title = "รายงานระบบ BoengNa (เบิ่งนา): การทำงานและที่มาของข้อมูล"
#let doc-version = "ฉบับที่ 1.0"
#let doc-date = "11 ตุลาคม 2569 (2026-10-11)"

#set document(title: doc-title, author: "นางสาวสิริกร ศรีบรรเทา")
#set text(font: ("Sarabun",), size: 10.5pt, lang: "th", fill: ink)
#set par(justify: false, leading: 0.78em, spacing: 1.05em)
#show raw: set text(font: ("Menlo", "Sarabun"), size: 8.6pt)
#show raw.where(block: false): it => box(fill: rgb("#f1f4f2"), inset: (x: 2.5pt, y: 0pt), outset: (y: 2.5pt), radius: 2pt, it)
#show raw.where(block: true): it => block(fill: rgb("#f4f6f5"), inset: 8pt, radius: 3pt, width: 100%, stroke: 0.5pt + line-c, it)
#show link: set text(fill: emerald)
#show math.equation: set text(font: ("New Computer Modern Math",))

#set heading(numbering: "1.1")
#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  v(0.4em)
  block(width: 100%, below: 1em)[
    #set text(size: 19pt, weight: "bold", fill: emerald)
    #if it.numbering != none [#counter(heading).display(it.numbering)#h(0.6em)]#it.body
    #v(-0.55em)
    #line(length: 100%, stroke: 2pt + amber)
  ]
}
#show heading.where(level: 2): it => block(above: 1.4em, below: 0.8em)[
  #set text(size: 13.5pt, weight: "bold", fill: emerald)
  #if it.numbering != none [#counter(heading).display(it.numbering)#h(0.5em)]#it.body
]
#show heading.where(level: 3): it => block(above: 1.1em, below: 0.6em)[
  #set text(size: 11.5pt, weight: "bold", fill: ink)
  #it.body
]

// ---------- helpers
#let tbl(columns: (), header: (), ..rows) = {
  set text(size: 9.2pt)
  set par(leading: 0.62em, justify: false)
  show raw: set text(size: 7.9pt)
  table(
    columns: columns,
    stroke: (x, y) => (bottom: 0.5pt + line-c),
    inset: (x: 5pt, y: 4.5pt),
    fill: (x, y) => if y == 0 { emerald } else if calc.even(y) { rgb("#f6f9f7") } else { white },
    align: left + horizon,
    table.header(..header.map(h => text(fill: white, weight: "bold")[#h])),
    ..rows,
  )
}

#let kv(..rows) = {
  set text(size: 9.2pt)
  set par(leading: 0.62em)
  table(
    columns: (27%, 73%),
    stroke: (x, y) => (bottom: 0.5pt + line-c),
    inset: (x: 5pt, y: 4.2pt),
    fill: (x, y) => if x == 0 { emerald-light } else { white },
    align: left + top,
    ..rows.pos().map(c => c),
  )
}

#let callout(kind: "info", title: none, body) = {
  let (bg, bar) = if kind == "warn" { (amber-light, amber) } else if kind == "risk" { (red-light, red-soft) } else { (emerald-light, emerald) }
  block(width: 100%, fill: bg, inset: (left: 10pt, rest: 8pt), radius: (right: 3pt), stroke: (left: 3pt + bar), above: 0.9em, below: 0.9em)[
    #if title != none [#text(weight: "bold", fill: bar)[#title] \ ]
    #body
  ]
}

#let status(s) = {
  let (c, bg) = if s == "ok" { (emerald, emerald-light) } else if s == "limited" { (amber, amber-light) } else if s == "seed" { (rgb("#6b4fa0"), rgb("#efeaf7")) } else { (red-soft, red-light) }
  box(fill: bg, inset: (x: 4pt, y: 1.5pt), radius: 2pt, outset: (y: 1pt))[#text(size: 8.4pt, weight: "bold", fill: c)[#s]]
}

#let kpi(value, label) = block(width: 100%, fill: emerald-light, inset: 9pt, radius: 4pt, stroke: (top: 2.5pt + emerald))[
  #text(size: 17pt, weight: "bold", fill: emerald)[#value] \
  #text(size: 8.8pt, fill: muted)[#label]
]

#let node(title, body, fill: white, stroke-c: emerald) = block(width: 100%, fill: fill, stroke: 1pt + stroke-c, radius: 4pt, inset: 7pt)[
  #text(weight: "bold", size: 9.6pt, fill: stroke-c)[#title] \
  #text(size: 8.4pt)[#body]
]
#let arrow(s) = align(center + horizon, text(size: 15pt, fill: amber, weight: "bold")[#s])

// ======================================================================= COVER
#page(margin: (x: 0cm, y: 0cm), header: none, footer: none)[
  #block(width: 100%, height: 9.5cm, fill: emerald, inset: (x: 2.4cm, top: 2.6cm))[
    #text(size: 11pt, fill: rgb("#cfe6d8"), tracking: 0.5pt)[TECHNICAL REPORT · THAI RICE DIGITAL TWIN]
    #v(0.5cm)
    #text(size: 27pt, weight: "bold", fill: white)[รายงานระบบ BoengNa (เบิ่งนา)]
    #v(0.1cm)
    #text(size: 17pt, fill: white)[การทำงานและที่มาของข้อมูล]
  ]
  #block(width: 100%, height: 0.35cm, fill: amber)
  #block(inset: (x: 2.4cm, top: 1.6cm))[
    #set text(size: 11.5pt)
    #block(fill: amber-light, inset: 12pt, radius: 4pt, stroke: (left: 3pt + amber), width: 100%)[
      เว็บไซต์นี้เป็นส่วนหนึ่งของงานวิจัย “#text(fill: red-soft, weight: "bold")[xxx]” ของ นางสาวสิริกร ศรีบรรเทา \
      #text(size: 9pt, fill: muted)[\[PLACEHOLDER\] ชื่องานวิจัยยังไม่กำหนด — ค่าใน `apps/web/messages/th.json` → `research.title` = "xxx"]
    ]
    #v(1.2cm)
    #grid(columns: (4.2cm, 1fr), row-gutter: 0.55cm,
      text(fill: muted)[ผู้วิจัย], [นางสาวสิริกร ศรีบรรเทา],
      text(fill: muted)[ชื่องานวิจัย], text(fill: red-soft)[“xxx” (placeholder — รอกำหนด)],
      text(fill: muted)[ผู้อ่านเป้าหมาย], [ผู้วิจัย อาจารย์ที่ปรึกษา และคณะกรรมการ],
      text(fill: muted)[ระบบ], [BoengNa (เบิ่งนา) — Thai Rice Digital Twin · `MODEL_VERSION 0.1.0`],
      text(fill: muted)[วันที่], [#doc-date],
      text(fill: muted)[เวอร์ชันเอกสาร], [#doc-version],
    )
    #v(1.6cm)
    #text(size: 9pt, fill: muted)[
      เอกสารนี้อธิบายการทำงานของระบบ สูตรคำนวณ และที่มาของข้อมูลทุกแหล่ง โดยอ้างอิงจาก source code และเอกสารใน repository
      (`docs/SPEC.md`, `docs/DATA_SOURCES.md`, `docs/DECISIONS.md`, `packages/model`, `supabase/migrations`, `etl/`)
      และจำนวนแถวจริงจากฐานข้อมูล local ณ วันที่ 11 ต.ค. 2569 ค่าที่ระบุว่า *ASSUMPTION* คือสมมติฐานในโค้ดที่ยังต้องให้ผู้เชี่ยวชาญตรวจสอบ
    ]
  ]
]

// ======================================================================= FRONT MATTER
#set page(
  paper: "a4",
  margin: (top: 2.3cm, bottom: 2.1cm, x: 2.1cm),
  header: context {
    set text(size: 8.5pt, fill: muted)
    grid(columns: (1fr, auto), [BoengNa (เบิ่งนา) — การทำงานและที่มาของข้อมูล], [#doc-version · 11 ต.ค. 2569])
    v(-0.45em)
    line(length: 100%, stroke: 0.6pt + amber)
  },
  footer: context {
    set text(size: 8.5pt, fill: muted)
    line(length: 100%, stroke: 0.4pt + line-c)
    v(-0.35em)
    grid(columns: (1fr, auto), [งานวิจัย “xxx” · นางสาวสิริกร ศรีบรรเทา], [หน้า #counter(page).display() / #counter(page).final().first()])
  },
)
#counter(page).update(1)

#block[
  #text(size: 19pt, weight: "bold", fill: emerald)[สารบัญ]
  #v(-0.5em)
  #line(length: 100%, stroke: 2pt + amber)
]
#show outline.entry.where(level: 1): it => { v(0.5em); strong(it) }
#outline(title: none, depth: 2, indent: 1.4em)

// ======================================================================= 1
= บทสรุปผู้บริหาร วัตถุประสงค์ และขอบเขต

== บทสรุปผู้บริหาร

BoengNa (เบิ่งนา — ภาษาอีสาน แปลว่า "ดูนา") เป็นเว็บแอปพลิเคชันต้นแบบของ *Thai Rice Digital Twin* ที่ให้เกษตรกรปักหมุด 4 มุมแปลงนาบนแผนที่ภาพถ่ายดาวเทียม แล้วประเมินแปลงนั้นใน 4 ด้านพร้อมกัน ได้แก่ (1) น้ำที่ใช้ได้และน้ำที่ขาด (2) ผลผลิตข้าวเป็นช่วง P10–P90 (3) ก๊าซเรือนกระจก CH#sub[4] / N#sub[2]O / CO#sub[2] → CO#sub[2]e และ (4) ความเค็มของดิน (ECe) โดยใช้ *ความเค็มเป็นแกนกลาง* ของทุกการคำนวณ เพราะน้ำกำหนดการสะสมเกลือ เกลือกดผลผลิต และการขังน้ำกำหนดการปล่อยมีเทน

ระบบดึงข้อมูลเชิงพื้นที่จากหน่วยงานไทยและแหล่งเปิดระดับโลกเข้าฐานข้อมูล Supabase (Postgres + PostGIS) ล่วงหน้าด้วย ETL ที่เขียนด้วย Python เมื่อผู้ใช้ปักแปลง ระบบนำ polygon ไปซ้อนทับ (overlay) กับชั้นข้อมูลแบบถ่วงน้ำหนักตามพื้นที่ แล้วรันโมเดลสมดุลน้ำ–เกลือ–ผลผลิต–GHG รายวันที่เขียนเป็น pure TypeScript ซึ่งรันได้ทั้งฝั่ง server และ browser ทุกค่าที่แสดงมี *ป้ายความเชื่อมั่น* (สูง/กลาง/ต่ำ) และระบุแหล่งที่มา

#grid(columns: (1fr, 1fr, 1fr, 1fr), column-gutter: 8pt, row-gutter: 8pt,
  kpi("77", "จังหวัดที่เปิดให้ประเมิน (enabled ทั้งหมด)"),
  kpi("3.31 ล้าน", "แถวอากาศรายวัน NASA POWER (842 จุด, 2016-01-01 → 2026-10-07)"),
  kpi("11,055", "polygon น้ำบาดาล DGR 1:100k (62 จังหวัด)"),
  kpi("7,093", "polygon หน่วยหิน DMR 1:250k (KTms 21)"),
  kpi("1,007", "ขอบเขตปกครอง (77 จังหวัด + 928 อำเภอ + 2 ตำบล seed)"),
  kpi("614", "เขตชลประทาน GISTDA"),
  kpi("207 + 21", "automated tests ผ่าน (vitest 207 · pytest 21)"),
  kpi("0", "แถวข้อมูล LDD (ชุดดิน / ดินเค็ม) — placeholder"),
)

#callout(kind: "warn", title: "ข้อสรุปสำคัญสำหรับคณะกรรมการ")[
  - ระบบทำงานครบวงจร (ปักแปลง → วิเคราะห์ → บันทึก → รายงาน) และเปิดใช้ทั้ง 77 จังหวัด แต่ *คุณภาพผลลัพธ์ต่างกันตามพื้นที่*: มหาสารคาม (รหัส `44`) เป็นจังหวัดนำร่องที่มีกริด 0.01° ครบ ส่วนจังหวัดอื่นใช้อากาศ NASA POWER + nearest-weather fallback และค่าดิน/ดัชนีเค็มเป็น null → confidence ต่ำ
  - *ข้อมูลกริดและอากาศของมหาสารคามในฐานข้อมูลปัจจุบันยังเป็นข้อมูลสังเคราะห์ (synthetic seed)* สำหรับพัฒนา UI (D-005) ไม่ใช่ค่าจาก SoilGrids / Sentinel-2 / ERA5-Land จริง ต้องรัน ETL ของแหล่งเหล่านี้ก่อนนำผลไปใช้ในงานวิจัย
  - ข้อมูลกรมพัฒนาที่ดิน (LDD) ยังไม่มีช่องทางดึงอัตโนมัติ ต้องทำหนังสือขอ shapefile — เป็น blocker หลักของ confidence ระดับสูง
  - ค่าคงที่ของโมเดลจำนวนมากติดธง `// ASSUMPTION` (เช่น ผลผลิตศักย์ต่อพันธุ์ ความทนเค็มต่อพันธุ์ ปัจจัยน้ำบาดาล) ต้องให้ผู้เชี่ยวชาญ/กรมการข้าวตรวจก่อนใช้งานจริง
  - "พยากรณ์ 10 ปี" ในปัจจุบันคือการรันฤดูเดียวกันซ้ำกับอากาศ *ย้อนหลัง* 10 ปี (2016–2025) เพื่อได้ช่วง P10–P90 ส่วนการฉายภาพอนาคตด้วย CMIP6 อยู่ใน Phase 2 ยังไม่ได้ทำ
]

== วัตถุประสงค์ของระบบ

+ ให้เกษตรกรรายย่อยประเมินแปลงนาของตนเองได้ทันทีจากมือถือ โดยไม่ต้องสมัครสมาชิกก่อน (ต้องเข้าสู่ระบบเฉพาะตอนบันทึกแปลง)
+ รวมข้อมูลดิน หิน น้ำบาดาล ชลประทาน และอากาศจากหลายหน่วยงานเข้าไว้ในที่เดียว และ *ซ้อนทับกับขอบเขตแปลงจริง* (polygon) แทนการใช้หมุดจุดเดียว
+ คำนวณ 4 ด้าน (น้ำ ผลผลิต GHG ความเค็ม) ด้วยสูตรมาตรฐานสากล (FAO-56, Maas–Hoffman, IPCC 2019 Tier 1) ในลูปรายวันเดียวกัน
+ สื่อสารความไม่แน่นอนอย่างโปร่งใส: ผลเป็นช่วง P10–P90 และทุกค่ามีป้ายความเชื่อมั่นตามความละเอียดข้อมูลต้นทาง
+ ตรวจสอบย้อนกลับได้ (traceable): เก็บ `MODEL_VERSION`, เวอร์ชันข้อมูล (`data_versions`) และเปิดหน้า `/data` ให้ดูข้อมูลดิบที่ใช้คำนวณ

== ขอบเขต

#tbl(columns: (24%, 76%), header: ("หัวข้อ", "ขอบเขต"),
  [พื้นที่], [ทั้งประเทศ 77 จังหวัด เปิดใช้ผ่าน `ref.province_coverage.enabled` (ปัจจุบัน `true` ทุกจังหวัด — D-029) · มหาสารคาม (`44`) = จังหวัดนำร่องที่มีข้อมูลละเอียดที่สุด],
  [พืช], [ข้าว 7 พันธุ์: ขาวดอกมะลิ 105 (KDML105), กข6, กข15, กข41, กข47, ปทุมธานี 1 (PTT1), SPT1],
  [ฤดู], [นาปี (`wet`), นาปรังรอบ 1 (`dry1`), นาปรังรอบ 2 (`dry2`)],
  [กลไกความเค็ม], [`inland_rock_salt` (อีสาน 20 จังหวัด — ชั้นเกลือหินหมวดหินมหาสารคาม KTms), `coastal_intrusion` (23 จังหวัดติดทะเล), `none` (34 จังหวัดที่เหลือ)],
  [Phase ปัจจุบัน], [Phase 1 (MVP) — โมเดล rule-based ใน TypeScript, ไม่มี data assimilation / CMIP6 / DSSAT (Phase 2)],
  [นอกขอบเขต], [การพยากรณ์อนาคตด้วยฉากทัศน์ภูมิอากาศ, Python twin worker, Open API, LINE Login (Phase 2–3 ใน SPEC §11)],
)

// ======================================================================= 2
= ภาพรวมสถาปัตยกรรม

== แผนภาพระบบ

#figure(
  block(width: 100%, inset: 10pt, stroke: 0.5pt + line-c, radius: 4pt)[
    #grid(columns: (1fr, 0.32fr, 1.25fr, 0.32fr, 1.25fr), row-gutter: 6pt, column-gutter: 0pt,
      node("ผู้ใช้ (Browser / มือถือ)", [MapLibre GL JS · ปัก 4 มุม · ResultPanel · `@rice/model` คำนวณซ้ำฝั่ง client เมื่อเปลี่ยน input]),
      arrow("⇄"),
      node("Next.js 15 บน Vercel", [Route Handlers: `/api/analyze`, `/api/fields`, `/api/tiles`, `/api/data/…/csv` · Auth.js v5 · mint JWT ต่อ request · `@rice/model` ฝั่ง server]),
      arrow("⇄"),
      node("Supabase Postgres + PostGIS", [schema `ref` `obs` `app` `sim` `meta` `staging` `archive` · RPC `security definer` · RLS บน `app.*`]),
      arrow("↑"), [], [], [], arrow("↑"),
      node("Esri World Imagery", [ภาพดาวเทียม + ชื่อถนน/หมู่บ้าน (แสดงผลเท่านั้น ไม่ใช้คำนวณ)], fill: amber-light, stroke-c: amber),
      [],
      node("แหล่งข้อมูลภายนอก", [DMR · DGR · GISTDA · NASA POWER · SoilGrids · Copernicus DEM · ThaiWater · Open-Meteo · (LDD = placeholder)], fill: amber-light, stroke-c: amber),
      arrow("→"),
      node("Python ETL (GitHub Actions cron)", [check → fetch → stage → validate → swap → record → recompute → notify]),
    )
  ],
  kind: image, supplement: [ภาพที่],
  caption: [สถาปัตยกรรมระดับสูง — หน้าเว็บอ่านจาก Supabase เท่านั้น ไม่เรียก API ภายนอกขณะผู้ใช้ใช้งาน (ยกเว้น tile ภาพถ่ายดาวเทียม)],
)

หลักการออกแบบตาม SPEC §1: *Geospatial-first* (ทุกชั้นเป็น SRID 4326), *Pre-fetched data* (ETL ดึงข้อมูลเก็บล่วงหน้า), *Traceable* (เก็บเวอร์ชันโมเดลและข้อมูล), *Interactive-first* (ผลเบื้องต้นภายใน ≈1–2 วินาที และคำนวณซ้ำทันทีฝั่ง client เมื่อเปลี่ยนค่า)

== Tech stack

#tbl(columns: (20%, 38%, 42%), header: ("ชั้น", "เทคโนโลยี", "หมายเหตุ"),
  [Monorepo], [pnpm workspaces], [`apps/web`, `packages/contracts`, `packages/model`, `supabase/`, `etl/`],
  [Web], [Next.js 15.5 (App Router) + TypeScript strict, React 19], [Server Components + Route Handlers, deploy บน Vercel],
  [UI], [Tailwind CSS + shadcn/ui, Recharts], [ข้อความ UI ภาษาไทยทั้งหมดใน `apps/web/messages/th.json` · mobile-first],
  [แผนที่], [MapLibre GL JS 5.24.0 + Esri World Imagery (สลับเป็น EOX Sentinel-2 cloudless ได้)], [ไม่ใช้ API key · ชั้นข้อมูลเป็น MVT จาก `/api/tiles` (D-030)],
  [Geometry], [`@turf/turf`], [เรียงจุด, ตรวจเส้นไขว้, พื้นที่ WGS84 ellipsoidal (D-029a)],
  [Contracts], [zod v4 (`packages/contracts`)], [schema/type ร่วมทุกส่วน เช่น `FieldProfile`, `Practices`, `SeasonResult`],
  [Model], [Pure TypeScript (`packages/model`)], [`MODEL_VERSION = '0.1.0'` · FAO-56 / Maas–Hoffman / IPCC 2019],
  [Database], [Supabase: Postgres + PostGIS (+ pg_cron, pgmq ถ้ามี)], [ตาราง `obs.weather_daily` แบ่ง partition รายปี 2000–2036 + BRIN index],
  [Auth], [Auth.js v5 (`next-auth@5.0.0-beta.32`)], [อีเมล + รหัสผ่าน (หลัก), Google (ตัวเลือก) — ไม่ใช้ Supabase Auth (D-032)],
  [ETL], [Python 3.12 (uv venv), geopandas/rasterio/psycopg], [รันด้วย GitHub Actions ใน container `ghcr.io/osgeo/gdal`],
  [Test], [vitest, pytest, pgTAP], [ดูหัวข้อที่ 8],
)

== โมเดลความปลอดภัย (Security model)

#tbl(columns: (25%, 75%), header: ("ประเด็น", "การออกแบบ"),
  [การยืนยันตัวตน], [Auth.js Credentials provider: อีเมล + รหัสผ่าน (8–128 ตัวอักษร) · session เป็น JWT cookie (stateless, ไม่มี DB adapter) · Google แสดงเฉพาะเมื่อตั้ง `AUTH_GOOGLE_ID/SECRET` · dev bypass เปิดได้เฉพาะ `AUTH_DEV_BYPASS=1` และ `NODE_ENV !== 'production'` (D-027)],
  [การเก็บรหัสผ่าน], [scrypt N=2#super[15], r=8, p=1, salt 16 byte, key 32 byte (`node:crypto`) รูปแบบ `scrypt$N$r$p$salt$hash` · เปรียบเทียบด้วย `timingSafeEqual` · อีเมลที่ไม่มีในระบบก็ยังเสียเวลาเช็กเท่ากัน (dummy hash) และข้อความ error เหมือนกัน · ล็อกบัญชี 15 นาทีเมื่อผิด 5 ครั้งติด],
  [ตารางรหัสผ่าน], [`app.user_credentials` เปิด RLS แต่ *ไม่มี policy* และ revoke ทุก role → เข้าถึงได้เฉพาะ RPC `auth_register` / `auth_credentials` / `auth_record_login` (security definer) ที่ grant ให้ `service_role` เท่านั้น · server mint JWT `role=service_role` อายุ 60 วินาทีจาก `SUPABASE_JWT_SECRET` ต่อครั้ง (ไม่ใช้ `SUPABASE_SERVICE_ROLE_KEY`)],
  [RLS bridge], [ทุก request ที่ต้องใช้สิทธิ์ผู้ใช้ server mint HS256 JWT (`sub` = user id, `role`/`aud` = `authenticated`, อายุ ≤ 1 ชม.) ส่งให้ PostgREST → policy ที่ใช้ `auth.uid()` ทำงานต่อได้ · token ไม่ส่งถึง browser],
  [User id], [UUID v5 ของ `email:<lower(trim(email))>` (หรือ `google:<sub>`) ด้วย namespace คงที่ `31416000-cb73-4bfe-806a-00976aed3fee` — ห้ามเปลี่ยน ไม่งั้นแปลงเดิมหลุดเจ้าของ],
  [ข้อมูลผู้ใช้], [`app.fields`, `app.field_practices`, `app.field_observations` เปิด RLS ทุกตาราง: เจ้าของอ่าน/เขียนได้เฉพาะแถวตัวเอง · แปลง demo (`is_demo`) อ่านได้สาธารณะแต่แก้ไม่ได้],
  [ข้อมูลอ้างอิง], [schema `ref` `obs` `sim` `meta` `staging` `archive` revoke จาก `anon`/`authenticated` ทั้งหมด → เข้าถึงผ่าน RPC ใน `public` (security definer, `set search_path`) เท่านั้น],
  [หน้า `/data`], [สาธารณะ อ่านได้เฉพาะ 16 ตาราง `ref.*`/`obs.*` ใน allow-list (`public.raw_data_tables()`) · *ไม่รวม* `app.*`, `sim.*`, `obs.sat_indices`, `meta.api_clients` (ไม่มีข้อมูลผู้ใช้) · ไม่ส่ง geometry ดิบ: polygon → lat/lon + พื้นที่ไร่],
  [Secrets], [ห้าม hardcode key · `.env.example` เป็นแม่แบบ · `SUPABASE_SERVICE_ROLE_KEY` ห้ามใช้ฝั่ง client],
)

#callout(kind: "risk", title: "ช่องว่างด้านความปลอดภัยที่ยังเปิดอยู่ (D-032)")[
  ยังไม่มีการยืนยันอีเมล, ลืมรหัสผ่าน/รีเซ็ต, เปลี่ยนรหัสผ่าน (ต้องมีบริการส่งอีเมลก่อน) และยังไม่มี rate limit ต่อ IP สำหรับ `/register` และการลองหลายอีเมล — ควรทำก่อนเปิด production
]

// ======================================================================= 3
= ขั้นตอนการทำงานของผู้ใช้ (User flow)

== ภาพรวมเส้นทางผู้ใช้

#tbl(columns: (6%, 22%, 72%), header: ("#", "หน้า", "สิ่งที่เกิดขึ้น"),
  [1], [`/` Landing], [อธิบายระบบ 3 ขั้น, ผล 4 ด้าน, แหล่งข้อมูล และวันที่อัปเดตข้อมูลล่าสุดจาก `meta.data_snapshots` · ปุ่ม "เริ่มประเมินแปลงนา ฟรี" → `/map` · ปุ่ม "ดูตัวอย่างรายงาน" → `/fields/demo`],
  [2], [`/map`], [แผนที่ภาพถ่ายดาวเทียมเต็มจอ (ซูมทั้งประเทศ center ≈ 13.0, 101.0, zoom 5.5 หรือไปตำแหน่ง GPS ด้วยปุ่ม "ตำแหน่งฉัน" ที่ zoom 17)],
  [3], [`/map` ปักจุด], [แตะแผนที่วาง marker หมายเลข 1–4 (≥ 44 px) · เชื่อมเส้นตั้งแต่จุดที่ 2 · ครบ 4 จุดเป็น polygon · เรียงจุด CCW อัตโนมัติ (กัน polygon รูปผีเสื้อ) · ลากจุดได้ · ปุ่ม "ย้อนกลับ"/"เริ่มใหม่" · AreaBadge แสดง ไร่-งาน-ตร.ว.],
  [4], [Validation], [ตรวจเส้นไขว้ (ห้ามวิเคราะห์), พื้นที่ < 0.5 หรือ > 500 ไร่ (ต้องกดยืนยัน), ด้านยาว > 3 กม. (เตือน)],
  [5], [`POST /api/analyze`], [ส่ง GeoJSON Polygon → server เรียก RPC `analyze_polygon` → `weather_series` 10 ปีย้อนหลัง → รัน `runSeasonEnsemble` → คืน `{profile, weather, quick, attribution}`],
  [6], [ResultPanel], [bottom sheet (มือถือ) / sidebar (desktop) แสดง 4 การ์ดพร้อมป้ายความเชื่อมั่น · ฟอร์มเสริม (พันธุ์ ฤดู วิธีปลูก การจัดการน้ำ ปุ๋ย เผาฟาง ค่า EC ที่วัดเอง ผลผลิตปีก่อน) เปลี่ยนแล้ว *คำนวณใหม่ฝั่ง client ทันที* ไม่ต้องยิง DB ซ้ำ],
  [7], [บันทึกแปลง], [ปุ่ม "บันทึกแปลงนี้" → ถ้ายังไม่เข้าสู่ระบบพาไป `/login` หรือ `/register` (draft เก็บใน session/localStorage TTL 1 ชม. แล้วกู้กลับ) → ตั้งชื่อ → `POST /api/fields` insert `app.fields`],
  [8], [Trigger ใน DB], [`fields_admin_codes` เติมรหัสจังหวัด/อำเภอ/ตำบล · `fields_profile` เรียก `analyze_polygon` แล้ว snapshot ลง `sim.field_profile` (พร้อม `data_versions`)],
  [9], [`/fields/[id]` รายงาน], [server โหลดแปลง (RLS) + profile + practices ล่าสุด + อากาศ → คำนวณ ensemble ด้วยโมเดลเดียวกัน → รายงานหน้าเดียว (แท็บภาพรวม/พยากรณ์/ทางเลือก บนมือถือ) พิมพ์ A4 ได้],
  [10], [`/fields`], [รายการแปลงของฉัน],
  [11], [`/data`], [แค็ตตาล็อกแหล่งข้อมูล + 16 ตารางข้อมูลดิบ (สาธารณะ ไม่ต้องล็อกอิน) ดูทีละ 50 แถว กรองได้ 1 คอลัมน์ ดาวน์โหลด CSV ≤ 5,000 แถว],
)

== การคำนวณพื้นที่และการตรวจสอบ polygon

- พื้นที่คำนวณบนทรงรี WGS84 (authalic-sphere excess, `lib/geo/areaM2`) ซึ่งตรงกับ PostGIS geography (ต่างกัน ≈10#super[−12]) ใช้ค่าเดียวกันใน badge, ResultPanel และรายงาน (D-029a)
- หน่วย: 1 ไร่ = 1,600 m#super[2] · 1 งาน = 400 m#super[2] · 1 ตร.ว. = 4 m#super[2] · 1 ไร่ = 0.16 ha (โค้ดใช้หน่วย SI แปลงเป็นไร่เฉพาะชั้นแสดงผล)
- ฝั่ง server `analyze_polygon` ปฏิเสธ polygon ที่ไม่ใช่ Polygon/MultiPolygon, พิกัดนอกช่วง, ว่างหลัง `ST_MakeValid` หรือใหญ่กว่า 50 km#super[2] (31,250 ไร่) ด้วย `INVALID_POLYGON`

#tbl(columns: (30%, 15%, 55%), header: ("รหัสผลลัพธ์", "HTTP", "ความหมาย / ข้อความถึงผู้ใช้"),
  [`INVALID_POLYGON`], [400 / 422], [รูปแปลงไม่ถูกต้อง (zod หรือ RPC ปฏิเสธ)],
  [`OUTSIDE_THAILAND`], [422], [จุดบนผิว (point on surface) ไม่อยู่ในจังหวัดใด → "รองรับเฉพาะพื้นที่ในประเทศไทย"],
  [`PROVINCE_NOT_ENABLED`], [422], [จังหวัดยังไม่เปิด → แจ้งชื่อจังหวัด + รายชื่อจังหวัดที่เปิดแล้ว (ปัจจุบันไม่เกิดเพราะเปิดครบ 77)],
  [`INTERNAL`], [500], [ข้อผิดพลาดภายใน (log ฝั่ง server)],
)

== รายละเอียด `/api/analyze`

- ใช้ anon client (ไม่ต้องล็อกอิน) · ตรวจ input ด้วย zod (`AnalyzeRequest`)
- cache แบบ in-memory LRU ต่อ instance: ผล analyze 500 รายการ/1 ชม., อากาศต่อ grid 200 รายการ/1 ชม. (serverless ไม่แชร์ cache ข้าม instance — D-019)
- ค่า practices ที่ใช้ = `DEFAULT_PRACTICES` ← ค่าจาก profile (พันธุ์ตามจังหวัด; ถ้าอยู่ในเขตชลประทาน → `irrigated` + `continuous`) ← ค่าที่ผู้ใช้ระบุ (ผู้ใช้ชนะ)
- ช่วงอากาศ = 10 ปีปฏิทินเต็มล่าสุด (ณ ปี 2569/2026 คือ 2016-01-01 ถึง 2025-12-31)
- response ประมาณ 400 KB (อากาศรายวัน 10 ปี) ส่งไปให้ client เพื่อคำนวณซ้ำเมื่อเปลี่ยน practices

#tbl(columns: (30%, 70%), header: ("ค่าเริ่มต้น (`DEFAULT_PRACTICES`)", "ค่า"),
  [พันธุ์ / ฤดู], [KDML105 (หรือ `default_variety` ของจังหวัด) / นาปี],
  [วันปลูก], [จากกริด `plant_doy_wet` ถ้ามี ไม่งั้น 15 มิ.ย. (DOY 166) — *ASSUMPTION*],
  [วิธีปลูก / แหล่งน้ำ / ระบอบน้ำ], [นาหว่าน / น้ำฝน / rainfed (ในเขตชลประทาน → ชลประทาน / ขังตลอด)],
  [ปุ๋ย N / อินทรีย์ / เผาฟาง], [10 กก.N/ไร่ / 0 ตัน/ไร่ / ไม่เผา],
  [EC ที่วัดเอง / ผลผลิตปีก่อน], [ไม่มี (null)],
)

// ======================================================================= 4
= กระบวนการคำนวณ (Model)

== ภาพรวมโมเดล

โมเดลอยู่ใน `packages/model` (`MODEL_VERSION = '0.1.0'`, D-009) เป็น pure function ไม่มี I/O ใช้หน่วย SI ทั้ง 4 ด้านคำนวณใน *ลูปรายวันเดียว* (`runSeason.ts`) เพราะเชื่อมโยงกัน

#tbl(columns: (22%, 78%), header: ("ขั้น", "รายละเอียด"),
  [1. Profile], [`analyze_polygon` คืนค่าดิน (LDD หรือ SoilGrids clay), ธรณี (KTms), น้ำบาดาล (EC/ความลึก), เขตชลประทาน, ค่ากริด (SI, ระยะชายฝั่ง, วันปลูก), `weather_grid_id`, coverage และ confidence ต่อชั้น],
  [2. Soil params], [`soilWaterParams()` แปลง profile เป็นพารามิเตอร์ถังน้ำ (bucket): ความจุน้ำ, อัตราซึมลึก, capillary rise],
  [3. Base ECe], [`baseEce()` ค่าความเค็มตั้งต้นก่อนฤดูตามกลไก `salinity_origin`],
  [4. Season window], [`seasonWindow()` วันปลูก วันออกดอก วันเก็บเกี่ยว ตามพันธุ์ (ไวแสง / ไม่ไวแสง)],
  [5. Daily loop], [spin-up 30 วันก่อนปลูก → ทุกวัน: Kc → ETc → ความต้องการน้ำ → `waterStep` → `saltStep` → สะสมผลรวม],
  [6. Yield], [Y = Y#sub[pot] × f#sub[water] × f#sub[salt] × f#sub[nutrient] (× calibration ถ้ามีผลผลิตจริง)],
  [7. GHG], [IPCC 2019 Tier 1: CH#sub[4] ข้าว + เผาฟาง, N#sub[2]O direct, CO#sub[2] ยูเรีย → CO#sub[2]e (GWP100 AR6)],
  [8. Ensemble], [รันฤดูเดียวกันทุกปีที่มีอากาศครบ ≥ 90% → P10/P50/P90],
)

== ฤดูปลูกและค่าสัมประสิทธิ์พืช (Kc)

*วันปลูก:* จาก `practices.plantDate` → ไม่มีให้ใช้ `plant_doy_wet`/`plant_doy_dry` ของกริด → ไม่มีให้ใช้ค่าตั้งต้น นาปี 15 มิ.ย. (DOY 166), นาปรัง 15 ม.ค. (DOY 15), นาปรังรอบ 2 = นาปรัง + 60 วัน (*ASSUMPTION*)

*พันธุ์ไวแสง* (KDML105, กข6, กข15) ในนาปี: ออกดอกตามวันที่ในปฏิทิน (DOY 295 / 293 / 284) โดยต้องมีช่วงเจริญเติบโตอย่างน้อย 60 วัน แล้วเก็บเกี่ยวหลังออกดอก 30 วัน (Yoshida 1981) · *พันธุ์ไม่ไวแสง* ใช้อายุคงที่ (กข41/กข47 105 วัน, PTT1 115 วัน, SPT1 120 วัน) ลบ 20 วันถ้าเป็นนาดำ (ช่วงตกกล้า — *ASSUMPTION*)

*Kc (FAO-56 Table 11–12):* ระยะตั้งตัว/พัฒนา/กลางฤดู/ปลายฤดู = 30/30/60/30 ส่วนของ 150 วัน

$ K_c (f) = cases(
  1.05 & "ถ้า" f < 0.2,
  1.05 + (f - 0.2) / 0.2 dot (1.20 - 1.05) & "ถ้า" 0.2 <= f < 0.4,
  1.20 & "ถ้า" 0.4 <= f < 0.8,
  1.20 + min(1, (f - 0.8) / 0.2) dot (0.90 - 1.20) & "ถ้า" f >= 0.8,
) $

โดย $f$ = วันในฤดู / ความยาวฤดู · ช่วง spin-up 30 วันก่อนปลูกใช้ $K_c = 0.8$ (ดินเปล่าเปียก — *ASSUMPTION*) · $"ET"_c = K_c times "ET"_0$

== สมดุลน้ำรายวัน (FAO-56 bucket)

สถานะ $W$ (mm) คือปริมาณน้ำเทียบกับผิวดินอิ่มตัว: $W > 0$ = ความลึกน้ำขัง (สูงสุดเท่าคันนา), $W < 0$ = น้ำที่ขาดจากอิ่มตัวในเขตราก (ต่ำสุด $-D_max$)

$ W_t = W_(t-1) + P_t + I_t + "CR"_t - "ET"_(a,t) - "DP"_t - "RO"_t $

#tbl(columns: (16%, 84%), header: ("พจน์", "สูตรในโค้ด (waterBalance.ts)"),
  [$P$], [ฝนรายวันจาก `weather_series` (ถ้าไม่มีวันนั้น = 0)],
  [$"ET"_a$], [$"ET"_a = K_s dot "ET"_c$ (FAO-56 Eq. 84) โดย $K_s = 1$ เมื่อ depletion ≤ RAW, ไม่งั้น $K_s = (D_max - "depletion") / (D_max - "RAW")$ — ใช้ ETa แทน ETc เพื่อรักษามวล (D-009)],
  [$"DP"$], [ซึมลึก $= min("perc", W + S_d)$ เมื่อ $W > -S_d$ · perc จาก LDD ksat (cap 15 mm/d) หรือจาก clay%: ≥ 40% → 1.5, ≥ 25% → 3, ≥ 15% → 5, อื่น ๆ → 8 mm/d (ไม่มีข้อมูล 4 mm/d) × $"clamp"("gwDepth"/2, 0.1, 1)$],
  [$"CR"$], [น้ำใต้ดินยกตัว $= min("CR"_max, -W)$ เมื่อ $W < 0$ · $"CR"_max = 3 dot "clamp"(1 - "depth"/3, 0, 1)$ mm/d (0 เมื่อลึก ≥ 3 m)],
  [$"RO"$], [น้ำล้นคันนา $= max(0, W - 150)$ (คันนาสูง 150 mm)],
  [$I$], [ขังตลอด: เติมถึง 50 mm เมื่อ $W < 20$ · AWD: เติมถึง 50 mm เมื่อระดับน้ำลดถึง −150 mm (= −15 mm storage ด้วย S#sub[y] 0.1) และขังน้ำช่วงออกดอก ±7 วัน · rainfed: ไม่เติม แต่คำนวณ "น้ำที่ควรเติม" ด้วย shadow balance],
)

*พารามิเตอร์ดิน:* เขตราก 500 mm, $theta_"sat" = 0.45$, specific yield 0.10 → $S_d = 50$ mm · AWC จาก LDD หรือ $"AWC" = 90 + ("clay"/60) dot 90$ mm/m (clay 0–60%, ไม่มีข้อมูล 140 mm/m) · $D_max = S_d + 0.5 dot "AWC"$ · $"RAW" = S_d + 0.20 dot (D_max - S_d)$ (FAO-56 Table 22, p = 0.20)

*การเข้าถึงชลประทาน:* `waterSource = 'irrigated'` หรืออยู่ในเขตชลประทาน *และ* ระบอบน้ำไม่ใช่ rainfed

*ผลลัพธ์ด้านน้ำ:* น้ำที่ใช้ได้ = $max(0, Sigma P - Sigma "RO" + Sigma I + Sigma "CR")$ (mm; ×1.6 = ลบ.ม./ไร่) · ความต้องการเติมน้ำ (mm) · จำนวนวันขาดน้ำ (วันที่ $K_s < 1$)

== ความเค็ม (Salinity)

=== ค่าฐาน ECe ก่อนฤดู (`baseEce`)

ลำดับความสำคัญ: (1) EC ดินที่ผู้ใช้วัดเอง → confidence *high* (2) แผนที่ดินเค็ม LDD ผสมกับตัวชี้วัด (น้ำหนัก LDD 0.7 — *ASSUMPTION*) (3) ตัวชี้วัดอย่างเดียว → confidence *low*, source `fallback`

$ "ECe"_"indicator" = 0.8 + Delta_"SI" + Delta_"gw" + cases(Delta_"rock" & "inland_rock_salt", Delta_"coast" & "coastal_intrusion", max(dots) & "mixed", 0 & "none") $

#tbl(columns: (18%, 52%, 30%), header: ("พจน์", "สูตร", "ที่มา"),
  [ค่าพื้นหลัง], [0.8 dS/m], [*ASSUMPTION*],
  [$Delta_"SI"$], [$6 dot "clamp"(("SI" - 0.15) / (0.35 - 0.15), 0, 1)$ โดย SI = $sqrt("Blue" times "Red")$ ของ Sentinel-2 ฤดูแล้ง], [Khan et al. 2005; ช่วงแมป *ASSUMPTION*],
  [$Delta_"gw"$], [$"EC"_"gw" times 0.5 times "clamp"((3 - "depth") / 3, 0, 1)$], [factor 0.5 *ASSUMPTION*],
  [$Delta_"rock"$], [$2 times sum w_i dot f_"depth"$ ของ polygon KTms ($f_"depth" = 1 - "depth"/200$, ไม่ทราบความลึก = 0.5)], [*ASSUMPTION*],
  [$Delta_"coast"$], [$8 times "clamp"(1 - "dist"/50, 0, 1)$ dS/m], [*ASSUMPTION*],
)

*EC น้ำบาดาล:* จาก DGR โดย `ec_dsm = TDS / 640` (FAO-29) เนื่องจากแผนที่ DGR ไม่มี EC และความลึก (D-023) · TDS เป็นค่ากลางช่วงตามสี legend (ปลายเปิด > 1,500 mg/L → 2,250 — *ASSUMPTION*) · ถ้าไม่มีข้อมูล DGR: 3.0 dS/m เหนือ KTms (น้ำหนัก ≥ 0.5), 0.5 dS/m ที่อื่น · ความลึกน้ำใต้ดินไม่มีข้อมูลจริง → ค่าตั้งต้น 5 m (จึงไม่มี capillary rise และ $Delta_"gw" = 0$ ในทุกแปลงขณะนี้)

*EC น้ำชลประทาน:* 0.4 dS/m (นาปี) · นาปรังในพื้นที่ชายฝั่ง + สูงสุด 3 dS/m ตามระยะชายฝั่ง (*ASSUMPTION*) · ถ้าผู้ใช้วัด EC น้ำเองใช้ค่านั้น

*แมประดับดินเค็ม LDD → ECe:* very_high 16, high 10, moderate 6, low 3, none 1 dS/m (ค่ากลางช่วงจาก LDD/Arunin 1984 — *ASSUMPTION*)

=== สมดุลเกลือรายวัน (`saltStep`)

เกลือเก็บเป็น $S = "ECe" times V_"sat"$ (dS/m·mm) โดย $V_"sat" = 500 times 0.45 = 225$ mm

$ S_t = S_(t-1) + "CR"_t dot C_"gw" + I_t dot C_"irr" - min(S_"in", "DP"_t dot C_("soil",t) dot "LE") $

$C_("soil",t) = S_(t-1) / max(0.1 V_"sat", V_"sat" + W_(t-1))$ (น้ำขังเจือจาง ดินแห้งทำให้เข้มข้น) · ฝนไม่มีเกลือ · Leaching efficiency LE = 0.5 (FAO-29 ให้ 0.3–1.0 — *ASSUMPTION*) · $"ECe"_t = S_t / V_"sat"$

=== การจัดระดับและคำแนะนำ

ระดับ (USDA Handbook 60 / FAO): < 2 ไม่เค็ม · 2–4 เค็มน้อย · 4–8 เค็มปานกลาง · ≥ 8 เค็มจัด — ใช้ $max("ECe"_"base", "ECe"_(P 50))$ · คำแนะนำแบบ rule-based: พันธุ์ทนเค็ม ($f_"salt" < 0.95$), ยิปซัม (ปานกลาง/จัด), ไม้ยืนต้นบนพื้นที่รับน้ำ (อีสาน), ชะล้างเกลือ (มีชลประทาน EC < 0.75), หลีกเลี่ยงน้ำบาดาลเค็ม (EC#sub[gw] ≥ 0.75)

== ผลผลิต (Yield)

$ Y = Y_"pot" times f_"water" times f_"salt" times f_"nutrient" $

#tbl(columns: (18%, 82%), header: ("ปัจจัย", "สูตร"),
  [$f_"water"$], [$Sigma "ET"_a \/ Sigma "ET"_c$ ในช่วงออกดอก ±20 วัน (clamp 0–1; ไม่มีความต้องการ = 1)],
  [$f_"salt"$], [Maas–Hoffman: $f_"salt" = "clamp"(1 - b dot max(0, "ECe" - a), 0, 1)$ ใช้ ECe เฉลี่ยตลอดฤดู · ข้าวทั่วไป $a = 3.0$ dS/m, $b = 12%$ ต่อ dS/m (Maas & Hoffman 1977; FAO-29 Table 4) · ตรวจ: ECe = 5 → $f_"salt" = 0.76$ (unit test)],
  [$f_"nutrient"$], [$0.55 + 0.45 dot (1 - e^(-k N))$, $k = ln 10 \/ 90$ (ถึง 90% ของการตอบสนองที่ 90 kg N/ha) · N = N เคมี (กก./ไร่ ÷ 0.16) + ปุ๋ยคอก × 0.5% N × 30% ใช้ได้ (Dobermann & Fairhurst 2000; F0 = 0.55 และ k เป็น *ASSUMPTION*)],
  [Calibration], [ถ้าผู้ใช้กรอกผลผลิตปีก่อน: $r = "clamp"(Y_"obs" \/ Y_"ref", 0.5, 2)$, ตัวคูณ $= 1 + 0.5 (r - 1)$ ($Y_"ref"$ = มัธยฐานของ ensemble) — *ASSUMPTION* α = 0.5],
)

#tbl(columns: (16%, 15%, 13%, 16%, 13%, 27%), header: ("พันธุ์", "Y_pot (kg/ha)", "≈ กก./ไร่", "เกณฑ์ a (dS/m)", "ความชัน b", "ไวแสง / อายุ"),
  [KDML105], [3,000], [480], [3.0], [11%], [ไวแสง · ออกดอก DOY 295],
  [กข6 (RD6)], [3,600], [576], [3.0], [12%], [ไวแสง · DOY 293],
  [กข15 (RD15)], [3,000], [480], [3.0], [11%], [ไวแสง · DOY 284],
  [กข41 (RD41)], [5,600], [896], [3.0], [12%], [ไม่ไวแสง · 105 วัน],
  [กข47 (RD47)], [5,400], [864], [3.0], [12%], [ไม่ไวแสง · 105 วัน],
  [ปทุมธานี 1 (PTT1)], [4,800], [768], [2.5], [13%], [ไม่ไวแสง · 115 วัน],
  [SPT1], [5,000], [800], [3.0], [12%], [ไม่ไวแสง · 120 วัน],
)
#text(size: 8.8pt, fill: muted)[ทุกค่าในตารางพันธุ์เป็น *ASSUMPTION* (ผลผลิตศักย์ ≈ ค่าเฉลี่ยสถานีของกรมการข้าว × 1.2; ความทนเค็มปรับจากเส้นข้าวทั่วไปตามการจัดอันดับเชิงคุณภาพ) · หมายเหตุ: SPEC §5.4 เรียก SPT1 ว่า "สันป่าตอง 1" แต่คอมเมนต์ใน `varieties.ts` ระบุ "สุพรรณบุรี 1" — ควรยืนยันชื่อพันธุ์]

== ก๊าซเรือนกระจก (IPCC 2019 Refinement, Tier 1)

$ "CH"_4 = "EF"_c times "SF"_w times "SF"_p times "SF"_o times t quad ["kg CH"_4 "/ha"] $
$ "SF"_o = (1 + "ROA"_"straw" dot 0.19 + "ROA"_"FYM" dot 0.21)^(0.59) $
$ "N"_2"O" = N_"ha" times 0.004 times 44/28 #h(2em) "CO"_2 = N_"ha" / 0.46 times 0.20 times 44/12 $
$ "CO"_2"e" = ("CH"_4 times 27 + "N"_2"O" times 273 + "CO"_2) / 1000 quad ["t/ha"] $

#tbl(columns: (30%, 22%, 48%), header: ("ค่าคงที่", "ค่า", "อ้างอิง"),
  [EF#sub[c] (ขังตลอด ไม่มีอินทรีย์, SE Asia)], [1.22 kg CH#sub[4]/ha/วัน], [IPCC 2019 Table 5.11 (ช่วง 0.80–1.86)],
  [SF#sub[w]: ขังตลอด / AWD / rainfed ปกติ / rainfed แล้ง], [1.00 / 0.55 / 0.54 / 0.16], [Table 5.12 · rainfed "แล้ง" เมื่อมีน้ำขัง < 50% ของฤดู (*ASSUMPTION*)],
  [SF#sub[p]], [1.00], [Table 5.13 non-flooded < 180 วัน — ใช้ทุกฤดู (*ASSUMPTION*)],
  [CFOA ฟาง (> 30 วัน) / ปุ๋ยคอก], [0.19 / 0.21], [Table 5.14; exponent 0.59 (Eq. 5.3)],
  [ฟางที่เหลือในแปลงเมื่อไม่เผา], [50%], [*ASSUMPTION* (D-009)],
  [ฟาง (t DM/ha)], [$0.95 times (Y/1000 times 0.89) + 2.46$], [IPCC 2006 Vol.4 Table 11.2],
  [เผาฟาง: combustion factor / EF], [0.80 · CH#sub[4] 2.7, N#sub[2]O 0.07 g/kg DM], [IPCC 2006 Table 2.6 / 2.5 · CO#sub[2] จากการเผาเป็น biogenic ไม่นับ],
  [EF1 นาน้ำขัง], [0.004 kg N#sub[2]O-N / kg N], [Table 11.1 · นับเฉพาะ direct N#sub[2]O],
  [ยูเรีย], [46% N, 0.20 t C/t], [Eq. 11.13 · สมมติว่า N ทั้งหมดใส่เป็นยูเรีย (*ASSUMPTION*)],
  [GWP100 AR6], [CH#sub[4] 27.0 · N#sub[2]O 273 · CO#sub[2] 1], [IPCC AR6 WG1 Table 7.15 (CH#sub[4] non-fossil)],
)

ระบบแสดง *ส่วนต่างถ้าเปลี่ยนจากขังตลอดเป็น AWD* (`awdSavingCo2eTHa`) = (CH#sub[4] ที่ SF#sub[w] 1.0 − ที่ SF#sub[w] 0.55) × 27 / 1000 เพื่อชี้ศักยภาพคาร์บอนเครดิต (T-VER) · confidence ของ GHG = *medium* หรือ *low* ถ้าผู้ใช้ระบุระบอบน้ำที่ต้องใช้ชลประทานแต่แปลงไม่มีการเข้าถึงชลประทาน

== Ensemble P10–P90 และ "พยากรณ์ 10 ปี"

`runSeasonEnsemble` รันฤดูและ practices เดียวกันกับทุกปีที่อากาศครอบคลุมช่วงฤดู (รวม spin-up) ≥ 90% แล้วคำนวณเปอร์เซ็นไทล์แบบ linear interpolation (Hyndman & Fan type 7)

- ผลผลิต: P10/P50/P90 ข้ามปีของผลผลิตรายปี (หลัง calibration)
- ECe: P10/P50/P90 ข้ามปีของ ECe เฉลี่ยตลอดฤดู
- น้ำ/GHG/ค่าสเกลาร์ใน `quick`: จากปีล่าสุดที่ครบ · การ์ดน้ำและ GHG แสดงช่วงจากผลรายปี (D-021)
- รายงานแปลงแสดงกราฟรายปี (ผลผลิต P50, ECe P50) ของ 10 ปีย้อนหลัง

#callout(kind: "warn", title: "ข้อชี้แจงเรื่อง \"พยากรณ์ 10 ปี\"")[
  ข้อความบนหน้าเว็บบางจุดเรียกว่า "พยากรณ์ 10 ปี" แต่ในโค้ดปัจจุบัน (Phase 1) ช่วง P10–P90 มาจาก *ความแปรปรวนของอากาศย้อนหลัง 10 ปี (2016–2025)* ที่กริดเดียวกัน ไม่ใช่การฉายภาพอนาคต · หน้ารายงานเองระบุว่า "พยากรณ์ 5–10 ปีข้างหน้าแบบเป็นช่วงจากฉากทัศน์ภูมิอากาศ (CMIP6) จะเปิดใน Phase 2" · ตาราง `obs.weather_daily_proj` ยังว่าง (0 แถว) · เกลือไม่ถูกส่งต่อข้ามปี (แต่ละปีเริ่มจาก base ECe ใหม่) ต่างจากแนวคิด twin ที่ "ไม่รีเซ็ตเกลือ" ใน SPEC §10
]

== ระบบป้ายความเชื่อมั่น (Confidence tagging)

ทุกค่ามี `{level: high|medium|low, source}` และเมื่อรวมหลายแหล่งใช้ระดับที่ *อ่อนที่สุด* (`minConfidence`)

#tbl(columns: (16%, 42%, 42%), header: ("ด้าน", "เงื่อนไข", "ระดับ / source"),
  [ธรณี], [ทุกกรณี], [low · `DMR 1:250k`],
  [น้ำบาดาล], [มี polygon DGR ตัดแปลง / ไม่มี], [medium · `DGR 1:100k` / low · `fallback`],
  [ดิน], [มี LDD / มี SoilGrids clay ในกริด / ไม่มีเลย], [high · `LDD 1:25k` / low · `SoilGrids 250m` / low · `fallback`],
  [ความเค็ม], [EC ที่ผู้ใช้วัด / LDD / มี SI ในกริด / ไม่มี], [high · `user_measured` / high · `LDD 1:25k` / low · `Sentinel-2 SI` / low · `fallback`],
  [น้ำ (ผล)], [min(ดิน, อากาศ) · อากาศขาด > 10% ของฤดู], [อากาศครบ = medium · ขาด = low · `weather incomplete`],
  [ผลผลิต], [min(ตารางพันธุ์, น้ำ, ความเค็ม)], [ไม่มี calibration = low · มี = medium],
  [GHG], [ระบอบน้ำสอดคล้องกับการเข้าถึงน้ำ], [medium · `IPCC 2019 Tier 1` (ไม่สอดคล้อง = low)],
)

== ตัวอย่างการคำนวณจริงจากฐานข้อมูล

ผลเรียก `analyze_polygon` (read-only) บน polygon ขนาด 0.01° × 0.01° ที่ 103.25 E, 16.05 N (ต.ตลาด อ.เมืองมหาสารคาม) เมื่อ 11 ต.ค. 2569:

#tbl(columns: (35%, 65%), header: ("ค่าใน profile", "ผล"),
  [จังหวัด / origin / พันธุ์ตั้งต้น], [มหาสารคาม (`44`) / `inland_rock_salt` / KDML105],
  [ธรณี], [KTms น้ำหนัก 1.0, `rock_salt_depth_m` = null],
  [น้ำบาดาล DGR], [brackish, EC 1.562 dS/m, ความลึก null → ใช้ 5 m],
  [กริด (seed สังเคราะห์)], [clay 25.8%, SI 0.2876, `weather_grid_id` 3818832],
  [Confidence], [ดิน low (SoilGrids 250m) · ความเค็ม low (Sentinel-2 SI) · น้ำบาดาล medium · ธรณี low],
)

ค่าฐาน ECe = 0.8 + 6 × (0.2876 − 0.15)/0.20 + 1.562 × 0.5 × 0 + 2 × 1.0 × 0.5 = 0.8 + 4.13 + 0 + 1.00 ≈ *5.93 dS/m* → ระดับ "เค็มปานกลาง" · ค่า f#sub[salt] ของ KDML105 ที่ ECe นี้ ≈ 1 − 0.11 × 2.93 ≈ 0.68 (ค่าจริงในโมเดลใช้ ECe เฉลี่ยรายวันของฤดู) · *หมายเหตุ:* SI และ clay ของจุดนี้มาจาก seed สังเคราะห์ ตัวเลขจึงใช้แสดงกลไกการคำนวณเท่านั้น

ในทางตรงข้าม polygon ที่สุพรรณบุรี (100.10 E, 14.47 N) ได้ `grid` เป็น null ทั้งหมดยกเว้น `weather_grid_id` = 3764800 (จุด NASA POWER ใกล้สุด), น้ำบาดาล EC 0.391 dS/m, อยู่ในเขตชลประทาน, origin `none`, พันธุ์ตั้งต้น กข41 และ confidence ดิน/ความเค็ม = low · `fallback` → ECe ฐาน ≈ 0.8 dS/m คงที่ (ดูข้อจำกัดหัวข้อ 9)

// ======================================================================= 5
= ที่มาของข้อมูล

== สรุปแหล่งข้อมูลและสถานะใน DB

ตัวเลขจำนวนแถวมาจากฐานข้อมูล local (`supabase_db_petchwork`) ณ 11 ต.ค. 2569 · คอลัมน์ "สถานะ meta" คือค่าใน `meta.data_sources.status` · คอลัมน์ "ข้อมูลจริงใน DB" คือสิ่งที่ตรวจพบจริงจาก `meta.data_snapshots` (snapshot version `seed` = ข้อมูลสังเคราะห์)

#tbl(columns: (22%, 27%, 10%, 12.5%, 28.5%), header: ("แหล่ง (code)", "ตารางปลายทาง", "Tier", "สถานะ meta", "ข้อมูลจริงใน DB"),
  [`dmr_rock_250k`], [`ref.geology_units`], [semiannual], status("ok"), [7,093 polygon ทั้งประเทศ (snapshot 20261010T162159)],
  [`gistda_admin`], [`ref.admin_boundaries`], [semiannual], status("ok"), [77 จังหวัด + 928 อำเภอ (snapshot 20261010T162222)],
  [`gistda_irrigation`], [`ref.irrigation_zones`], [semiannual], status("ok"), [614 polygon (snapshot 20261010T162222)],
  [`dgr_groundwater`], [`ref.groundwater_zones`], [semiannual], status("limited"), [11,055 polygon 62 จังหวัด (snapshot 20261010T162534)],
  [`nasa_power`], [`ref.weather_grid`, `obs.weather_daily`], [static], status("ok"), [842 จุด · 3,311,586 แถว · 2016-01-01 → 2026-10-07],
  [`era5_land`], [`obs.weather_daily`], [static], status("ok"), [#status("seed") 80 จุด · 292,240 แถว สังเคราะห์ (มหาสารคาม 2016–2025)],
  [`soilgrids`, `cop_dem`, `chirps`, `sentinel2`, `gistda_rice_calendar`], [`ref.grid_cells`], [ต่างกัน], status("ok"), [#status("seed") 7,000 cell สังเคราะห์ เฉพาะจังหวัด 44],
  [`hdx_codab`], [`ref.admin_boundaries` (ตำบล)], [semiannual], status("ok"), [#status("seed") 2 ตำบลสังเคราะห์],
  [`thaiwater`], [`obs.reservoir_storage`, `obs.water_quality`, `ref.water_bodies`], [daily], status("ok"), [#status("seed") water_bodies 2 แถว · obs 0 แถว (ยังไม่ได้รัน ETL ลง DB)],
  [`open_meteo`], [`obs.weather_daily`], [daily], status("ok"), [ยังไม่มีแถว],
  [`jrc_gsw`], [`ref.water_bodies`], [semiannual], status("ok"), [stub — ยังไม่ implement],
  [`nex_gddp_cmip6`], [`obs.weather_daily_proj`], [static], status("ok"), [stub — 0 แถว],
  [`tmd`], [– (bias-correct)], [daily], status("limited"), [stub — ต้องมี API key],
  [`ldd_soil`, `ldd_saline`], [`ref.soil_units`, `ref.saline_soil_zones`], [manual], status("placeholder"), [0 แถว — รอไฟล์จาก LDD],
)

#callout(kind: "risk", title: "ข้อควรระวังในการตีความสถานะ")[
  `meta.data_sources.status = 'ok'` หมายถึง "แหล่งนี้ probe แล้วดึงได้" ไม่ได้แปลว่ามีข้อมูลจริงอยู่ใน DB แล้ว หลายแหล่ง (SoilGrids, DEM, CHIRPS, Sentinel-2, ERA5-Land, ThaiWater, HDX) มี `last_success_at` เป็นเวลาที่โหลด seed เท่านั้น · ก่อนใช้ผลในงานวิจัย ควรรัน ETL ของแหล่งเหล่านี้ (หรือแสดงสถานะ "seed" ให้ชัดในหน้า `/data`)
]

== รายละเอียดรายแหล่ง

=== 1) กรมทรัพยากรธรณี (DMR) — หน่วยหิน 1:250,000
#kv(
  [หน่วยงาน / ชุดข้อมูล], [กรมทรัพยากรธรณี · `GEOL/ROCK_UNIT_250K` (MapServer layer 0)],
  [มาตราส่วน], [1:250,000 · ทั้งประเทศ 7,093 polygon · หมวดหินมหาสารคาม (`TEXT_SYM = 'KTms'`) 21 polygon],
  [License / Tier], [Government open · semiannual],
  [ตารางปลายทาง / แถว], [`ref.geology_units` — 7,093 แถว (KTms 21)],
  [วิธีดึง], [`etl/sources/dmr.py` → ArcGIS REST `query?f=geojson` แบ่งหน้า ≤ 2,000 ด้วย `resultOffset` · check-for-change ด้วยจำนวน + hash ของ object id · map `is_maha_sarakham = (TEXT_SYM = 'KTms')`],
  [สถานะ], [#status("ok")],
  [ข้อควรระวัง], [ไม่มีความลึกชั้นเกลือหิน → `rock_salt_depth_m` = null (โมเดลใช้ factor 0.5) · มาตราส่วนหยาบกว่าแปลงมาก → confidence low เสมอ],
)

=== 2) กรมพัฒนาที่ดิน (LDD) — กลุ่มชุดดิน 1:25,000 และแผนที่ดินเค็ม
#kv(
  [หน่วยงาน / ชุดข้อมูล], [กรมพัฒนาที่ดิน · กลุ่มชุดดิน 1:25,000 และดินเค็ม/คราบเกลือ],
  [มาตราส่วน], [1:25,000],
  [License / Tier], [by request · manual],
  [ตารางปลายทาง / แถว], [`ref.soil_units` — 0 แถว · `ref.saline_soil_zones` — 0 แถว],
  [วิธีดึง], [`etl/sources/ldd.py` + `ldd_fieldmap.yaml` อ่านไฟล์ที่วางมือใน `etl/.raw/ldd/manual/<วันที่>/` (.shp/.gpkg/.geojson/.zip) → pipeline ปกติ → ตั้ง `has_ldd_*` = true และ mark แปลงที่ได้รับผลเป็น stale · ไม่มีไฟล์ = `skipped: no_source`],
  [สถานะ], [#status("placeholder")],
  [ข้อควรระวัง], [ลองแล้วไม่มีช่องทางอัตโนมัติ: `dinonline.ldd.go.th` ไม่มี OGC/REST, `agrimap-online` เป็น SPA ที่ยังไม่ได้แกะ API, `ogc.ldd.go.th` และ `ldd.gdcatalog.go.th` resolve ไม่ได้, data.go.th มีแค่สถิติรายจังหวัด · *ต้องทำหนังสือขอข้อมูล* — blocker ของ confidence สูง · ระหว่างนี้โมเดลใช้ SoilGrids clay + Sentinel-2 SI + EC น้ำบาดาลแทน],
)

=== 3) กรมทรัพยากรน้ำบาดาล (DGR) — แผนที่น้ำบาดาล 1:100,000
#kv(
  [หน่วยงาน / ชุดข้อมูล], [กรมทรัพยากรน้ำบาดาล ผ่าน data.go.th (CKAN) — 63 resources รายจังหวัด],
  [มาตราส่วน], [1:100,000 · ชั้น `GWAV_*.shp` (EPSG:24047) field `GWAV/TDS/YIELD`],
  [License / Tier], [Open Data Common · semiannual],
  [ตารางปลายทาง / แถว], [`ref.groundwater_zones` — 11,055 polygon (fresh 5,542 / brackish 3,652 / saline 1,861) · `has_dgr = true` 62 จังหวัด],
  [วิธีดึง], [`etl/sources/dgr.py` + `dgr_fieldmap.yaml` · ดาวน์โหลด `.rar` 60 ไฟล์ / `.zip` 2 ไฟล์ → แตกด้วย bsdtar (zip ชื่อไฟล์ TIS-620 แตกด้วย Python `zipfile` + cp874) · check-for-change ด้วย CKAN `last_modified` + size],
  [การแปลงค่า], [`quality_class` คิดจาก TDS: มาตรฐาน < 500 / 500–1,500 / > 1,500 mg/L; ภาคใต้ (80 81 92 93) legend ต่างกัน · `ec_dsm = TDS/640` (FAO-29) · TDS/yield ใช้ค่ากลางช่วง (ปลายเปิด > 1,500 → 2,250, > 20 → 25 — *ASSUMPTION*) · `depth_m` = null · ตัด polygon แหล่งน้ำ (`W`) และไม่มีข้อมูล (`NA`)],
  [สถานะ], [#status("limited")],
  [ข้อควรระวัง], [ไม่มีไฟล์ 14 จังหวัด (เชียงราย เชียงใหม่ น่าน พะเยา แพร่ แม่ฮ่องสอน ลำปาง ลำพูน อุตรดิตถ์ ยะลา ระนอง สงขลา สตูล สุราษฎร์ธานี) + เพชรบูรณ์ไม่มี URL · ไม่มี EC และความลึกจริง (D-023) — *ต้องให้กรมทรัพยากรน้ำบาดาลตรวจ* · เซิร์ฟเวอร์ `gis.dgr.go.th` timeout],
)

=== 4) GISTDA — ขอบเขตจังหวัด/อำเภอ 1:50,000 และเขตชลประทาน
#kv(
  [หน่วยงาน / ชุดข้อมูล], [สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ · `L05_AdminBoundary/L05_Province_GISTDA_50k`, `L05_Amphoe_GISTDA_50k` · `L09_rice/พื้นที่ชลประทาน_` (ใช้แทน `gis.rid.go.th` ที่ไม่มี REST)],
  [มาตราส่วน], [1:50,000 (ขอบเขต)],
  [License / Tier], [Government open · semiannual],
  [ตารางปลายทาง / แถว], [`ref.admin_boundaries` — 1,007 แถว (จังหวัด 77, อำเภอ 928, ตำบล 2 จาก seed) · `ref.irrigation_zones` — 614 polygon (ต้นทาง 615 id)],
  [วิธีดึง], [`etl/sources/gistda.py` · ArcGIS REST · เขตชลประทาน (ArcGIS 10.1 ไม่รองรับ paging) ดึงเป็นชุดตาม objectIds · `PV_CODE` = รหัสจังหวัด DOPA 2 หลัก, อำเภอ `AP_IDN` 4 หลัก, `region` จาก `RE_ROYIN`],
  [สถานะ], [#status("ok")],
  [ข้อควรระวัง], [เขตชลประทานใช้ตัดสินว่า "เข้าถึงน้ำชลประทาน" แบบ boolean (ไม่มีโควตาน้ำจริง) · ยังไม่ได้ตรวจว่า polygon ที่หายไป 1 รายการ (615 → 614) เกิดจากอะไร],
)

=== 5) HDX COD-AB Thailand — ขอบเขตตำบล
#kv(
  [หน่วยงาน / ชุดข้อมูล], [OCHA Humanitarian Data Exchange · `cod-ab-tha`],
  [License / Tier], [CC BY-IGO · semiannual],
  [ตารางปลายทาง / แถว], [`ref.admin_boundaries` (level `subdistrict`) — 2 แถว seed สังเคราะห์ในมหาสารคาม],
  [วิธีดึง], [`etl/sources/phase2.py` (stub `skipped: not_implemented`) · ไฟล์ `.geojson.zip` 437 MB],
  [สถานะ], [#status("seed")],
  [ข้อควรระวัง], [นอก 2 ตำบล seed `admin.subdistrict_*` = null · caveat ของแหล่ง: ชื่อเขตป้อมปราบฯ ผิด],
)

=== 6) NASA POWER — อากาศรายวันทั้งประเทศ
#kv(
  [หน่วยงาน / ชุดข้อมูล], [NASA Langley Research Center · POWER daily point API (`community=AG`) ตัวแปร T2M_MAX, T2M_MIN, PRECTOTCORR, RH2M, WS2M, ALLSKY_SFC_SW_DWN],
  [ความละเอียด], [สุ่มจุดที่ 0.25° แต่ความละเอียดจริง MERRA-2 0.5° × 0.625° (รังสี 1°) — จุดที่อยู่ติดกันอาจได้ค่าเดียวกัน],
  [License / Tier], [public domain · static (โหลดครั้งเดียว + เติมได้)],
  [ตารางปลายทาง / แถว], [`ref.weather_grid` 842 จุด + `obs.weather_daily` 3,311,586 แถว (`source = 'nasa_power'`) 2016-01-01 → 2026-10-07],
  [วิธีดึง], [`etl/sources/nasapower.py` · จุด 0.25° ที่ห่างจังหวัด ≤ 15 km · id ตามสูตร D-012 · ข้ามจุดที่ id ชนกับจุด seed มหาสารคาม (ไม่เขียนทับ) · ≤ 4 concurrent, เว้น ≥ 1.5 s, retry 429 · cache raw ต่อจุด (resume ได้) · MERGE (append) ไม่ใช่ swap],
  [ET0], [FAO-56 Penman–Monteith (Eq. 6, ความสูงจาก POWER, RH#sub[mean] Eq. 19, R#sub[so] Eq. 37) · fallback Hargreaves (Eq. 52) เมื่อขาด Rs/RH/ลม],
  [สถานะ], [#status("ok")],
  [ข้อควรระวัง], [*หยาบกว่า ERA5-Land 0.1° มาก* (≈ 50–70 km) ใช้แทนชั่วคราวจนกว่าจะทำ ERA5-Land bulk (D-004/D-029) · 2–3 วันล่าสุดยังเป็น fill value · แปลงนอกกริด 0.01° ใช้จุดใกล้สุดภายใน 50 km],
)

=== 7) ERA5-Land (Copernicus) และ Open-Meteo API
#kv(
  [หน่วยงาน / ชุดข้อมูล], [Copernicus Climate Change Service — ERA5-Land reanalysis (ผ่าน Open-Meteo S3 หรือ CDS) · Open-Meteo archive/forecast API],
  [ความละเอียด], [0.1°],
  [License / Tier], [Copernicus licence · static (backfill 20 ปี) / Open-Meteo CC BY 4.0 · daily],
  [ตารางปลายทาง / แถว], [`obs.weather_daily` — ยังไม่มีแถวจริงจาก 2 แหล่งนี้ · แถว `source = 'seed'` 292,240 แถว (80 จุด, 2016–2025) ในมหาสารคามเป็น *ข้อมูลสังเคราะห์* ที่ลงทะเบียน snapshot ไว้ใต้ `era5_land`],
  [วิธีดึง], [`etl/sources/era5land.py` (pilot ผ่าน archive API `era5_seamless` พร้อม budget guard; nationwide อ่าน S3 `.om` ยังเป็น stub) · `etl/sources/openmeteo.py` (7 ตัวแปร, ลม 10 m → 2 m × 0.748, budget 8,000 call/วัน)],
  [สถานะ], [#status("seed") (ERA5) · ยังไม่โหลด (Open-Meteo)],
  [ข้อควรระวัง], [ห้ามใช้ Open-Meteo API ทำ backfill (≈ 2.2 ล้าน call ≈ 220 วันบน free tier — D-004) · *แปลงในมหาสารคามปัจจุบันใช้อากาศ seed สังเคราะห์* เพราะ 12 จุด NASA POWER ที่ชนกับจุด seed ถูกข้าม],
)

=== 8) SoilGrids 250m (ISRIC) และ Copernicus DEM GLO-30
#kv(
  [หน่วยงาน / ชุดข้อมูล], [ISRIC World Soil Information — SoilGrids (clay, SOC 0–30 cm) · ESA/Copernicus DEM GLO-30],
  [ความละเอียด], [250 m · 30 m],
  [License / Tier], [CC BY 4.0 · semiannual / Copernicus licence · static],
  [ตารางปลายทาง / แถว], [`ref.grid_cells.sg_clay_pct`, `sg_soc_gkg`, `elev_m`, `slope_pct` — 7,000 cell ทั้งหมดเป็น seed สังเคราะห์ (จังหวัด 44)],
  [วิธีดึง], [`etl/sources/soilgrids.py` อ่าน VRT/COG แบบ window ถ่วงความหนาชั้น (ไม่ใช้ REST ที่จำกัด ≈5 call/นาที) · `etl/sources/dem.py` อ่าน COG ต่อ tile 1° · ไฟล์ DEM ดิบ 4 ไฟล์ของบริเวณมหาสารคามมีใน `etl/.raw/cop_dem/` แต่ snapshot ใน DB ยังเป็น seed],
  [สถานะ], [#status("seed")],
  [ข้อควรระวัง], [SoilGrids คืน null ในพื้นที่เมือง · ยังไม่ได้สร้างกริด 0.01° ทั้งประเทศ (≈430,000 cell) → นอกมหาสารคามค่าดินเป็น null],
)

=== 9) Sentinel-2, CHIRPS, GISTDA ปฏิทินปลูก, JRC Surface Water, NEX-GDDP-CMIP6
#tbl(columns: (20%, 20%, 15%, 45%), header: ("แหล่ง", "ปลายทาง", "License", "สถานะ / หมายเหตุ"),
  [Sentinel-2 SI/NDVI (ผ่าน Google Earth Engine)], [`ref.grid_cells.si_dry_season`, `obs.sat_indices`], [Copernicus], [stub · ค่า SI ในกริด 44 เป็น seed · SI = $sqrt("Blue" times "Red")$ reflectance 0–1 (D-010)],
  [CHIRPS 2.0 (UCSB CHC)], [`ref.grid_cells.rain_normal_mm`], [public domain], [stub · ค่าปกติฝนในกริด 44 เป็น seed],
  [GISTDA พื้นที่ปลูกข้าวรายครึ่งเดือน 2015–2018], [`plant_doy_wet/dry`], [Government open], [stub · วันปลูกในกริด 44 เป็น seed],
  [JRC Global Surface Water], [`ref.water_bodies`], [CC BY 4.0], [stub],
  [NEX-GDDP-CMIP6 (NASA)], [`obs.weather_daily_proj`], [CC BY-SA 4.0], [stub · มี SSP2-4.5/SSP5-8.5 ตาม SPEC · Phase 2],
)

=== 10) ThaiWater (สสน.) และกรมอุตุนิยมวิทยา (TMD)
#kv(
  [หน่วยงาน / ชุดข้อมูล], [สถาบันสารสนเทศทรัพยากรน้ำ (สสน.) — คลังข้อมูลน้ำแห่งชาติ public API (`waterlevel_load`, `rain_24h`) · TMD `WeatherToday/V2`],
  [License / Tier], [ThaiWater: *ไม่ระบุชัด* · daily / TMD: ต้องมี key · daily],
  [ตารางปลายทาง / แถว], [`obs.reservoir_storage` 0, `obs.water_quality` 0, `obs.rain_station_daily` 0 · `ref.water_bodies` 2 (seed: อ่างเก็บน้ำ 1 + ลำน้ำ 1 สมมติ)],
  [วิธีดึง], [`etl/sources/thaiwater.py` (โมดูลพร้อม มีไฟล์ดิบ 2 ไฟล์ใน `etl/.raw/thaiwater/` แต่ไม่พบ ingest job ที่โหลดลง DB) · TMD stub],
  [สถานะ], [#status("seed")],
  [ข้อควรระวัง], [ต้องแสดง attribution *"คลังข้อมูลน้ำแห่งชาติ (สสน.)"* เสมอ · ต้องยืนยัน license ก่อน cache/เปิดดาวน์โหลดสาธารณะ · TMD ไม่มีข้อมูลย้อนหลัง ใช้ได้แค่ bias-correct],
)

=== 11) ภาพถ่ายดาวเทียมพื้นหลัง (แสดงผลเท่านั้น)
#kv(
  [ชุดข้อมูล], [Esri World Imagery (raster, maxzoom 18) + Esri Reference `World_Transportation`, `World_Boundaries_and_Places` · ทางเลือก EOX Sentinel-2 cloudless 2020 (10 m, `NEXT_PUBLIC_BASEMAP=eox`)],
  [การใช้งาน], [แสดงผลให้ผู้ใช้ปักมุมแปลงเท่านั้น *ไม่ได้นำค่า pixel ไปคำนวณ* และไม่เก็บลง DB],
  [ข้อควรระวัง], [Esri ใช้ฟรีได้สำหรับ non-commercial/พัฒนา — ก่อนใช้เชิงพาณิชย์ต้องตรวจ Esri Terms of Use · EOX เป็น CC BY-NC-SA 4.0 · ภาพแต่ละพื้นที่ถ่ายคนละวัน (ไม่ใช่ภาพปัจจุบัน) · ยังไม่ cache tile สำหรับ offline (D-030)],
)

== ข้อมูลสังเคราะห์ (seed) ที่ยังอยู่ในฐานข้อมูล

ไฟล์ `supabase/seed.sql` ระบุชัดว่าเป็น *"SYNTHETIC dev data (D-005). NOT real data"* ใช้เพื่อให้พัฒนา UI ได้ก่อน ETL จริงเสร็จ ETL จริงจะ swap ทับเมื่อรัน

#tbl(columns: (35%, 65%), header: ("ส่วนที่ยังเป็น seed", "ผลกระทบ"),
  [`ref.grid_cells` 7,000 cell (จังหวัด 44)], [ค่า clay, SOC, ความสูง, ฝน/ET0 ปกติ, วันปลูก, SI, ระยะชายฝั่ง (เช่น 513 km) ในมหาสารคามเป็นค่าสมมติ → ECe และพารามิเตอร์ดินของแปลงในมหาสารคามยังไม่ใช่ค่าจริง],
  [`ref.weather_grid` 80 จุด + `obs.weather_daily` 292,240 แถว (`source = 'seed'`)], [แปลงในมหาสารคามใช้อากาศสังเคราะห์ 2016–2025],
  [ตำบล 2 แห่ง, `ref.water_bodies` 2 รายการ, แปลง demo], [ชื่อตำบลแสดงเฉพาะ 2 ตำบลนี้ · แหล่งน้ำใกล้สุดเป็นชื่อสมมติ (เช่น "อ่างเก็บน้ำแก่งเลิงจาน (สมมติ)")],
)

// ======================================================================= 6
= ETL pipeline

== ขั้นตอนต่อแหล่ง (`etl/pipeline.py`)

#tbl(columns: (14%, 86%), header: ("ขั้น", "รายละเอียด"),
  [1. Check], [token ของต้นทาง (ArcGIS `returnIdsOnly` → จำนวน + hash ของ id, CKAN `last_modified` + size, HTTP ETag/Last-Modified, sha256 ไฟล์ LDD) นำหน้าด้วย scope (`bbox:…` / `nationwide`) เทียบ `meta.data_sources.last_checksum` → เท่ากัน = `skipped: unchanged`],
  [2. Fetch], [retry exponential backoff 3 ครั้ง (429/5xx/timeout) · เก็บไฟล์ดิบที่ `etl/.raw/<source>/<yyyy-mm-dd>/` (หรือ Storage `etl-raw/` ด้วย `--upload-raw`) · ตรวจ path traversal/symlink ตอนแตกไฟล์],
  [3. Stage], [`staging.<table>` = `LIKE ref.<table> INCLUDING ALL` → COPY → `ST_Transform 4326` → `ST_MakeValid` → `ST_SimplifyPreserveTopology` → `ST_Multi` · โหมด `replace` (polygon), `grid_update` (`ref.grid_cells`), `merge` (`obs.*`, upsert ตาม key)],
  [4. Validate], [rows > 0 · row delta ≤ ±30% เทียบตาราง live (ข้ามถ้ายังเป็น seed) · geometry valid 100% + SRID 4326 · not-null · ช่วงค่า (เช่น EC 0–50 dS/m, ความสูง −50–3,000 m, clay 0–100%) · coverage จังหวัดตาม flag · ไม่ผ่าน = `blocked` ไม่แตะข้อมูลจริง],
  [5. Swap], [transaction เดียว (`lock_timeout 15s`): `ref.x` → `archive.x_v<version>`, `staging.x` → `ref.x`, คืนชื่อ index/sequence, copy GRANT, เก็บ archive 2 เวอร์ชัน · ผู้อ่านพร้อมกันไม่เห็นตารางว่าง · rollback ได้ด้วย `--rollback`],
  [6. Record], [`meta.data_snapshots` (version = UTC `YYYYMMDDTHHMMSS`, checksum, row_count, bbox, `changed_area`) + อัปเดต `last_checksum` / `last_success_at` / `next_run_at`],
  [7. Recompute], [แปลงใน `app.fields` ที่ตัด `changed_area` → `sim.model_runs.is_stale = true` → ส่งคิว pgmq `profile_refresh` หรือเรียก `analyze_polygon` แบบ sync แล้ว upsert `sim.field_profile` (ไม่ลบผลเก่า)],
  [8. Notify], [ส่งสรุปไป `ETL_ALERT_WEBHOOK` (Slack/Discord) ทั้งสำเร็จและล้มเหลว],
)

สถานะใน `meta.ingest_jobs.status`: `running` · `success` · `skipped` · `dry_run` · `blocked` · `failed` — ใน DB local มี 12 job: success 6, skipped 2, blocked 2 (validation DGR รอบแรก), failed 2 (bsdtar แตก zip TIS-620 ไม่ได้ และ NASA POWER HTTP 429 ซึ่งต่อมาแก้และโหลดสำเร็จ)

== ตารางเวลา (GitHub Actions)

#tbl(columns: (25%, 25%, 50%), header: ("Workflow", "cron (UTC)", "Tier / แหล่ง"),
  [`etl-daily.yml`], [`0 19 * * *`], [daily — อากาศรายวัน, ThaiWater (02:00 น. เวลาไทย)],
  [`etl-quarterly.yml`], [`0 19 1 1,4,7,10 *`], [quarterly — CHIRPS, Sentinel-2 (ยังเป็น stub)],
  [`etl-semiannual.yml`], [`0 19 1 1,7 *`], [semiannual — DMR, DGR, GISTDA, SoilGrids, JRC, HDX, ตรวจไฟล์ LDD],
  [`etl-manual.yml`], [dispatch เท่านั้น], [static / manual / แหล่งใดก็ได้ (NASA POWER, DEM, CMIP6, ERA5-Land)],
)

ทุก workflow รันใน container `ghcr.io/osgeo/gdal:ubuntu-small-latest` รับ input `source`, `dry_run`, `force` · ขอบเขตกำหนดด้วย repo variable `ETL_SCOPE` = `pilot` (มหาสารคาม bbox `102.85,15.6,103.55,16.6`) หรือ `nationwide`

== สูตร Grid id (D-012)

ETL และ SQL ต้องใช้สูตรเดียวกัน (`etl/lib/grid.py`, `supabase/seed.sql`) โดยบวก epsilon 10#super[−7] กันความคลาดเคลื่อน floating point ที่ขอบ cell

$ "grid_cells.id" = floor((φ_min + 90) times 100) times 36000 + floor((λ_min + 180) times 100) $
$ "weather_grid.id" = floor((φ + 90) times 10) times 3600 + floor((λ + 180) times 10) $
$ "cell.weather_grid_id" = floor(i / 10) times 3600 + floor(j / 10) $

กริด 0.01° (≈1.1 km) ใช้เก็บค่าจาก raster (ดิน DEM ดัชนีเค็ม ปฏิทินปลูก) ส่วนอากาศเก็บที่กริด 0.1° · เป้าหมายทั้งประเทศ ≈430,000 cell และ ≈4,300 จุดอากาศ (ปัจจุบัน 7,000 cell และ 922 จุด)

// ======================================================================= 7
= ฐานข้อมูล

== Schema

#tbl(columns: (13%, 50%, 37%), header: ("Schema", "บทบาท", "การเข้าถึง"),
  [`ref`], [แผนที่อ้างอิง (ขอบเขต ธรณี น้ำบาดาล ชลประทาน ดิน กริด จุดอากาศ)], [ผ่าน RPC เท่านั้น],
  [`obs`], [อนุกรมเวลา (อากาศรายวัน, ฉายภาพ CMIP6, น้ำบาดาล, อ่างเก็บน้ำ, คุณภาพน้ำ, ฝนสถานี, ดัชนีดาวเทียม)], [ผ่าน RPC เท่านั้น],
  [`app`], [ข้อมูลผู้ใช้ (users, credentials, fields, practices, observations)], [PostgREST + RLS ทุกตาราง],
  [`sim`], [ผลจำลอง (field_profile, scenarios, model_runs, results_season/daily) ไม่เขียนทับ], [ผ่าน RPC ที่ตรวจ ownership],
  [`meta`], [data_sources, data_snapshots, ingest_jobs, model_versions, api_clients], [ผ่าน RPC],
  [`staging` / `archive`], [พื้นที่ stage ของ ETL / เวอร์ชันก่อนหน้าสำหรับ rollback], [ไม่เปิด],
)

== ตารางหลักและจำนวนแถว (11 ต.ค. 2569)

#tbl(columns: (30%, 52%, 18%), header: ("ตาราง", "เนื้อหา", "แถว"),
  [`ref.admin_boundaries`], [จังหวัด/อำเภอ/ตำบล (MultiPolygon, region)], [1,007],
  [`ref.province_coverage`], [enabled, `salinity_origin`, `default_variety`, `has_ldd_*`, `has_dgr`], [77],
  [`ref.geology_units`], [หน่วยหิน, `is_maha_sarakham`, `rock_salt_depth_m`], [7,093],
  [`ref.groundwater_zones`], [`quality_class`, `ec_dsm`, `tds_mgl`, `depth_m`, `yield_m3_hr`], [11,055],
  [`ref.irrigation_zones`], [เขตชลประทาน], [614],
  [`ref.soil_units` / `ref.saline_soil_zones`], [LDD placeholder], [0 / 0],
  [`ref.water_bodies`], [แหล่งน้ำ (seed)], [2],
  [`ref.grid_cells`], [กริด 0.01° (seed จังหวัด 44)], [7,000],
  [`ref.weather_grid`], [จุดอากาศ (NASA 842 + seed 80)], [922],
  [`obs.weather_daily`], [อากาศรายวัน partition รายปี 2000–2036 (ชนิด `real` — D-033)], [3,603,826],
  [`obs.weather_daily_proj`, `obs.gw_level`, `obs.reservoir_storage`, `obs.water_quality`, `obs.rain_station_daily`], [ยังไม่มีข้อมูล], [0],
  [`app.users` / `app.fields`], [ผู้ใช้ / แปลง (รวม demo)], [2 / 2],
  [`sim.scenarios`], [baseline, awd, salt_tolerant, farm_pond, bund_trees (Phase 2)], [5],
)

== RPC สำคัญ

#tbl(columns: (28%, 52%, 20%), header: ("RPC", "หน้าที่", "สิทธิ์"),
  [`analyze_polygon(geojson)`], [ตรวจ polygon → หาจังหวัดด้วย `ST_PointOnSurface` → overlay ถ่วงพื้นที่ (ดิน ดินเค็ม น้ำบาดาล ธรณี) → ค่ากริดถ่วงพื้นที่ + cell ที่ทับมากสุด (วันปลูก, weather id) → นอกกริดใช้จุดอากาศใกล้สุด ≤ 50 km (KNN) → confidence + `data_versions`], [anon, authenticated],
  [`weather_series(grid, from, to)`], [อากาศรายวันเป็น jsonb array เดียว (เลี่ยง PostgREST max_rows 1000) · ET0 null → Hargreaves · ช่วงสูงสุด 7,400 วัน], [anon, authenticated],
  [`mvt_tile(layer, z, x, y)`], [Mapbox Vector Tile ของ 6 ชั้น (whitelist) simplify ตาม zoom], [anon, authenticated],
  [`raw_data_catalog()` / `raw_data_rows(...)`], [หน้า `/data` (allow-list 16 ตาราง; `obs.weather_daily` นับแบบประมาณจาก `reltuples`)], [anon],
  [`ensure_app_user`, `auth_register`, `auth_credentials`, `auth_record_login`], [จัดการผู้ใช้/รหัสผ่าน], [authenticated / service_role],
  [`enqueue_twin_run`, `field_results`], [Phase 2 stub: ตรวจ ownership, คิว twin, ผลทุก scenario], [authenticated],
)

Trigger บน `app.fields`: `fields_admin_codes` (BEFORE — เติมรหัสปกครอง) และ `fields_profile` (AFTER — snapshot `analyze_polygon` ลง `sim.field_profile`, mark runs เดิม `is_stale` เมื่อ geometry เปลี่ยน)

== ขนาดฐานข้อมูล

DB local มีขนาดรวม ≈810 MB: `obs` 348 MB (อากาศรายวัน), `staging` 379 MB (ตาราง stage ค้างจาก ETL), `ref` 55 MB · migration `20261011000100` (D-033) เปลี่ยนคอลัมน์อากาศเป็น `real` (float4) ลดขนาด heap ≈25% เพื่อให้พอดี Supabase Free 500 MB — แต่ถ้าโหลดอากาศทั้งประเทศ 0.1° × 20 ปี (≈31 ล้านแถว ≈ 3.7 GB) ต้องใช้ Supabase Pro

// ======================================================================= 8
= การทดสอบและคุณภาพ

== ผลการรันทดสอบอัตโนมัติ

รันจริงเมื่อ 11 ต.ค. 2569 ด้วย `pnpm -r test` และ `pytest` (ไม่ได้รัน pgTAP ในรอบนี้):

#tbl(columns: (24%, 18%, 18%, 40%), header: ("ชุดทดสอบ", "เครื่องมือ", "ผล", "ครอบคลุม"),
  [`packages/contracts`], [vitest], [5 ผ่าน (1 ไฟล์)], [zod schema, guid ของ demo field],
  [`packages/model`], [vitest], [37 ผ่าน (5 ไฟล์)], [water balance (รักษามวล), salinity ($f_"salt" (5) = 0.76$, LDD ว่าง → low), yield, GHG, runSeason/ensemble],
  [`apps/web`], [vitest], [165 ผ่าน + 1 skipped (16 ไฟล์)], [geometry (เรียงจุด, พื้นที่, validate), `/api/analyze`, auth/password/token, map style expressions, display],
  [`etl/tests`], [pytest], [21 ผ่าน], [สูตร grid id, แหล่งข้อมูล, pipeline (validate/swap/blocked) บน schema ทดสอบชั่วคราว],
  [`supabase/tests`], [pgTAP], [ไม่ได้รันในรอบนี้ (5 ไฟล์, plan รวม 99 assertion)], [schema, RLS (ผู้ใช้ A ไม่เห็นแปลงผู้ใช้ B), `analyze_polygon`, raw data, email auth],
)

#callout(title: "หมายเหตุ pgTAP")[
  ตาม `etl/README.md` ชุด pgTAP ออกแบบให้ผ่านบน seed (`supabase db reset` + `supabase test db`) หลังโหลดข้อมูลจริงทั้งประเทศ เทสต์ที่อิง geometry seed อาจไม่ผ่านตามคาด จึงไม่ได้รันบน DB ปัจจุบัน (และรายงานนี้ห้าม reset DB)
]

== Playwright / การทดสอบหน้าจอ

SPEC §5.5 กำหนดให้ทดสอบหลาย viewport (360×800, 390×844, 768×1024, 1024×768, 1366×768, 1920×1080) ด้วย Playwright · *ใน repository ไม่พบ Playwright config หรือ test suite* ที่ commit ไว้ การตรวจด้วย Playwright ระหว่างพัฒนา (ถ้ามี) เป็นการตรวจแบบ manual ซึ่งรายงานนี้ไม่สามารถยืนยันผลได้

== เกณฑ์รับงาน Phase 1 ที่เกี่ยวข้อง (SPEC §12)

#tbl(columns: (58%, 42%), header: ("เกณฑ์", "หลักฐาน"),
  [ECe = 5 dS/m → f#sub[salt] = 0.76], [unit test ใน `packages/model` ผ่าน],
  [LDD ว่าง → `/api/analyze` ยังคืนครบ 4 ด้าน และ confidence ดิน/ความเค็ม "ต่ำ"], [โค้ด `baseEce` / `analyze_polygon` + test; ตัวอย่างจริงในหัวข้อ 4.9],
  [polygon นอกประเทศ → `OUTSIDE_THAILAND`], [pgTAP `analyze_polygon.test.sql` (ไม่ได้รันรอบนี้)],
  [ผู้ใช้ A มองไม่เห็นแปลงผู้ใช้ B], [pgTAP `rls_and_rpc.test.sql` (ไม่ได้รันรอบนี้)],
  [`/api/analyze` < 1.5 s (p95)], [ยังไม่มีผลวัด performance ใน repo],
  [ETL idempotent / ไม่เปลี่ยนต้นทาง = `skipped` / ข้อมูลเสียหยุดก่อน swap], [pytest pipeline + ingest jobs จริง (skipped 2, blocked 2)],
)

// ======================================================================= 9
= ข้อจำกัดและงานต่อไป

== ข้อจำกัดที่ทราบ

#tbl(columns: (5%, 30%, 65%), header: ("#", "ข้อจำกัด", "รายละเอียด / ผลกระทบ"),
  [1], [ผลผลิตนาชลประทาน P10 = P90], [เมื่อแปลงเข้าถึงชลประทาน น้ำไม่ขาด ($f_"water"$ = 1) และ ECe แทบไม่เปลี่ยนข้ามปี → ผลผลิตทุกปีเท่ากัน ช่วง P10–P90 ยุบเป็นค่าเดียว (ยังไม่มีผลของอุณหภูมิ/รังสีต่อผลผลิต)],
  [2], [ECe เกือบคงที่นอกมหาสารคาม], [ไม่มี SI และ clay ในกริด + ความลึกน้ำบาดาล null (= 5 m) → ECe ≈ 0.8 dS/m (หรือ 1.8 บน KTms) ทุกแปลง จนกว่าจะทำกริด SoilGrids/DEM/Sentinel-2 ทั้งประเทศ],
  [3], [ข้อมูลมหาสารคามเป็น seed], [กริดและอากาศของจังหวัดนำร่องเป็นค่าสังเคราะห์ (หัวข้อ 5.3)],
  [4], [LDD placeholder], [ไม่มีชุดดิน/ดินเค็ม → confidence ดิน/ความเค็มเป็น low ทุกแปลง],
  [5], [DGR ไม่มี EC/ความลึกจริง และขาด 15 จังหวัด], [EC ประมาณจาก TDS/640, ความลึก default 5 m → capillary rise = 0 ทุกแปลง],
  [6], [อากาศ NASA POWER หยาบ], [≈0.5° × 0.625° (≈ 50–70 km) จุดที่ติดกันอาจได้ค่าเดียวกัน · ERA5-Land bulk ยังไม่ทำ],
  [7], [ไม่มีพยากรณ์อนาคตจริง], [ช่วง P10–P90 มาจากอากาศย้อนหลัง · CMIP6 / twin / EnKF / DSSAT อยู่ใน Phase 2],
  [8], [ค่าคงที่ ASSUMPTION จำนวนมาก], [ผลผลิตศักย์และความทนเค็มต่อพันธุ์, ปัจจัยเค็ม SI/น้ำบาดาล/KTms/ชายฝั่ง, LE, F0, การกระจายฟาง ฯลฯ ต้องให้ผู้เชี่ยวชาญตรวจ],
  [9], [ระบบบัญชีผู้ใช้], [ไม่มียืนยันอีเมล ลืม/รีเซ็ต/เปลี่ยนรหัสผ่าน · ไม่มี IP rate limit · บัญชีอีเมลและ Google ที่อีเมลเดียวกันเป็นคนละบัญชี],
  [10], [ขนาดฐานข้อมูล], [Supabase Free 500 MB ไม่พอสำหรับอากาศทั้งประเทศ 0.1° × 20 ปี (≈3.7 GB) · DB local ปัจจุบัน ≈810 MB (รวม staging ค้าง)],
  [11], [Cache ต่อ instance], [LRU in-memory ไม่แชร์ข้าม serverless instance (ควรย้ายไป KV)],
  [12], [License ภาพและข้อมูล], [Esri World Imagery ต้องตรวจ ToS ก่อนใช้เชิงพาณิชย์ · ThaiWater license ไม่ชัด · LDD = by request · ควรตรวจก่อนเปิดดาวน์โหลดสาธารณะบน production],
  [13], [ข้อมูลภาคสนามจากผู้ใช้], [`measuredEc*` / `lastYieldKgPerRai` ยังไม่ถูกบันทึกถาวรลง `app.field_observations` (D-019)],
  [14], [Playwright / performance], [ไม่มี test suite หน้าจอและผลวัด p95 ใน repo],
)

== งานต่อไป (เรียงตามความสำคัญต่องานวิจัย)

+ *ขอข้อมูล LDD* (ชุดดิน 1:25,000 + ดินเค็ม) และไฟล์ DGR 14 จังหวัด + เพชรบูรณ์ · หาแหล่งความลึกชั้นเกลือหินและระดับน้ำบาดาล
+ *แทนที่ seed มหาสารคามด้วยข้อมูลจริง*: รัน `soilgrids`, `cop_dem` และสร้าง Sentinel-2 SI / CHIRPS / ปฏิทินปลูก GISTDA ลงกริด แล้วขยายกริด 0.01° ทั้งประเทศ
+ *อากาศความละเอียดสูง*: ERA5-Land bulk 0.1° จาก S3 แทน NASA POWER และลบอากาศ seed
+ *Validate โมเดล*: เทียบ ECe/ผลผลิตกับค่าภาคสนาม 30–50 แปลง (มข./มมส.) และสถิติรายอำเภอ สศก. · ให้กรมการข้าวตรวจค่าคงที่ ASSUMPTION
+ *Phase 2 twin*: CMIP6 SSP2-4.5/5-8.5, worker Python (pyfao56, DSSAT CERES-Rice), ส่งต่อเกลือข้ามปี, EnKF, หน้าเปรียบเทียบ scenario
+ *ความปลอดภัยก่อน production*: ยืนยันอีเมล/รีเซ็ตรหัสผ่าน, IP rate limit, Supabase Pro, ตรวจ license ภาพและข้อมูล
+ ระบุชื่องานวิจัยจริงแทน "xxx" ใน `apps/web/messages/th.json`

// ======================================================================= 10
= ภาคผนวก

== ก. URL แหล่งข้อมูล

#{
  set text(size: 8.6pt)
  tbl(columns: (24%, 76%), header: ("แหล่ง", "URL"),
    [DMR หน่วยหิน], [`https://gisportal.dmr.go.th/arcgis/rest/services/GEOL/ROCK_UNIT_250K/MapServer/0`],
    [LDD (ทดลองแล้ว)], [`https://dinonline.ldd.go.th/` · `https://agrimap-online.ldd.go.th`],
    [DGR น้ำบาดาล], [`https://dgr.gdcatalog.go.th/dataset/e1472db9-e7b9-442a-88a1-cb25fe813c70`],
    [GISTDA], [`https://gistdaportal.gistda.or.th/data/rest/services` (`L05_AdminBoundary`, `L09_rice`)],
    [HDX COD-AB], [`https://data.humdata.org/dataset/cod-ab-tha`],
    [NASA POWER], [`https://power.larc.nasa.gov/api/temporal/daily/point`],
    [ERA5-Land (Open-Meteo S3)], [`https://openmeteo.s3.amazonaws.com/?list-type=2&prefix=data/copernicus_era5_land/`],
    [Open-Meteo API], [`https://archive-api.open-meteo.com/v1/archive` · `https://api.open-meteo.com/v1/forecast`],
    [SoilGrids], [`https://files.isric.org/soilgrids/latest/data/` · REST `https://rest.isric.org/soilgrids/v2.0/properties/query`],
    [Copernicus DEM], [`https://copernicus-dem-30m.s3.amazonaws.com/`],
    [CHIRPS], [`https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_daily/tifs/p05/`],
    [JRC GSW], [`https://storage.googleapis.com/global-surface-water/downloads2021/`],
    [NEX-GDDP-CMIP6], [`https://nex-gddp-cmip6.s3.us-west-2.amazonaws.com/`],
    [ThaiWater], [`https://api-v3.thaiwater.net/api/v1/thaiwater30/public/`],
    [TMD], [`https://data.tmd.go.th/api/WeatherToday/V2/`],
  )
}

== ข. เอกสารอ้างอิงทางวิชาการที่ใช้ในโค้ด

- Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). _Crop evapotranspiration._ FAO Irrigation and Drainage Paper 56.
- Ayers, R.S., Westcot, D.W. (1985). _Water quality for agriculture._ FAO Irrigation and Drainage Paper 29 Rev.1.
- Maas, E.V., Hoffman, G.J. (1977). Crop salt tolerance — current assessment. _J. Irrig. Drain. Div. ASCE_ 103: 115–134.
- IPCC (2019). _2019 Refinement to the 2006 IPCC Guidelines for National GHG Inventories_, Vol. 4, Ch. 5 & 11.
- IPCC (2006). _Guidelines for National GHG Inventories_, Vol. 4, Ch. 2 & 11.
- IPCC (2021). _AR6 WG1_, Ch. 7, Table 7.15 (GWP100).
- Richards, L.A. (ed.) (1954). _Diagnosis and improvement of saline and alkali soils._ USDA Agriculture Handbook 60.
- Bouman, B.A.M. et al. (2007). Rice and water. _Advances in Agronomy_ 92.
- Dobermann, A., Fairhurst, T. (2000). _Rice: Nutrient Disorders & Nutrient Management._ IRRI.
- Yoshida, S. (1981). _Fundamentals of Rice Crop Science._ IRRI.
- Khan, N.M. et al. (2005). Salinity index $sqrt("Blue" times "Red")$ (อ้างใน `constants/salinity.ts`).
- Saxton, K.E., Rawls, W.J. (2006). Soil water characteristic estimates (ช่วง AWC) · Arunin (1984) ระดับดินเค็มอีสาน

== ค. อภิธานศัพท์

#tbl(columns: (22%, 78%), header: ("คำ", "ความหมาย"),
  [ECe], [ค่าการนำไฟฟ้าของสารละลายดินอิ่มตัว (dS/m) — ตัวชี้วัดความเค็มของดิน],
  [ET0 / ETc / ETa], [การคายระเหยน้ำอ้างอิง / ของพืช (Kc × ET0) / ที่เกิดจริงเมื่อมีความเครียดน้ำ (Ks × ETc)],
  [Kc / Ks], [สัมประสิทธิ์พืช / สัมประสิทธิ์ความเครียดน้ำ (FAO-56)],
  [AWD], [Alternate Wetting and Drying — เปียกสลับแห้ง ลดการปล่อยมีเทน],
  [P10 / P50 / P90], [เปอร์เซ็นไทล์ที่ 10/50/90 ของผลข้ามปี (ช่วงความไม่แน่นอนจากอากาศ)],
  [KTms], [หมวดหินมหาสารคาม (Maha Sarakham Formation) มีชั้นเกลือหินใต้ที่ราบสูงโคราช],
  [SI], [Salinity Index จาก Sentinel-2 = $sqrt("Blue" times "Red")$],
  [TDS], [Total Dissolved Solids (mg/L) — ใช้ประมาณ EC = TDS/640],
  [GWP100 / CO#sub[2]e], [ศักยภาพทำให้โลกร้อนในกรอบ 100 ปี / ปริมาณเทียบเท่า CO#sub[2]],
  [SF#sub[w], SF#sub[p], SF#sub[o], CFOA], [scaling factor ของ IPCC ตามระบอบน้ำ, น้ำก่อนปลูก, อินทรียวัตถุ / ตัวแปลงอินทรียวัตถุ],
  [RLS], [Row Level Security ของ Postgres — จำกัดแถวที่แต่ละผู้ใช้เห็น],
  [RPC / security definer], [ฟังก์ชันในฐานข้อมูลที่เรียกผ่าน API / รันด้วยสิทธิ์เจ้าของฟังก์ชัน],
  [PostgREST / MVT], [REST API อัตโนมัติของ Supabase / Mapbox Vector Tile],
  [ETL], [Extract–Transform–Load — กระบวนการดึง แปลง และโหลดข้อมูล],
  [COG], [Cloud-Optimized GeoTIFF — raster ที่อ่านเป็นช่วงได้ผ่าน HTTP],
  [JWT / scrypt], [JSON Web Token / ฟังก์ชัน hash รหัสผ่านที่ใช้หน่วยความจำสูง],
  [seed], [ข้อมูลสังเคราะห์สำหรับพัฒนา (`supabase/seed.sql`, D-005)],
)

== ง. สรุปบันทึกการตัดสินใจ (Decision log)

#{
  set text(size: 8.8pt)
  tbl(columns: (10%, 90%), header: ("รหัส", "สรุป"),
    [D-001], [ขอบเขตทั้งประเทศ เปิดใช้รายจังหวัดผ่าน `province_coverage` (เดิมเปิดเฉพาะ 44 — ถูกแทนด้วย D-029)],
    [D-002], [LDD เป็น placeholder: ตารางครบแต่ว่างได้, fallback SoilGrids + Sentinel-2 SI + DGR EC, confidence low],
    [D-003], [ชื่อ repo = `petchwork`],
    [D-004], [อากาศย้อนหลังใช้ ERA5-Land bulk ไม่ใช้ Open-Meteo API backfill],
    [D-005], [seed ข้อมูลพัฒนาเป็น polygon/กริด/อากาศสมมติในมหาสารคาม (`version = 'seed'`)],
    [D-006 – D-007], [OG image ใช้ IBM Plex Sans Thai · ตัวอย่างรายงานบน landing เป็น HTML mock ติดป้าย "ตัวอย่าง"],
    [D-008], [พฤติกรรมปักจุด: เรียง CCW, ย้อนกลับลบจุดล่าสุด, คำเตือนพื้นที่ต้องยืนยัน],
    [D-009], [โมเดล 0.1.0: W เป็น storage, ETa = Ks·ETc, ensemble `{quick, years}`, N#sub[2]O direct เท่านั้น, CO#sub[2] เผาฟางไม่นับ, ฟางเหลือ 50% · ค่า ASSUMPTION ต้องให้ผู้เชี่ยวชาญตรวจ],
    [D-010], [Contract v0.2: ค่าตั้งต้น rainfed, `river_ec_dry_dsm`, SI = sqrt(Blue×Red)],
    [D-011 – D-012], [Supabase local port 554xx · สูตร grid id จากพิกัด],
    [D-013], [`analyze_polygon` ถ่วงพื้นที่, cell ทับมากสุดสำหรับค่าหมวดหมู่, ปฏิเสธ > 50 km#super[2], `weather_series` เป็น jsonb ก้อนเดียว + Hargreaves],
    [D-014 – D-015], [MVT ผ่าน PostgREST media type · demo field, trigger เติม admin code + profile + stale],
    [D-016 – D-017], [`meta.data_sources` แยก ldd_soil/ldd_saline + tier manual · Contract v0.3],
    [D-018], [LayerToggle รุ่นแรก (deck.gl — ถูกแทนด้วย D-030)],
    [D-019 – D-021], [`/api/analyze` anon + LRU cache · Contract v0.4 · ResultPanel คำนวณฝั่ง client, P10–P90 จาก ensemble],
    [D-022 – D-025], [ETL runtime Python 3.12/uv · DGR ไม่มี EC/ความลึก → TDS/640 · swap/validate · migration ETL support + คิว `profile_refresh`],
    [D-026 – D-027], [ย้ายจาก Supabase Auth เป็น Auth.js + RLS bridge ด้วย JWT ที่ server mint · dev login bypass (non-production)],
    [D-028], [seed ขอบเขต 77 จังหวัดจริง (GISTDA simplify)],
    [D-029a], [พื้นที่คำนวณบน WGS84 ellipsoidal เท่ากับ PostGIS geography],
    [D-029], [เปิดใช้ทั้ง 77 จังหวัด · salinity_origin/พันธุ์ตั้งต้นรายภาค (ASSUMPTION) · `analyze_polygon` นอกกริดใช้จุดอากาศใกล้สุด ≤ 50 km · อากาศทั้งประเทศจาก NASA POWER · DGR ทั้งประเทศ],
    [D-030], [MapLibre + Esri World Imagery แทน Google Maps (ไม่มีค่าใช้จ่าย) · ข้อควรระวัง ToS],
    [D-031], [ลบ FAQ · หน้า `/data` ข้อมูลดิบสาธารณะ (allow-list 16 ตาราง, ไม่มีข้อมูลผู้ใช้, ไม่ส่ง geometry ดิบ)],
    [D-032], [อีเมล + รหัสผ่านเป็นวิธีหลัก (scrypt, lockout 5 ครั้ง/15 นาที, RPC service_role) · ยังไม่มียืนยันอีเมล/รีเซ็ต/rate limit],
    [D-033], [คอลัมน์อากาศเป็น `real` (float4) ลดขนาด ≈25% ให้พอดี Supabase Free 500 MB — *บันทึกไว้ในคอมเมนต์ migration `20261011000100_weather_real.sql` เท่านั้น ยังไม่มีใน `docs/DECISIONS.md`*],
  )
}
