<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# CU-AI PASS

ระบบสนับสนุนการเดินทางไปราชการด้วย AI แบบครบวงจร ตั้งแต่อัปโหลดเอกสารต้นทาง (หนังสือเชิญ) วิเคราะห์สิทธิและคำนวณค่าใช้จ่ายตามระเบียบ ค้นหาเที่ยวบินที่เหมาะสม ร่างบันทึกข้อความอัตโนมัติ เตรียมข้อมูลสำหรับระบบ e-Payment และประมวลผลใบเสร็จเพื่อสรุปและเคลียร์ค่าใช้จ่ายหลังการเดินทาง

View the original app in AI Studio: https://ai.studio/apps/4d4db4ae-f0b3-490b-b788-1b192f8d7512

## เทคโนโลยีที่ใช้

- **Frontend**: React 19 + Vite + TailwindCSS
- **Backend**: Express (server.ts) รันบน Node 22
- **Database**: MySQL ผ่าน Prisma ORM
- **AI**: Google Gemini API (`@google/genai`) — ใช้ทั้งเป็น agent หลัก (มี tool calling), ตัวช่วยจำแนก intent ก่อนเข้าสู่ agent (semantic router), และวิเคราะห์เอกสาร/ใบเสร็จแบบ vision
- **Session**: `express-session` เก็บ session ไว้ใน MySQL เดียวกับข้อมูลแอป (ไม่ต้องมี infra แยก เช่น Redis)
- **Deploy**: Docker (ดู `Dockerfile`) — ทดสอบแล้วว่าใช้กับ [Railway](https://railway.com) ได้ดี (มี `railway.toml` ให้)

## Workflow หลัก (A1–A5)

คำขอเดินทางแต่ละรายการ (`TripPlan`) จะไหลผ่านสถานะเหล่านี้:

| ขั้นตอน | สถานะ (`TripStatus`) | รายละเอียด |
|---|---|---|
| A1 | `A1_DRAFT` | อัปโหลดหนังสือเชิญ ให้ AI อ่านและกรอกข้อมูลทริปเบื้องต้นให้ |
| A2 | `A2_SEARCHING` | ค้นหาเที่ยวบิน/ที่พักที่เหมาะสมกับระเบียบ |
| A3 | `A3_MEMO_DRAFTED` → `A3_A4_WAITING_SIGNATURE` | AI ร่างบันทึกข้อความขออนุมัติเดินทาง รอเซ็นอนุมัติ |
| A4 | `A4_EPAYMENT_PREP` → `A4_EXPORTED` → `FIORI_PENDING` → `WAITING_CASH_ADVANCE` | เตรียม/ส่งออกข้อมูลสำหรับระบบ e-Payment (F12) และรอเบิกเงินทดรองจ่าย |
| A5 | `A5_UPLOADING_RECEIPTS` → `TRIP_CLEARED` | อัปโหลดใบเสร็จหลังเดินทาง ให้ AI อ่านและสรุปยอด เคลียร์ค่าใช้จ่าย |

บทบาทผู้ใช้ (`UserRole`): **REQUESTER** (ผู้ขอเดินทาง), **APPROVER** (ผู้อนุมัติ), **FINANCE_OFFICER** (เจ้าหน้าที่การเงิน), **ADMIN** (ผู้ดูแลระบบ)

## โครงสร้างฐานข้อมูล (MySQL / Prisma)

ดูนิยามเต็มที่ [`prisma/schema.prisma`](prisma/schema.prisma) สรุปแยกตามกลุ่มได้ดังนี้:

**ผู้ใช้และคำขอเดินทาง**
- `User` — บัญชีผู้ใช้ (username, password hash, role, ข้อมูลส่วนตัวสำหรับออกเอกสารราชการ)
- `UserBankAccount` — เลขบัญชีธนาคารสำหรับโอนเงินเบิกจ่าย
- `TripPlan` — หัวใจของระบบ: คำขอเดินทางแต่ละรายการ (วันที่, ปลายทาง, งบประมาณ, ผู้เดินทาง, สถานะขั้นตอน A1–A5)
- `Attachment` — ไฟล์แนบของแต่ละทริป (หนังสือเชิญ, ใบเสร็จ, บันทึกข้อความ) พร้อมผลอ่านจาก AI (`ocrData`)

**E-Payment (ขั้นตอน F12)**
- `EPaymentF12Request` — คำขอเบิกจ่ายผ่านระบบ e-Payment
- `EPaymentF12Channel` — ช่องทาง/บัญชีปลายทางสำหรับจ่ายเงิน

**อัตราและระเบียบ (ใช้คำนวณสิทธิ)**
- `PolicyRate` — อัตราเบี้ยเลี้ยงตามตำแหน่ง/กลุ่มประเทศ
- `GLCode` — รหัสบัญชี GL สำหรับตัดงบประมาณ
- `CountryGroup` — จัดกลุ่มประเทศ (1–5) ตามระเบียบ รวม buffer วันเดินทางต่อกลุ่ม
- `InsuranceZoneRate`, `InsuranceDurationTier`, `InsurancePlanTier` — อัตราเบี้ยประกันเดินทางตามโซน/ระยะเวลา/แพ็กเกจ
- `DomesticLumpSumRate`, `DomesticAccommodationRate`, `DomesticPerDiemRate` — อัตราเบี้ยเลี้ยง/ที่พักในประเทศ
- `FlightClassRule` — กฎชั้นโดยสารเครื่องบินตามตำแหน่ง/ระยะทาง
- `RegulationConstant` — ค่าคงที่อื่น ๆ ตามระเบียบ
- `PublicHoliday` — วันหยุดราชการ (ใช้คำนวณวันทำงาน/buffer)

**ระบบและแอดมิน**
- `SystemSetting` — ค่าตั้งค่าระบบ (เกณฑ์ล็อคบัญชี, quota แชท AI ต่อเดือน ฯลฯ)
- `AiModelSetting` — โมเดล Gemini ที่ใช้งาน (agent หลัก vs. intent classifier ของ semantic router)
- `GuideQuestion` — คำถามแนะนำที่แสดงในหน้า AI chatbot
- `ChatUsageMonthly` — ตัวนับการใช้งานแชทต่อผู้ใช้ต่อเดือน (ใช้เช็ค quota)
- `RegulationDocumentChunk` — chunk ของเอกสารระเบียบที่แปลงเป็น embedding ไว้ให้ AI ค้นหาแบบ RAG

## Run Locally

**Prerequisites:** Node.js 22, MySQL

1. Install dependencies:
   `npm install`
2. คัดลอก `.env.example` เป็น `.env` แล้วตั้งค่า `GEMINI_API_KEY`, `DATABASE_URL`, และตัวแปรอื่นตามคอมเมนต์ในไฟล์
3. รัน migration และ seed ข้อมูลตัวอย่าง:
   `npx prisma migrate deploy && npx prisma db seed`
4. Run the app:
   `npm run dev`

หรือใช้ `docker-compose up` เพื่อรัน MySQL + Adminer สำหรับ local dev (ดู [`docker-compose.yml`](docker-compose.yml))

## Deploy

โปรเจกต์นี้ตั้งค่าให้ deploy บน [Railway](https://railway.com) ได้ทันที (Dockerfile + MySQL plugin) ดูตัวอย่างการตั้งค่า service ที่ [`railway.toml`](railway.toml)

**หมายเหตุสำคัญ**: ให้รัน database migration ผ่าน Railway's **Pre-Deploy Command** (`npx prisma migrate deploy`) ไม่ใช่ผูกไว้กับ start command หลัก (`npm run db:migrate && node dist/server.cjs`) — พบว่าการรัน `prisma migrate deploy`/`npm run` เป็นส่วนหนึ่งของ start command หลักบน Railway ทำให้ process ค้างไม่ยอม exit ต่อไปยัง `node dist/server.cjs` เลย ตั้ง Pre-Deploy Command แยกต่างหากแล้วปัญหานี้หายไป
