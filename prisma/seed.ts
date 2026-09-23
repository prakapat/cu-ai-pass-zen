import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

// อัตราตามข้อ 46 (เหมาจ่ายรวม) และข้อ 47 (แยกรายการ) ของประกาศจุฬาฯ เรื่องเกณฑ์และอัตราการจ่ายเงินฯ พ.ศ. 2563
// TIER1 = นายกสภา/กรรมการสภา/อธิการบดี/รองอธิการบดี/หัวหน้าส่วนงาน(รักษาการ)/ศาสตราจารย์/รองศาสตราจารย์/P1-P3
// TIER2 = ผู้ช่วยศาสตราจารย์/อาจารย์/P4-P9
// perDiemItemized (ข้อ 47(2)) เป็นอัตราเดียวทุกกลุ่มประเทศ จึงซ้ำกันทั้ง 5 แถวต่อ tier
async function seedPolicyRates() {
  await prisma.policyRate.deleteMany();
  await prisma.policyRate.createMany({
    data: [
      // TIER1
      { tier: "TIER1", countryGroup: 1, perDiemLumpSum: 15100, accommodationMax: 14000, perDiemItemized: 3100 },
      { tier: "TIER1", countryGroup: 2, perDiemLumpSum: 13500, accommodationMax: 12500, perDiemItemized: 3100 },
      { tier: "TIER1", countryGroup: 3, perDiemLumpSum: 11100, accommodationMax: 10000, perDiemItemized: 3100 },
      { tier: "TIER1", countryGroup: 4, perDiemLumpSum: 9100, accommodationMax: 7000, perDiemItemized: 3100 },
      { tier: "TIER1", countryGroup: 5, perDiemLumpSum: 7100, accommodationMax: 4500, perDiemItemized: 3100 },
      // TIER2
      { tier: "TIER2", countryGroup: 1, perDiemLumpSum: 12600, accommodationMax: 10500, perDiemItemized: 2600 },
      { tier: "TIER2", countryGroup: 2, perDiemLumpSum: 11600, accommodationMax: 9500, perDiemItemized: 2600 },
      { tier: "TIER2", countryGroup: 3, perDiemLumpSum: 9600, accommodationMax: 7500, perDiemItemized: 2600 },
      { tier: "TIER2", countryGroup: 4, perDiemLumpSum: 7100, accommodationMax: 5000, perDiemItemized: 2600 },
      { tier: "TIER2", countryGroup: 5, perDiemLumpSum: 5100, accommodationMax: 3000, perDiemItemized: 2600 },
    ],
  });
  console.log("Seeded PolicyRate (10 rows: 2 tiers x 5 country groups).");
}

// ข้อ 42 ของประกาศฯ: ค่าที่พักเหมาจ่ายรวมกับเบี้ยเลี้ยงและค่าใช้จ่ายอื่น (การเดินทางในประเทศ) ต่อคน/วัน — 4 ระดับ
async function seedDomesticLumpSumRates() {
  await prisma.domesticLumpSumRate.deleteMany();
  await prisma.domesticLumpSumRate.createMany({
    data: [
      { tier: "TIER1", ratePerDay: 3500 },
      { tier: "TIER2", ratePerDay: 2700 },
      { tier: "TIER3", ratePerDay: 2200 },
      { tier: "TIER4", ratePerDay: 1700 },
    ],
  });
  console.log("Seeded DomesticLumpSumRate (4 rows, ข้อ 42).");
}

// ข้อ 43(1): ค่าที่พักตามที่จ่ายจริง (การเดินทางในประเทศ) แยกอัตราห้องเดี่ยว/ห้องคู่ — tier เดียวกับข้อ 42
async function seedDomesticAccommodationRates() {
  await prisma.domesticAccommodationRate.deleteMany();
  await prisma.domesticAccommodationRate.createMany({
    data: [
      { tier: "TIER1", singleRoomMax: 2700, twinRoomMax: 1600 },
      { tier: "TIER2", singleRoomMax: 2400, twinRoomMax: 1400 },
      { tier: "TIER3", singleRoomMax: 1700, twinRoomMax: 1050 },
      { tier: "TIER4", singleRoomMax: 1500, twinRoomMax: 950 },
    ],
  });
  console.log("Seeded DomesticAccommodationRate (4 rows, ข้อ 43(1)).");
}

// ข้อ 43(2): ค่าเบี้ยเลี้ยงและค่าใช้จ่ายอื่นเหมาจ่าย (การเดินทางในประเทศ กรณีแยกรายการ) — จัดกลุ่มตำแหน่งเพียง 2 ระดับ ต่างจากข้อ 42/43(1)
async function seedDomesticPerDiemRates() {
  await prisma.domesticPerDiemRate.deleteMany();
  await prisma.domesticPerDiemRate.createMany({
    data: [
      { tier: "TIER_A", ratePerDay: 800 },
      { tier: "TIER_B", ratePerDay: 600 },
    ],
  });
  console.log("Seeded DomesticPerDiemRate (2 rows, ข้อ 43(2)).");
}

// ข้อ 44(4) [ในประเทศ] และข้อ 48(2) [ต่างประเทศ]: สิทธิ์ชั้นโดยสารเครื่องบินตามตำแหน่ง — แสดงคำแนะนำเท่านั้น ไม่มีผลต่อยอดเงิน
async function seedFlightClassRules() {
  await prisma.flightClassRule.deleteMany();
  await prisma.flightClassRule.createMany({
    data: [
      // ข้อ 44(4) ในประเทศ
      {
        scope: "DOMESTIC",
        positionLabel: "นายกสภามหาวิทยาลัย/กรรมการสภามหาวิทยาลัย/อธิการบดี/รองอธิการบดี/หัวหน้าส่วนงาน(รักษาการ)/ศาสตราจารย์",
        maxClass: "ชั้นธุรกิจ",
        sortOrder: 1,
      },
      {
        scope: "DOMESTIC",
        positionLabel: "รองศาสตราจารย์/ผู้ช่วยศาสตราจารย์/อาจารย์/พนักงานมหาวิทยาลัยระดับ P1-P7 หรือเทียบเท่า",
        maxClass: "ชั้นประหยัด",
        sortOrder: 2,
      },
      // ข้อ 48(2) ต่างประเทศ
      {
        scope: "INTERNATIONAL",
        positionLabel: "นายกสภามหาวิทยาลัย/อธิการบดี",
        maxClass: "ชั้นธุรกิจ",
        sortOrder: 1,
      },
      {
        scope: "INTERNATIONAL",
        positionLabel: "กรรมการสภามหาวิทยาลัย/รองอธิการบดี/หัวหน้าส่วนงาน(รักษาการ)/ศาสตราจารย์",
        maxClass: "ชั้นประหยัดพิเศษ (Premium Economy)",
        exceptionMaxClass: "ชั้นธุรกิจ",
        exceptionThresholdHours: 9,
        sortOrder: 2,
      },
      {
        scope: "INTERNATIONAL",
        positionLabel: "รองศาสตราจารย์/พนักงานมหาวิทยาลัยระดับ P1-P3 หรือเทียบเท่า",
        maxClass: "ชั้นประหยัด",
        exceptionMaxClass: "ชั้นประหยัดพิเศษ (Premium Economy)",
        exceptionThresholdHours: 9,
        sortOrder: 3,
      },
      {
        scope: "INTERNATIONAL",
        positionLabel: "กรณีอื่น",
        maxClass: "ชั้นประหยัด",
        sortOrder: 4,
      },
    ],
  });
  console.log("Seeded FlightClassRule (6 rows: 2 ในประเทศ ข้อ 44(4) + 4 ต่างประเทศ ข้อ 48(2)).");
}

