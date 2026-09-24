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

ดูนิยามเต็มที่ [`prisma/schema.prisma`](prisma/schema.prisma) — ด้านล่างสรุปแต่ละตารางพร้อม field สำคัญที่เก็บจริง

### ผู้ใช้และคำขอเดินทาง

**`User`** — บัญชีผู้ใช้งาน
| field | เก็บอะไร |
|---|---|
| `username`, `passwordHash` | ชื่อผู้ใช้และรหัสผ่าน (hash ด้วย bcrypt) |
| `role` | บทบาท: `REQUESTER` / `APPROVER` / `FINANCE_OFFICER` / `ADMIN` |
| `titlePrefix`, `firstName`, `lastName`, `fullNameEn` | ชื่อ-นามสกุล ไทย/อังกฤษ สำหรับออกเอกสารราชการ |
| `gender`, `birthDate`, `maritalStatus` | ข้อมูลส่วนบุคคลตามแบบฟอร์มประวัติบุคลากร |
| `academicTitle1/2`, `militaryRank`, `otherPrefix`, `royalTitle` | คำนำหน้าทางวิชาการ/ยศ/ราชทินนาม (optional ทั้งหมด) |
| `agentContextSummary` | สรุปบริบทงานที่คุยกับ AI Agent ล่าสุด (ไม่เกิน 200 ตัวอักษร) ให้ AI จำบริบทได้แม้ history ฝั่ง client ถูกล้าง |
| `irrelevantUploadStreak/Total`, `pageLockedUntil`, `accountAiLocked` | ตัวนับ+สถานะล็อคการใช้ AI กรณีอัปโหลดเอกสารไม่เกี่ยวข้องซ้ำๆ |

**`UserBankAccount`** — บัญชีธนาคารของผู้ใช้ (มีได้หลายบัญชี, เลือก default ได้) สำหรับรับเงินยืมรองจ่าย (F12): `bankName`, `accountNumber`, `branch`, `isDefault`

**`TripPlan`** — หัวใจของระบบ คำขอเดินทาง 1 รายการ = 1 แถว
| field | เก็บอะไร |
|---|---|
| `tripType`, `reimbursementMode`, `insurancePlanTier` | ในประเทศ/ต่างประเทศ, รูปแบบเบิก (เหมาจ่าย/แยกรายการ), ระดับแผนประกัน |
| `projectName`, `location`, `hostOrganization` | ชื่องาน/สถานที่/หน่วยงานเจ้าภาพ |
| `startDate`, `endDate`, `conferenceStartDate/EndDate`, `hasPersonalLeave`, `leaveStartDate/EndDate` | ช่วงวันเดินทาง/วันประชุม/วันลาส่วนตัวแทรก |
| `country`, `countryGroup` (ต่างประเทศ) / `destinationProvince` (ในประเทศ) | ปลายทางและกลุ่มประเทศตามระเบียบ |
| `budgetCode`, `paymentMethod`, `estimatedBudget` | รหัสงบประมาณ, วิธีจ่าย, ยอดประมาณการ |
| `status` | สถานะขั้นตอน A1–A5 (ดูตาราง workflow ด้านบน) |
| `travelers`, `itemPaymentMethods`, `customBudgetItems`, `aiDetectedExpenses` (Json) | รายชื่อผู้เดินทาง, วิธีจ่ายรายรายการ, ค่าใช้จ่ายที่เพิ่มเอง/ที่ AI ตรวจพบจากเอกสาร |
| `flightOptions`, `selectedFlight`, `insuranceOptions`, `selectedInsurance` (Json) | ผลค้นหา + ตัวเลือกที่เลือกจากขั้นตอน A2 |
| `memo` (Json) | บันทึกข้อความที่ AI ร่างให้ในขั้นตอน A3 |
| `ePaymentData`, `receipts` (Json) | ข้อมูลเตรียม e-Payment (A4) และผลอ่านใบเสร็จ (A5) |

> field ย่อยหลายตัวเก็บเป็น `Json` เพราะยังไม่ต้อง query ข้ามทริป — ถ้าต้องทำรายงานรวมทั้งมหาวิทยาลัยในอนาคตค่อยแยกเป็นตารางจริง

**`Attachment`** — ไฟล์ต้นฉบับที่อัปโหลด (หนังสือเชิญ/บันทึกที่เซ็นแล้ว/ใบเสร็จ) เก็บไฟล์จริงเป็น `fileData` (Bytes/LONGBLOB) พร้อม `type`, `fileName`, `mimeType`, และ `ocrData` (Json ผลที่ Gemini สกัดได้ตอนอัปโหลด เป็น audit trail)

### E-Payment (ขั้นตอน F12)