// ค่าคงที่รายตัวจากระเบียบ ไม่ผูกกับ tier/กลุ่มประเทศ
async function seedRegulationConstants() {
  await prisma.regulationConstant.deleteMany();
  await prisma.regulationConstant.createMany({
    data: [
      { key: "REPRESENTATION_ALLOWANCE_MAX", value: 100000, description: "ข้อ 50: ค่ารับรองและของที่ระลึก สูงสุดต่อการเดินทางไปปฏิบัติงานต่างประเทศหนึ่งครั้ง" },
      { key: "DOMESTIC_CAR_RATE_PER_KM", value: 5, description: "ข้อ 44(3)(ก): ค่าชดเชยพาหนะส่วนตัว รถยนต์ ต่อกิโลเมตร (ในประเทศ)" },
      { key: "DOMESTIC_MOTORCYCLE_RATE_PER_KM", value: 2, description: "ข้อ 44(3)(ข): ค่าชดเชยพาหนะส่วนตัว รถจักรยานยนต์ ต่อกิโลเมตร (ในประเทศ)" },
      { key: "DOMESTIC_AIRPORT_TRANSFER_MAX", value: 500, description: "ข้อ 44(1): ค่าพาหนะไป-กลับที่พัก/สถานที่ปฏิบัติงานกับสถานียานพาหนะ ต่อเที่ยว (ในประเทศ)" },
      { key: "PASSPORT_FEE", value: 1000, description: "ค่าธรรมเนียมหนังสือเดินทางราชการ (เล่มปกติ อายุ 5 ปี ตามประกาศราคาจริงของกระทรวงการต่างประเทศ) — คงที่ทุกประเทศ ไม่ผูกกับ CountryGroup" },
    ],
  });
  console.log("Seeded RegulationConstant (5 rows).");
}

// วันหยุดราชการไทยแบบวันตายตัว (ไม่ผูกปฏิทินจันทรคติ) สำหรับปี 2568-2570 — ใช้เช็คตอน A1 auto-detect วันที่เกินสิทธิ์ข้อ 49
// **ข้อจำกัดที่ต้องทราบ:** ตารางนี้ไม่รวมวันหยุดจันทรคติ (มาฆบูชา/วิสาขบูชา/อาสาฬหบูชา/เข้าพรรษา) และวันหยุดชดเชย/วันหยุดพิเศษที่คณะรัฐมนตรีประกาศเพิ่มเป็นปีๆ
// เพราะไม่มีสูตรคำนวณที่แน่นอนล่วงหน้า ต้องเพิ่มแถวเหล่านี้เองทุกปีตามประกาศจริงของสำนักเลขาธิการคณะรัฐมนตรี
async function seedPublicHolidays() {
  const FIXED_HOLIDAYS: { month: number; day: number; description: string }[] = [
    { month: 1, day: 1, description: "วันขึ้นปีใหม่" },
    { month: 4, day: 6, description: "วันจักรี" },
    { month: 4, day: 13, description: "วันสงกรานต์" },
    { month: 4, day: 14, description: "วันสงกรานต์" },
    { month: 4, day: 15, description: "วันสงกรานต์" },
    { month: 5, day: 4, description: "วันฉัตรมงคล" },
    { month: 7, day: 28, description: "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระวชิรเกล้าเจ้าอยู่หัว" },
    { month: 8, day: 12, description: "วันแม่แห่งชาติ" },
    { month: 10, day: 13, description: "วันนวมินทรมหาราช" },
    { month: 10, day: 23, description: "วันปิยมหาราช" },
    { month: 12, day: 5, description: "วันพ่อแห่งชาติ" },
    { month: 12, day: 10, description: "วันรัฐธรรมนูญ" },
    { month: 12, day: 31, description: "วันสิ้นปี" },
  ];
  const YEARS = [2025, 2026, 2027];

  await prisma.publicHoliday.deleteMany();
  await prisma.publicHoliday.createMany({
    data: YEARS.flatMap((year) =>
      FIXED_HOLIDAYS.map((h) => ({
        date: new Date(Date.UTC(year, h.month - 1, h.day)),
        description: h.description,
      }))
    ),
  });
  console.log(`Seeded PublicHoliday (${YEARS.length * FIXED_HOLIDAYS.length} rows: วันหยุดตายตัวปี ${YEARS.join(", ")} — ไม่รวมวันหยุดจันทรคติ/วันหยุดชดเชย).`);
}

// เบี้ยประกันเดินทางประมาณการ = ราคาฐานตามช่วงวัน (InsuranceDurationTier) x ตัวคูณโซนประเทศ (InsuranceZoneRate) x ตัวคูณแผน (InsurancePlanTier)
// ไม่ใช่อัตราตามระเบียบ เป็น rule ประมาณการที่ผู้ใช้ออกแบบเอง (2569-08-11) — ตัวเลขในช่วง multiplier ที่ผู้ใช้ให้มาเป็นช่วง (เช่น 1.2-1.4) เลือกจุดกึ่งกลางเป็นค่าเดี่ยว
async function seedInsuranceZoneRates() {
  await prisma.insuranceZoneRate.deleteMany();
  await prisma.insuranceZoneRate.createMany({
    data: [
      { zone: 1, label: "อาเซียน/เอเชียใกล้เคียง (ความเสี่ยงต่ำ-กลาง)", multiplier: 1.0 },
      { zone: 2, label: "เอเชียยอดนิยม/เอเชียใต้/เอเชียกลาง (ความเสี่ยงปานกลาง)", multiplier: 1.3 },
      { zone: 3, label: "ยุโรป/รัสเซีย/ตะวันออกกลาง/โอเชียเนีย (ความเสี่ยงสูง)", multiplier: 1.7 },
      { zone: 4, label: "อเมริกา/แอฟริกา/ทั่วโลก (ความเสี่ยงสูงสุด)", multiplier: 2.2 },
    ],
  });
  console.log("Seeded InsuranceZoneRate (4 zones).");
}

// ช่วงวัน 1-4/5-7/8-15/16-31 ตามที่ผู้ใช้กำหนด ฐานราคาปรับจากตัวเลขตั้งต้นของผู้ใช้ (200/300/500/800) แล้วสอบเทียบกับ
// ราคาจริงในตลาด (2569-08-11): ค้นราคาจริงจาก Tune Protect แผนรายเที่ยว (ตารางราคาที่เผยแพร่จริง โซนเอเชีย/ทั่วโลก) —
// 7วัน เอเชีย ฿274 / ทั่วโลก ฿339, 15วัน เอเชีย ฿382 / ทั่วโลก ฿488, 30วัน เอเชีย ฿534 / ทั่วโลก ฿666, 60วัน เอเชีย ฿1,007 / ทั่วโลก ฿1,197
// คำนวณย้อนกลับ (ราคาจริง ÷ ตัวคูณโซน ÷ ตัวคูณแผน) ภายใต้ 2 สมมติฐานแผน (Economy 0.8 กับ Standard 1.0 เทียบเท่าโซน 1) แล้วเฉลี่ย:
// 7วัน→~300 (ตรงกับเดิม ไม่ต้องแก้), 15วัน→~430 (เดิม 500 สูงไป), 30วัน→~600 (เดิม 800 สูงไป) — ปรับ tier 8-15 และ 16-31 ลง
// **สิ่งที่พบระหว่างสอบเทียบ ควรทราบ:** ราคาจริงของ Tune Protect ระหว่างโซนเอเชียกับทั่วโลกต่างกันแค่ ~1.2-1.3 เท่า
// ไม่ใช่ 2.0-2.5 เท่าตามตัวคูณโซน 4 ที่ user กำหนดไว้ก่อนหน้า (ยังไม่ได้แก้ตัวคูณโซน เพราะ user ระบุตัวเลขมาเองและรอบนี้ขอปรับเฉพาะราคาฐานตามช่วงวัน)
// ช่วง >31 วัน (แถวสุดท้าย maxDays=null) ยังเป็นข้อเสนอเพิ่มเติมของผมเอง (user ให้แนวคิดแต่ไม่ได้ให้ตัวเลข) — ปรับ increment เป็น 200/15วัน
// ให้ใกล้เคียงจุดข้อมูล 60 วันจริง (implied ~1,050-1,260) มากขึ้น
async function seedInsuranceDurationTiers() {
  await prisma.insuranceDurationTier.deleteMany();
  await prisma.insuranceDurationTier.createMany({
    data: [
      { minDays: 1, maxDays: 4, basePrice: 200, sortOrder: 1 },
      { minDays: 5, maxDays: 7, basePrice: 300, sortOrder: 2 },
      { minDays: 8, maxDays: 15, basePrice: 420, sortOrder: 3 },
      { minDays: 16, maxDays: 31, basePrice: 650, sortOrder: 4 },
      { minDays: 32, maxDays: null, basePrice: 650, extensionIncrementDays: 15, extensionIncrementAmount: 200, sortOrder: 5 },
    ],
  });
  console.log("Seeded InsuranceDurationTier (5 tiers, สอบเทียบกับราคาจริง Tune Protect 2569-08-11; tier 5 = ทริปยาวพิเศษ >31 วัน).");
}

async function seedInsurancePlanTiers() {
  await prisma.insurancePlanTier.deleteMany();
  await prisma.insurancePlanTier.createMany({
    data: [
      { tier: "ECONOMY", label: "Economy", multiplier: 0.8, coverageDescription: "วงเงินค่ารักษาพยาบาลหลักแสนบาท เน้นประหยัด เหมาะกับเอเชียใกล้ๆ", sortOrder: 1 },
      { tier: "STANDARD", label: "Standard", multiplier: 1.0, coverageDescription: "วงเงิน 1-1.5 ล้านบาท ผ่านเกณฑ์วีซ่าเชงเกนขั้นต่ำ", sortOrder: 2 },
      { tier: "PREMIUM", label: "Premium", multiplier: 1.5, coverageDescription: "วงเงิน 3-5 ล้านบาท คุ้มครองครอบคลุมทรัพย์สิน/ไฟลท์ดีเลย์", sortOrder: 3 },
    ],
  });
  console.log("Seeded InsurancePlanTier (3 tiers: Economy/Standard/Premium).");
}

async function seedGLCodes() {
  await prisma.gLCode.deleteMany();
  await prisma.gLCode.createMany({
    data: [
      { code: "5103010001", name: "ค่าโดยสารเครื่องบินไปต่างประเทศ (Airfare)" },
      { code: "5103010002", name: "ค่าที่พักในต่างประเทศ (Accommodation)" },
      { code: "5103010003", name: "ค่าเบี้ยเลี้ยงเดินทางต่างประเทศ (Per Diem)" },
      { code: "5103010004", name: "ค่าประกันภัยการเดินทาง (Travel Insurance)" },
      { code: "5103010005", name: "ค่าธรรมเนียมหนังสือเดินทาง/วีซ่า (Passport/Visa Fee)" },
      { code: "5103010006", name: "ค่าพาหนะรับจ้างต่างประเทศ (Local Transport)" },
      { code: "5103010007", name: "ค่าธรรมเนียมเข้าฟัง/ลงทะเบียนสัมมนา (Registration Fee)" },
    ],
  });
  console.log("Seeded GLCode (7 rows).");
}