**`EPaymentF12Request`** — แบบฟอร์มบันทึกยืมรองจ่าย 1 รายการต่อ 1 ทริป แบ่งเป็นกลุ่มฟิลด์ตามฟอร์มจริง: หัวเอกสาร (`deptCode`, `subject`, `authorizedPerson`, `borrowerName` ฯลฯ), งบประมาณ/บัญชี (`fiscalYear`, `fundCode`, `totalLoanAmount`, `returnDueDate` ฯลฯ), และการยืนยัน (`refundOverpaymentConsent`, `confirmedAt`)

**`EPaymentF12Channel`** — ช่องทางจ่ายเงินของ F12 (1 คำขอมีได้หลายช่องทาง): `channelType` (`TRANSFER`/`CREDIT_CARD`), `amount`, `sourceLabel` (อ้างอิงรายการต้นทางจาก A1) พร้อมฟิลด์เฉพาะแต่ละประเภท (เลขบัญชี/เลขบัตร)

### อัตราและระเบียบ (ใช้คำนวณสิทธิ์)

| ตาราง | เก็บอะไร |
|---|---|
| `PolicyRate` | อัตราเบิกต่างประเทศตาม `tier` (TIER1/TIER2) × `countryGroup` (1–5): เหมาจ่ายรวม, ค่าที่พักสูงสุด, เบี้ยเลี้ยงแยกรายการ |
| `GLCode` | รหัสบัญชีแยกประเภท (`code`, `name`) จับคู่ค่าใช้จ่ายกับระบบ e-Payment/SAP Fiori |
| `CountryGroup` | กลุ่มประเทศ (1–5), `travelBufferDays` (วันเดินทางล่วงหน้า/กลับหลังตามข้อ 49), ค่าตั๋วเครื่องบินประมาณการ, โซนประกัน, ข้อกำหนดวีซ่า+ค่าธรรมเนียมประมาณการ (186 ประเทศ) |
| `InsuranceZoneRate` | ตัวคูณราคาเบี้ยประกันตามโซนความเสี่ยง 1–4 |
| `InsuranceDurationTier` | ราคาฐานเบี้ยประกันตามช่วงจำนวนวันเดินทาง |
| `InsurancePlanTier` | ตัวคูณราคาตามระดับแผน (Economy/Standard/Premium) พร้อมคำอธิบายความคุ้มครอง |
| `DomesticLumpSumRate` | ข้อ 42: ค่าที่พัก+เบี้ยเลี้ยงเหมาจ่ายรวม (ในประเทศ) ตาม `DomesticTier` (4 ระดับ) |
| `DomesticAccommodationRate` | ข้อ 43(1): ค่าที่พักตามจริง แยกห้องเดี่ยว/ห้องคู่ (ในประเทศ) |
| `DomesticPerDiemRate` | ข้อ 43(2): เบี้ยเลี้ยงเหมาจ่ายกรณีแยกรายการ (ในประเทศ) ตาม `DomesticPerDiemTier` (2 ระดับ) |
| `FlightClassRule` | สิทธิ์ชั้นโดยสารเครื่องบินตามตำแหน่ง/ระยะทาง (ข้อ 44(4) ในประเทศ, ข้อ 48(2) ต่างประเทศ) — ใช้แสดงคำแนะนำเท่านั้น |
| `RegulationConstant` | ค่าคงที่รายตัวจากระเบียบที่ไม่ผูกกับ tier/กลุ่มประเทศ เช่น เพดานค่ารับรอง, อัตราชดเชยพาหนะส่วนตัว |
| `PublicHoliday` | วันหยุดราชการไทย ใช้คำนวณว่าวันเดินทางเกินสิทธิ์ต้องยื่นลาเพิ่มไหม |

### ระบบและแอดมิน

| ตาราง | เก็บอะไร |
|---|---|
| `SystemSetting` | ค่าตั้งค่าที่ admin ปรับได้: เกณฑ์ล็อคหน้าอัปโหลด/ล็อคบัญชี AI, quota แชทต่อเดือน |
| `AiModelSetting` | โมเดล Gemini ที่ใช้งานจริง แยก 2 key: `agent` (agent หลัก/Agent 1-5 ทั้งหมด) กับ `intentClassifier` (semantic router เช็ค on-topic ก่อนเข้า agent หลัก) |
| `GuideQuestion` | คำถามแนะนำที่แสดงในหน้าเริ่มต้นของ chatbot พร้อมลำดับการแสดงผล |
| `ChatUsageMonthly` | ตัวนับจำนวนครั้งที่แต่ละ user เรียก AI Agent chat ต่อเดือน (`userId` + `yearMonth`) ใช้เช็ค quota — รีเซ็ตอัตโนมัติทุกเดือน |
| `RegulationDocumentChunk` | เอกสารระเบียบต้นฉบับตัดเป็นชิ้น + embedding vector สำหรับ RAG ของ chatbot (เตรียมไว้ ยังไม่มีข้อมูลจนกว่าจะ ingest เอกสารจริง) |

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