// ตัดถอดจากบัญชีท้ายประกาศฯ (ข้อ 46/47) เฉพาะประเทศที่มีอยู่ใน dropdown ปัจจุบันของแอป
// กลุ่ม 1-2 อ่านจากตารางที่ชัดเจน มั่นใจสูง / กลุ่ม 3-4 เป็นรายชื่อยาวหนาแน่น ถอดจากภาพเอกสาร
// แนะนำให้ตรวจทานอีกครั้งกับต้นฉบับก่อนใช้งานจริงในระบบการเงิน โดยเฉพาะประเทศที่ไม่ได้ list ในนี้จะ default เป็นกลุ่ม 5 ตามระเบียบ
// ค่าตั๋วเครื่องบินไป-กลับประมาณการต่อคน (บาท) — ประมาณการตามภูมิภาค/ระยะทางจากกรุงเทพฯ อ้างอิงราคาตลาด economy round-trip
// จากการค้นหาราคาจริง ณ ส.ค. 2569 (เช่น กรุงเทพฯ-โตเกียว ~17-21k, กรุงเทพฯ-ลอนดอน ~35-53k, กรุงเทพฯ-นิวยอร์ก/LA ~30-55k,
// กรุงเทพฯ-ฮานอย/สิงคโปร์ ~5-8k, กรุงเทพฯ-ดูไบ/โดฮา ~16-17k, กรุงเทพฯ-ซิดนีย์ ~14-19k, กรุงเทพฯ-เดลี ~8-10k,
// กรุงเทพฯ-โจฮันเนสเบิร์ก ~20-38k, กรุงเทพฯ-เซาเปาโล/บัวโนสไอเรส ~38-73k, กรุงเทพฯ-มอสโก ~22-25k, กรุงเทพฯ-ไคโร ~15-16k,
// กรุงเทพฯ-เม็กซิโกซิตี ~44-46k) แล้วจัดกลุ่มประเทศที่เหลือตามภูมิภาคใกล้เคียง — เป็นค่าประมาณการอ้างอิง ไม่ใช่อัตราตามระเบียบ
// (ราคาจริงผันผวนรายวัน ผู้ใช้แก้ไขยอดในบรรทัดงบประมาณได้เองหลังคำนวณอัตโนมัติ)
// visaRequirement/estimatedVisaFee: สิทธิ์ยกเว้นวีซ่าสำหรับ "หนังสือเดินทางราชการไทย" โดยเฉพาะ (ไม่ใช่หนังสือเดินทางธรรมดา) —
// รวมจาก (1) ข้อตกลงยกเว้นวีซ่าทวิภาคีเฉพาะราชการ/ทูตของกระทรวงการต่างประเทศ และ (2) รายชื่อยกเว้นวีซ่ามาตรฐานของหนังสือเดินทางไทย
// (สอบทาน ส.ค. 2569) — ราชการมักได้สิทธิ์ไม่น้อยกว่าธรรมดา จึงรวม 2 แหล่งเป็น VISA_FREE เดียว เช่น จีน/รัสเซีย/เยอรมนี/อิตาลี
// ที่หนังสือเดินทางธรรมดาต้องขอวีซ่า แต่ราชการได้รับยกเว้นจากข้อตกลงทวิภาคี ค่าธรรมเนียมเป็นตัวแทนต่อประเภท (VISA_FREE=0,
// VISA_ON_ARRIVAL=1,200, E_VISA=1,800, EMBASSY_VISA=4,000) ไม่ใช่ราคาจริงรายประเทศ — ประเทศที่ไม่พบในแหล่งใดเลย default เป็น EMBASSY_VISA (สมมติฐานระมัดระวังไว้ก่อน)
async function seedCountryGroups() {
  await prisma.countryGroup.deleteMany();
  await prisma.countryGroup.createMany({
    data: [
      // กลุ่มที่ 1 (20 ประเทศ) — ถอดจากบัญชีท้ายประกาศฯ หน้า 22, ตรวจนับแล้วครบ 20 ตรงตามเอกสาร
      { country: "นอร์เวย์", group: 1, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "สวิตเซอร์แลนด์", group: 1, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "กาตาร์", group: 1, estimatedFlightCost: 17000, insuranceZone: 3, visaRequirement: "E_VISA", estimatedVisaFee: 1800 },
      { country: "สวีเดน", group: 1, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ลิกเตนสไตน์", group: 1, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ลักเซมเบิร์ก", group: 1, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เดนมาร์ก", group: 1, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "อันดอร์รา", group: 1, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "เบอร์มิวดา", group: 1, estimatedFlightCost: 42000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "บราซิล", group: 1, estimatedFlightCost: 58000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "แคนาดา", group: 1, estimatedFlightCost: 40000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ออสเตรเลีย", group: 1, estimatedFlightCost: 22000, insuranceZone: 3, visaRequirement: "E_VISA", estimatedVisaFee: 1800 },
      { country: "ออสเตรีย", group: 1, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เนเธอร์แลนด์", group: 1, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ไอซ์แลนด์", group: 1, estimatedFlightCost: 38000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "เบลเยียม", group: 1, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ไอร์แลนด์", group: 1, estimatedFlightCost: 36000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "เยอรมนี", group: 1, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ฟินแลนด์", group: 1, estimatedFlightCost: 33000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ฝรั่งเศส", group: 1, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      // กลุ่มที่ 2 (18 ประเทศ) — ครบ 18 ตรงตามเอกสาร
      { country: "อิตาลี", group: 2, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "สเปน", group: 2, estimatedFlightCost: 36000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "สิงคโปร์", group: 2, estimatedFlightCost: 8000, insuranceZone: 1, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "สหรัฐอเมริกา", group: 2, estimatedFlightCost: 40000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "โปรตุเกส", group: 2, estimatedFlightCost: 37000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "อิสราเอล", group: 2, estimatedFlightCost: 19000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เอสโตเนีย", group: 2, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "นิวซีแลนด์", group: 2, estimatedFlightCost: 25000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "กรีนแลนด์", group: 2, estimatedFlightCost: 40000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ซานมาริโน", group: 2, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "อาร์เจนตินา", group: 2, estimatedFlightCost: 60000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ญี่ปุ่น", group: 2, estimatedFlightCost: 18000, insuranceZone: 2, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เลบานอน", group: 2, estimatedFlightCost: 19000, insuranceZone: 3, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "อังกฤษ", group: 2, estimatedFlightCost: 35000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "บาฮามาส", group: 2, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "โคลอมเบีย", group: 2, estimatedFlightCost: 55000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เช็ก", group: 2, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "กายอานา", group: 2, estimatedFlightCost: 58000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      // กลุ่มที่ 3 (55 ประเทศ) — ครบ 55 ตรงตามเอกสาร
      { country: "บาร์เบโดส", group: 3, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "จอร์แดน", group: 3, estimatedFlightCost: 18000, insuranceZone: 3, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "ตรินิแดดและโตเบโก", group: 3, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ซีเรีย", group: 3, estimatedFlightCost: 19000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ฮังการี", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "โครเอเชีย", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ลัตเวีย", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "เกาหลีใต้", group: 3, estimatedFlightCost: 16000, insuranceZone: 2, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เบลารุส", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ชิลี", group: 3, estimatedFlightCost: 60000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "บัลแกเรีย", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "บรูไน", group: 3, estimatedFlightCost: 9000, insuranceZone: 1, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "สหรัฐอาหรับเอมิเรตส์", group: 3, estimatedFlightCost: 16000, insuranceZone: 3, visaRequirement: "E_VISA", estimatedVisaFee: 1800 },
      { country: "คูเวต", group: 3, estimatedFlightCost: 18000, insuranceZone: 3, visaRequirement: "E_VISA", estimatedVisaFee: 1800 },
      { country: "เซอร์เบีย", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เกรนาดา", group: 3, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ยูโกสลาเวีย", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "มาซิโดเนีย", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "เบลีซ", group: 3, estimatedFlightCost: 46000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "จาเมกา", group: 3, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ปาเลา", group: 3, estimatedFlightCost: 38000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "มัลดีฟส์", group: 3, estimatedFlightCost: 12000, insuranceZone: 2, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "บอสเนียและเฮอร์เซโกวีนา", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "คิริบาส", group: 3, estimatedFlightCost: 42000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "จอร์เจีย", group: 3, estimatedFlightCost: 20000, insuranceZone: 2, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ฮอนดูรัส", group: 3, estimatedFlightCost: 46000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ตุรกี", group: 3, estimatedFlightCost: 19000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "อาเซอร์ไบจาน", group: 3, estimatedFlightCost: 20000, insuranceZone: 2, visaRequirement: "E_VISA", estimatedVisaFee: 1800 },
      { country: "บาห์เรน", group: 3, estimatedFlightCost: 17000, insuranceZone: 3, visaRequirement: "E_VISA", estimatedVisaFee: 1800 },
      { country: "อุรุกวัย", group: 3, estimatedFlightCost: 58000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "สโลวีเนีย", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "เวเนซุเอลา", group: 3, estimatedFlightCost: 58000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "เฮติ", group: 3, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เปรู", group: 3, estimatedFlightCost: 58000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "อาร์เมเนีย", group: 3, estimatedFlightCost: 20000, insuranceZone: 2, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ไต้หวัน", group: 3, estimatedFlightCost: 14000, insuranceZone: 2, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "สโลวาเกีย", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "โบลิเวีย", group: 3, estimatedFlightCost: 60000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "โปแลนด์", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เซเชลส์", group: 3, estimatedFlightCost: 30000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "อิเควทอเรียลกินี", group: 3, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ลิทัวเนีย", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ฮ่องกง", group: 3, estimatedFlightCost: 12000, insuranceZone: 2, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "โอมาน", group: 3, estimatedFlightCost: 17000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "มอลโดวา", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ซาอุดีอาระเบีย", group: 3, estimatedFlightCost: 18000, insuranceZone: 3, visaRequirement: "E_VISA", estimatedVisaFee: 1800 },
      { country: "โรมาเนีย", group: 3, estimatedFlightCost: 30000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "บอตสวานา", group: 3, estimatedFlightCost: 33000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "มอริเชียส", group: 3, estimatedFlightCost: 30000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "มอลตา", group: 3, estimatedFlightCost: 36000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "รัสเซีย", group: 3, estimatedFlightCost: 25000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "แอฟริกาใต้", group: 3, estimatedFlightCost: 28000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เม็กซิโก", group: 3, estimatedFlightCost: 46000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ปานามา", group: 3, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "มาเก๊า", group: 3, estimatedFlightCost: 12000, insuranceZone: 2, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      // กลุ่มที่ 4 (93 ประเทศ) — ครบ 93 ตรงตามเอกสาร
      { country: "คอสตาริกา", group: 4, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "โดมินิกา", group: 4, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "กรีซ", group: 4, estimatedFlightCost: 32000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "คิวบา", group: 4, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ซูรินาเม", group: 4, estimatedFlightCost: 58000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "สาธารณรัฐโดมินิกัน", group: 4, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "อิหร่าน", group: 4, estimatedFlightCost: 18000, insuranceZone: 3, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "เอกวาดอร์", group: 4, estimatedFlightCost: 60000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เอลซัลวาดอร์", group: 4, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "แอนติกาและบาร์บูดา", group: 4, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "มาเลเซีย", group: 4, estimatedFlightCost: 7000, insuranceZone: 1, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ยูเครน", group: 4, estimatedFlightCost: 32000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เลโซโท", group: 4, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ปารากวัย", group: 4, estimatedFlightCost: 60000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "บูร์กินาฟาโซ", group: 4, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "รวันดา", group: 4, estimatedFlightCost: 32000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "ฟิลิปปินส์", group: 4, estimatedFlightCost: 8000, insuranceZone: 1, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "มาดากัสการ์", group: 4, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "กาบอง", group: 4, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "บุรุนดี", group: 4, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ลิเบีย", group: 4, estimatedFlightCost: 26000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "นิการากัว", group: 4, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "คาซัคสถาน", group: 4, estimatedFlightCost: 19000, insuranceZone: 2, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ซามัว", group: 4, estimatedFlightCost: 42000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "วานูอาตู", group: 4, estimatedFlightCost: 42000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "อิรัก", group: 4, estimatedFlightCost: 19000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ไซปรัส", group: 4, estimatedFlightCost: 32000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ฟิจิ", group: 4, estimatedFlightCost: 40000, insuranceZone: 3, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "อินโดนีเซีย", group: 4, estimatedFlightCost: 9000, insuranceZone: 1, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "จิบูตี", group: 4, estimatedFlightCost: 32000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "เยเมน", group: 4, estimatedFlightCost: 20000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "หมู่เกาะโซโลมอน", group: 4, estimatedFlightCost: 42000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ติมอร์-เลสเต", group: 4, estimatedFlightCost: 12000, insuranceZone: 1, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "หมู่เกาะมาร์แชลล์", group: 4, estimatedFlightCost: 45000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ปาปัวนิวกินี", group: 4, estimatedFlightCost: 38000, insuranceZone: 3, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "ตูนิเซีย", group: 4, estimatedFlightCost: 26000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "เอริเทรีย", group: 4, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "กินี-บิสเซา", group: 4, estimatedFlightCost: 36000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "กินี", group: 4, estimatedFlightCost: 36000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "แองโกลา", group: 4, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "เติร์กเมนิสถาน", group: 4, estimatedFlightCost: 20000, insuranceZone: 2, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "แอลจีเรีย", group: 4, estimatedFlightCost: 27000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "นามิเบีย", group: 4, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "อียิปต์", group: 4, estimatedFlightCost: 22000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "ตองกา", group: 4, estimatedFlightCost: 42000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ภูฏาน", group: 4, estimatedFlightCost: 13000, insuranceZone: 2, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ศรีลังกา", group: 4, estimatedFlightCost: 11000, insuranceZone: 2, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "กัวเตมาลา", group: 4, estimatedFlightCost: 48000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "จีน", group: 4, estimatedFlightCost: 10000, insuranceZone: 2, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "โมร็อกโก", group: 4, estimatedFlightCost: 28000, insuranceZone: 4, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "สวาซิแลนด์", group: 4, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "คองโก", group: 4, estimatedFlightCost: 35000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "เคปเวิร์ด", group: 4, estimatedFlightCost: 38000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "อุซเบกิสถาน", group: 4, estimatedFlightCost: 19000, insuranceZone: 2, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ปากีสถาน", group: 4, estimatedFlightCost: 14000, insuranceZone: 2, visaRequirement: "E_VISA", estimatedVisaFee: 1800 },
      { country: "เวียดนาม", group: 4, estimatedFlightCost: 6000, insuranceZone: 1, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "คีร์กีซสถาน", group: 4, estimatedFlightCost: 20000, insuranceZone: 2, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ทาจิกิสถาน", group: 4, estimatedFlightCost: 21000, insuranceZone: 2, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "กานา", group: 4, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ไนจีเรีย", group: 4, estimatedFlightCost: 33000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "แคเมอรูน", group: 4, estimatedFlightCost: 35000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ซูดาน", group: 4, estimatedFlightCost: 33000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "บังกลาเทศ", group: 4, estimatedFlightCost: 11000, insuranceZone: 2, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "ลาว", group: 4, estimatedFlightCost: 5000, insuranceZone: 1, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "มอริเตเนีย", group: 4, estimatedFlightCost: 36000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "แกมเบีย", group: 4, estimatedFlightCost: 36000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "เซเนกัล", group: 4, estimatedFlightCost: 35000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "กัมพูชา", group: 4, estimatedFlightCost: 5000, insuranceZone: 1, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ไอวอรีโคสต์", group: 4, estimatedFlightCost: 35000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "เซาตูเมและปรินซิปี", group: 4, estimatedFlightCost: 38000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "เนปาล", group: 4, estimatedFlightCost: 11000, insuranceZone: 2, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "ชาด", group: 4, estimatedFlightCost: 36000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "เคนยา", group: 4, estimatedFlightCost: 30000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "เบนิน", group: 4, estimatedFlightCost: 35000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "แซมเบีย", group: 4, estimatedFlightCost: 33000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "อัฟกานิสถาน", group: 4, estimatedFlightCost: 16000, insuranceZone: 2, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "แทนซาเนีย", group: 4, estimatedFlightCost: 32000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "ยูกันดา", group: 4, estimatedFlightCost: 33000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "มาลี", group: 4, estimatedFlightCost: 36000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "มองโกเลีย", group: 4, estimatedFlightCost: 17000, insuranceZone: 2, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
      { country: "คอโมโรส", group: 4, estimatedFlightCost: 36000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "เอธิโอเปีย", group: 4, estimatedFlightCost: 28000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "โมซัมบิก", group: 4, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "เซียร์ราลีโอน", group: 4, estimatedFlightCost: 37000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "โตโก", group: 4, estimatedFlightCost: 35000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "มาลาวี", group: 4, estimatedFlightCost: 34000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "สาธารณรัฐแอฟริกากลาง", group: 4, estimatedFlightCost: 37000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ไนเจอร์", group: 4, estimatedFlightCost: 36000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ไลบีเรีย", group: 4, estimatedFlightCost: 37000, insuranceZone: 4, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "ซิมบับเว", group: 4, estimatedFlightCost: 33000, insuranceZone: 4, visaRequirement: "VISA_ON_ARRIVAL", estimatedVisaFee: 1200 },
      { country: "แอลเบเนีย", group: 4, estimatedFlightCost: 31000, insuranceZone: 3, visaRequirement: "EMBASSY_VISA", estimatedVisaFee: 4000 },
      { country: "อินเดีย", group: 4, estimatedFlightCost: 10000, insuranceZone: 2, visaRequirement: "E_VISA", estimatedVisaFee: 1800 },
      { country: "พม่า", group: 4, estimatedFlightCost: 5000, insuranceZone: 1, visaRequirement: "VISA_FREE", estimatedVisaFee: 0 },
    ],
  });
  console.log("Seeded CountryGroup (186 rows: full annex, count-verified 20+18+55+93 against the document's own totals). Countries not listed default to group 5 per the regulation's own catch-all rule.");
}

// ข้อ 49: จำนวนวันเดินทางล่วงหน้า/กลับหลังตามทวีปปลายทาง — รันหลัง seedCountryGroups() เสมอ เพราะ deleteMany/createMany รีเซ็ต travelBufferDays กลับเป็น default (1) ทุกครั้ง
// หมายเหตุ (สมมติฐานที่ควรตรวจทานอีกครั้ง): ระเบียบฯ ข้อ 49 นิยามไว้แค่ 3 กลุ่ม (เอเชีย / ออสเตรเลีย-นิวซีแลนด์-ยุโรป-อเมริกาเหนือ / อเมริกาใต้-แอฟริกา)
// ไม่ได้ระบุกรณีประเทศแถบแคริบเบียน/อเมริกากลาง/หมู่เกาะแปซิฟิกไว้ชัดเจน — จัดกลุ่มนี้ไว้ในกลุ่ม 2 วัน (ใกล้เคียงอเมริกาเหนือ/ออสเตรเลีย-นิวซีแลนด์ทางภูมิศาสตร์มากที่สุด)
// รัสเซีย/จอร์เจีย/อาร์เมเนีย/อาเซอร์ไบจาน (ทวีปคาบเกี่ยวยุโรป-เอเชีย) จัดตามที่นิยมใช้ในระเบียบราชการไทยทั่วไป (รัสเซีย=ยุโรป, คอเคซัส 3 ประเทศ=เอเชีย)
async function seedTravelBufferDays() {
  const twoDayCountries = [
    // ยุโรป
    "นอร์เวย์", "สวิตเซอร์แลนด์", "สวีเดน", "ลิกเตนสไตน์", "ลักเซมเบิร์ก", "เดนมาร์ก", "อันดอร์รา",
    "ออสเตรีย", "เนเธอร์แลนด์", "ไอซ์แลนด์", "เบลเยียม", "ไอร์แลนด์", "เยอรมนี", "ฟินแลนด์", "ฝรั่งเศส",
    "อิตาลี", "สเปน", "โปรตุเกส", "เอสโตเนีย", "ซานมาริโน", "อังกฤษ", "เช็ก", "ฮังการี", "โครเอเชีย",
    "ลัตเวีย", "เบลารุส", "บัลแกเรีย", "เซอร์เบีย", "ยูโกสลาเวีย", "มาซิโดเนีย", "บอสเนียและเฮอร์เซโกวีนา",
    "สโลวีเนีย", "สโลวาเกีย", "โปแลนด์", "ลิทัวเนีย", "มอลโดวา", "โรมาเนีย", "มอลตา", "รัสเซีย", "กรีซ",
    "ยูเครน", "ไซปรัส", "แอลเบเนีย",
    // อเมริกาเหนือ (รวมแคริบเบียน/อเมริกากลาง)
    "แคนาดา", "เบอร์มิวดา", "สหรัฐอเมริกา", "บาฮามาส", "เม็กซิโก", "กรีนแลนด์", "เฮติ",
    "ตรินิแดดและโตเบโก", "บาร์เบโดส", "จาเมกา", "เกรนาดา", "แอนติกาและบาร์บูดา", "โดมินิกา",
    "สาธารณรัฐโดมินิกัน", "คิวบา", "ปานามา", "คอสตาริกา", "นิการากัว", "กัวเตมาลา", "เอลซัลวาดอร์",
    // ออสเตรเลีย/นิวซีแลนด์ (รวมหมู่เกาะแปซิฟิก)
    "ออสเตรเลีย", "นิวซีแลนด์", "คิริบาส", "ปาเลา", "ซามัว", "วานูอาตู", "ฟิจิ", "หมู่เกาะโซโลมอน",
    "หมู่เกาะมาร์แชลล์", "ปาปัวนิวกินี", "ตองกา",
  ];

  const threeDayCountries = [
    // อเมริกาใต้
    "บราซิล", "อาร์เจนตินา", "โคลอมเบีย", "กายอานา", "ชิลี", "อุรุกวัย", "เวเนซุเอลา", "เปรู",
    "โบลิเวีย", "ปารากวัย", "ซูรินาเม", "เอกวาดอร์",
    // แอฟริกา
    "แอฟริกาใต้", "บอตสวานา", "มอริเชียส", "เซเชลส์", "เลโซโท", "บูร์กินาฟาโซ", "รวันดา",
    "มาดากัสการ์", "กาบอง", "บุรุนดี", "ลิเบีย", "จิบูตี", "ตูนิเซีย", "เอริเทรีย", "กินี-บิสเซา",
    "กินี", "แองโกลา", "แอลจีเรีย", "นามิเบีย", "อียิปต์", "โมร็อกโก", "สวาซิแลนด์", "คองโก",
    "เคปเวิร์ด", "กานา", "ไนจีเรีย", "แคเมอรูน", "ซูดาน", "มอริเตเนีย", "แกมเบีย", "เซเนกัล",
    "ไอวอรีโคสต์", "เซาตูเมและปรินซิปี", "ชาด", "เคนยา", "เบนิน", "แซมเบีย", "แทนซาเนีย", "ยูกันดา",
    "มาลี", "คอโมโรส", "เอธิโอเปีย", "โมซัมบิก", "เซียร์ราลีโอน", "โตโก", "มาลาวี",
    "สาธารณรัฐแอฟริกากลาง", "ไนเจอร์", "ไลบีเรีย", "ซิมบับเว", "อิเควทอเรียลกินี",
  ];

  const twoDayResult = await prisma.countryGroup.updateMany({
    where: { country: { in: twoDayCountries } },
    data: { travelBufferDays: 2 },
  });
  const threeDayResult = await prisma.countryGroup.updateMany({
    where: { country: { in: threeDayCountries } },
    data: { travelBufferDays: 3 },
  });
  console.log(
    `Set travelBufferDays: ${twoDayResult.count} countries → 2 days (Europe/N.America/Aus-NZ), ${threeDayResult.count} countries → 3 days (S.America/Africa). Remainder default to 1 day (Asia/Middle East catch-all, ข้อ 49(ก)).`
  );
}

// รหัสผ่าน demo ทุกบัญชี มาจาก env var SEED_DEMO_PASSWORD (สำหรับ prototype เท่านั้น ไม่ใช่ค่าที่ใช้งานจริง)
async function seedUsers() {
  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (!demoPassword) {
    throw new Error("SEED_DEMO_PASSWORD environment variable is required to seed demo users.");
  }
  const passwordHash = await bcrypt.hash(demoPassword, 10);
  // ข้อมูลส่วนบุคคลด้านล่างเป็นข้อมูลจำลองสำหรับ testing เท่านั้น ไม่ใช่ข้อมูลบุคคลจริง
  const demoUsers = [
    {
      username: "requester1",
      titlePrefix: "นาย",
      firstName: "สมชาย",
      lastName: "รักดี",
      fullNameEn: "MR. SOMCHAI RUKDEE",
      gender: "MALE" as const,
      birthDate: new Date("1985-03-15"),
      maritalStatus: "MARRIED" as const,
      academicTitle1: null,
      academicTitle2: null,
      militaryRank: null,
      otherPrefix: null,
      royalTitle: null,
      role: "REQUESTER" as const,
    },
    {
      username: "approver1",
      titlePrefix: "นาง",
      firstName: "วิภา",
      lastName: "ตรวจสอบดี",
      fullNameEn: "MRS. WIPA TRUATSOBDEE",
      gender: "FEMALE" as const,
      birthDate: new Date("1978-07-22"),
      maritalStatus: "MARRIED" as const,
      academicTitle1: "ผศ.",
      academicTitle2: null,
      militaryRank: null,
      otherPrefix: null,
      royalTitle: null,
      role: "APPROVER" as const,
    },
    {
      username: "finance1",
      titlePrefix: "นางสาว",
      firstName: "การเงิน",
      lastName: "ใจดี",
      fullNameEn: "MS. KANNGERN JAIDEE",
      gender: "FEMALE" as const,
      birthDate: new Date("1992-11-02"),
      maritalStatus: "SINGLE" as const,
      academicTitle1: null,
      academicTitle2: null,
      militaryRank: null,
      otherPrefix: null,
      royalTitle: null,
      role: "FINANCE_OFFICER" as const,
    },
    {
      username: "admin1",
      titlePrefix: "นาย",
      firstName: "ผู้ดูแล",
      lastName: "ระบบ",
      fullNameEn: "MR. PHUDUAE RABOP",
      gender: "MALE" as const,
      birthDate: new Date("1988-05-05"),
      maritalStatus: "SINGLE" as const,
      academicTitle1: "ดร.",
      academicTitle2: null,
      militaryRank: null,
      otherPrefix: "ดร.",
      royalTitle: null,
      role: "ADMIN" as const,
    },
  ];

  const users: Record<string, string> = {};
  for (const u of demoUsers) {
    const created = await prisma.user.upsert({
      where: { username: u.username },
      update: { ...u, passwordHash: undefined },
      create: { ...u, passwordHash },
    });
    users[u.role] = created.id;
  }
  console.log("Seeded 4 demo users (requester1|approver1|finance1|admin1 — password from SEED_DEMO_PASSWORD).");
  return users;
}

async function seedDemoTrips(requesterUserId: string) {
  const existingCount = await prisma.tripPlan.count();
  if (existingCount > 0) {
    // ทริปที่ seed ไว้ก่อน User model จะมีอยู่ ให้ backfill requesterId ย้อนหลัง
    await prisma.tripPlan.updateMany({
      where: { requesterId: null },
      data: { requesterId: requesterUserId },
    });
    console.log(`Skipped demo trips — ${existingCount} TripPlan row(s) already exist (backfilled requesterId where missing).`);
    return;
  }

  await prisma.tripPlan.createMany({
    data: [
      {
        requesterId: requesterUserId,
        projectName: "The International Symposium on Advanced Artificial Intelligence 2026",
        startDate: "2026-08-10",
        endDate: "2026-08-14",
        location: "Odaiba Center, Tokyo",
        country: "ญี่ปุ่น",
        countryGroup: 1,
        hostOrganization: "Tokyo Institute of AI Technology",
        travelers: [
          { name: "ดร. สมชาย รักดี", rank: "Executive", perDiemRate: 3100, maxAccommodationRate: 14000, days: 5 },
          { name: "ผศ.ดร. หญิง สุขดี", rank: "Senior Staff", perDiemRate: 2500, maxAccommodationRate: 11000, days: 5 },
        ],
        budgetCode: "BG-6901-2026",
        paymentMethod: "advance",
        estimatedBudget: 185200,
        selectedFlight: {
          id: "flight-demo",
          airline: "Thai Airways (TG)",
          pricePerPerson: 24000,
          departureTime: "08:00",
          arrivalTime: "16:30",
          baggageAllowance: "30 kg",
          totalPrice: 48000,
        },
        selectedInsurance: {
          id: "ins-demo",
          provider: "MSIG Insurance",
          planName: "Travel Easy Plan A",
          pricePerPerson: 950,
          coverage: "คุ้มครองอุบัติเหตุและสุขภาพครบถ้วน",
          totalPrice: 1900,
        },
        status: "A5_UPLOADING_RECEIPTS",
      },
      {
        requesterId: requesterUserId,
        projectName: "ASEAN Digital Innovation Summit 2026",
        startDate: "2026-09-02",
        endDate: "2026-09-05",
        location: "National Convention Centre, Hanoi",
        country: "เวียดนาม",
        countryGroup: 3,
        hostOrganization: "ASEAN Digital Technology Association",
        travelers: [
          { name: "นายนพดล ขยันยิ่ง", rank: "Staff", perDiemRate: 1500, maxAccommodationRate: 5000, days: 4 },
        ],
        budgetCode: "BG-4402-2026",
        paymentMethod: "cash",
        estimatedBudget: 42000,
        status: "A1_DRAFT",
      },
    ],
  });

  console.log("Seeded 2 demo trips.");
}

async function seedSystemSettings() {
  await prisma.systemSetting.deleteMany();
  await prisma.systemSetting.createMany({
    data: [
      { key: "pageLockThreshold", value: 5, description: "จำนวนครั้งสูงสุดที่ส่งเอกสารไม่เกี่ยวข้องติดต่อกัน ก่อนล็อคหน้าอัปโหลดชั่วคราว" },
      { key: "pageLockDurationMinutes", value: 10, description: "ระยะเวลาล็อคหน้าอัปโหลด (นาที) เมื่อครบจำนวนครั้งที่กำหนด" },
      { key: "accountLockThreshold", value: 30, description: "จำนวนครั้งสะสมทั้งหมดที่ส่งเอกสารไม่เกี่ยวข้อง ก่อนล็อคฟีเจอร์ AI ทั้งหมดจนกว่า admin จะปลดล็อค" },
      { key: "monthlyChatLimit", value: 100, description: "จำนวนครั้งสูงสุดที่ใช้งานผู้ช่วย AI Agent (chat) ได้ต่อผู้ใช้หนึ่งคนต่อเดือน" },
    ],
  });
  console.log("Seeded SystemSetting (4 rows).");
}

async function seedGuideQuestions() {
  await prisma.guideQuestion.deleteMany();
  await prisma.guideQuestion.createMany({
    data: [
      { text: "เพดานที่พักกลุ่ม 2 ต่างประเทศเท่าไหร่", sortOrder: 1 },
      { text: "ช่วยหาคำขอเดินทางไปประเทศญี่ปุ่นทั้งหมด", sortOrder: 2 },
      { text: "ช่วยสร้างคำขอเดินทางใหม่", sortOrder: 3 },
    ],
  });
  console.log("Seeded GuideQuestion (3 rows).");
}

async function main() {
  await seedSystemSettings();
  await seedGuideQuestions();
  await seedPolicyRates();
  await seedDomesticLumpSumRates();
  await seedDomesticAccommodationRates();
  await seedDomesticPerDiemRates();
  await seedFlightClassRules();
  await seedRegulationConstants();
  await seedInsuranceZoneRates();
  await seedInsuranceDurationTiers();
  await seedInsurancePlanTiers();
  await seedGLCodes();
  await seedCountryGroups();
  await seedTravelBufferDays();
  await seedPublicHolidays();
  const users = await seedUsers();
  await seedDemoTrips(users.REQUESTER);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
