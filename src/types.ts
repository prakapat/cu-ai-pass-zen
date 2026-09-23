/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Traveler {
  name: string;
  position?: string; // ตำแหน่ง
  positionLevel?: string; // ระดับตำแหน่ง (P1-P9, -)
  rank: 'Executive' | 'Senior Staff' | 'Staff' | string;
  perDiemRate: number; // เบี้ยเลี้ยงต่อวัน
  maxAccommodationRate: number; // ที่พักสูงสุดต่อคืน
  days: number;
}

export const POSITION_OPTIONS = [
  'นายกสภา',
  'กรรมการสภา',
  'อธิการบดี',
  'รองอธิการบดี',
  'หัวหน้าส่วนงาน (ระหว่างรักษาการ)',
  'ศาสตราจารย์',
  'รองศาสตราจารย์',
  'ผู้ช่วยศาสตราจารย์',
  'พนักงานมหาวิทยาลัย',
  'อาจารย์',
  'อื่นๆ'
] as const;

export const POSITION_LEVEL_OPTIONS = [
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
  'P6',
  'P7',
  'P8',
  'P9',
  '-'
] as const;

export function getRankFromPositionAndLevel(position?: string, level?: string): 'Executive' | 'Senior Staff' | 'Staff' {
  if (!position) return 'Staff';
  if (['นายกสภา', 'กรรมการสภา', 'อธิการบดี', 'รองอธิการบดี', 'หัวหน้าส่วนงาน (ระหว่างรักษาการ)', 'ศาสตราจารย์'].includes(position) || level === 'P8' || level === 'P9') {
    return 'Executive';
  }
  if (['รองศาสตราจารย์', 'ผู้ช่วยศาสตราจารย์'].includes(position) || ['P3', 'P4', 'P5', 'P6', 'P7'].includes(level || '')) {
    return 'Senior Staff';
  }
  return 'Staff';
}

// ระดับตำแหน่งตามข้อ 46-47 ของประกาศจุฬาฯ พ.ศ. 2563 จริง (ใช้คำนวณเบี้ยเลี้ยง/ที่พักจาก PolicyRate ใน DB)
// ต่างจาก getRankFromPositionAndLevel() ด้านบนซึ่งเป็น rank 3 ระดับสำหรับแสดงผล/ร่างเอกสารเท่านั้น ไม่ใช่ตัวคำนวณเงินจริง
// TIER1 = นายกสภา/กรรมการสภา/อธิการบดี/รองอธิการบดี/ศาสตราจารย์/รองศาสตราจารย์/P1-P3
// TIER2 = ผู้ช่วยศาสตราจารย์/อาจารย์/P4-P9 (และ fallback เริ่มต้นสำหรับตำแหน่งที่ไม่เข้าเกณฑ์ชัดเจน เช่น "พนักงานมหาวิทยาลัย"/"อื่นๆ" โดยไม่มีระดับ P ระบุ)
export function getRegulationTier(position?: string, level?: string): 'TIER1' | 'TIER2' {
  const tier1Positions = ['นายกสภา', 'กรรมการสภา', 'อธิการบดี', 'รองอธิการบดี', 'หัวหน้าส่วนงาน (ระหว่างรักษาการ)', 'ศาสตราจารย์', 'รองศาสตราจารย์'];
  const tier2Positions = ['ผู้ช่วยศาสตราจารย์', 'อาจารย์'];

  if (position && tier1Positions.includes(position)) return 'TIER1';
  if (position && tier2Positions.includes(position)) return 'TIER2';
  if (['P1', 'P2', 'P3'].includes(level || '')) return 'TIER1';
  if (['P4', 'P5', 'P6', 'P7', 'P8', 'P9'].includes(level || '')) return 'TIER2';
  return 'TIER2';
}

// ระดับตำแหน่งตามข้อ 42 และ 43(1) ของประกาศฯ (การเดินทางในประเทศ) — 4 ระดับ ต่างจาก getRegulationTier() (ต่างประเทศ, 2 ระดับ)
// TIER1 = นายกสภา/กรรมการสภา/อธิการบดี/รองอธิการบดี/ศาสตราจารย์
// TIER2 = รองศาสตราจารย์/ผู้ช่วยศาสตราจารย์/P1-P4
// TIER3 = อาจารย์/P5-P7
// TIER4 = กรณีอื่น (fallback)
export function getDomesticLumpSumTier(position?: string, level?: string): 'TIER1' | 'TIER2' | 'TIER3' | 'TIER4' {
  const tier1Positions = ['นายกสภา', 'กรรมการสภา', 'อธิการบดี', 'รองอธิการบดี', 'หัวหน้าส่วนงาน (ระหว่างรักษาการ)', 'ศาสตราจารย์'];
  const tier2Positions = ['รองศาสตราจารย์', 'ผู้ช่วยศาสตราจารย์'];
  const tier3Positions = ['อาจารย์'];

  if (position && tier1Positions.includes(position)) return 'TIER1';
  if (position && tier2Positions.includes(position)) return 'TIER2';
  if (position && tier3Positions.includes(position)) return 'TIER3';
  if (['P1', 'P2', 'P3', 'P4'].includes(level || '')) return 'TIER2';
  if (['P5', 'P6', 'P7'].includes(level || '')) return 'TIER3';
  return 'TIER4';
}

// ระดับตำแหน่งตามข้อ 43(2) ของประกาศฯ (เบี้ยเลี้ยงในประเทศแยกรายการ) — 2 ระดับ จัดกลุ่มต่างจาก getDomesticLumpSumTier() ข้างบน
// TIER_A ครอบคลุมแทบทุกตำแหน่งจนถึงอาจารย์/P1-P7, TIER_B คือกรณีอื่นเท่านั้น
export function getDomesticPerDiemTier(position?: string, level?: string): 'TIER_A' | 'TIER_B' {
  const tierAPositions = ['นายกสภา', 'กรรมการสภา', 'อธิการบดี', 'รองอธิการบดี', 'หัวหน้าส่วนงาน (ระหว่างรักษาการ)', 'ศาสตราจารย์', 'รองศาสตราจารย์', 'ผู้ช่วยศาสตราจารย์', 'อาจารย์'];
  if (position && tierAPositions.includes(position)) return 'TIER_A';
  if (['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].includes(level || '')) return 'TIER_A';
  return 'TIER_B';
}

export interface FlightOption {
  id: string;
  airline: string;
  pricePerPerson: number;
  departureTime: string;
  arrivalTime: string;
  baggageAllowance: string;
  totalPrice: number;
  bookingUrl?: string; // ลิงก์ไปหน้าเว็บสายการบินเพื่อจองต่อ — AI ประเมินราคา ไม่ใช่ลิงก์จองเที่ยวบิน/ราคานี้เจาะจง
}

export interface InsuranceOption {
  id: string;
  provider: string;
  planName: string;
  pricePerPerson: number;
  coverage: string;
  totalPrice: number;
  purchaseUrl?: string; // ลิงก์ไปหน้าเว็บบริษัทประกันเพื่อซื้อต่อ — AI ประเมินราคา ไม่ใช่ลิงก์ซื้อแผนนี้เจาะจง
}

export interface MemoDraft {
  // Header ของบันทึกข้อความราชการ — เดิม hardcode ในไฟล์ ตอนนี้เป็น input จริงทั้งหมด
  หน่วยงาน: string; // ส่วนงาน/หน่วยงานราชการผู้ออกบันทึก
  เลขที่หนังสือ: string; // "ที่" เลขสารบัญหนังสือ
  วันที่บันทึก: string; // "วันที่" ออกบันทึก — default วันนี้ แก้ไขได้
  เรียนถึง: string; // เช่น อธิการบดี
  ผ่าน: string; // เช่น คณบดีคณะวิทยาศาสตร์
  // รหัสงบประมาณ 4 ส่วนตามระบบบัญชีจริงของมหาวิทยาลัย (แทนช่องเดียวเดิม)
  รหัสกองทุน: string;
  รหัสศูนย์ต้นทุน: string;
  รหัสเขตตามหน้าที่: string;
  รหัสภาระผูกพัน: string;
  วัตถุประสงค์เพิ่มเติม: string;
  justificationText?: string; // ย่อหน้าเหตุผล/ความสำคัญที่ AI ร่างจากบริบททริปจริง (ไม่ใช่ทั้งเอกสาร)
  // เอกสารที่ 1: บันทึกขออนุมัติเดินทาง
  subject: string;
  contentHtml: string;
  // เอกสารที่ 2: บันทึกขออนุมัติค่าใช้จ่าย (แยกฉบับ — ดึงตัวเลขจาก trip.customBudgetItems ตรงๆ)
  expenseSubject: string;
  expenseContentHtml: string;
  emailSubject: string;
  emailBody: string;
  generatedDate: string;
  // Additional document requests — ไม่แยกเป็นบันทึกฉบับอื่นอีกต่อไป แค่แทรกข้อความ/ค่าใช้จ่ายเข้า 2 ฉบับหลัก
  requestPassport?: boolean;
  requestVisa?: boolean;
}

export const VISA_REQUIRED_COUNTRIES = [
  'สหรัฐอเมริกา',
  'อังกฤษ',
  'เยอรมนี',
  'ฝรั่งเศส',
  'ออสเตรเลีย',
  'จีน',
  'แคนาดา',
  'อินเดีย'
];

export interface EPaymentField {
  key: string;
  label: string;
  value: string;
  status: 'green' | 'yellow' | 'blue' | 'grey'; // green: auto, yellow: user input, blue: popup search, grey: attach later
  description: string;
}

export interface EPaymentData {
  formType: 'F8' | 'F12' | 'both';
  glCode: string;
  receivingMethod: string; // เช่น โอนเงินผ่านธนาคารกรุงไทย
  poCode: string;
  returnDate?: string; // สำหรับ F12 สัญญายืมเงิน
  fieldsF8: EPaymentField[];
  fieldsF12: EPaymentField[];
}

// แบบฟอร์ม F12 จริง (บันทึกยืมรองจ่าย) — ตรงกับตาราง EPaymentF12Request/EPaymentF12Channel ใน DB
// แยกจาก EPaymentData ข้างบน (ซึ่งเป็นแค่ตารางคู่มือ/export Excel เดิม) เพราะฟอร์มนี้กรอก+บันทึกลง DB จริงเป็นรายฟิลด์
export type F12ChannelType = 'TRANSFER' | 'CREDIT_CARD';

export interface F12Channel {
  id?: string;
  channelType: F12ChannelType;
  amount: number;
  sourceLabel?: string;
  // TRANSFER
  recipientName?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankBranch?: string;
  // CREDIT_CARD
  cardNumber?: string;
  cardHolderName?: string;
  cardValidFrom?: string;
  cardValidTo?: string;
  cardType?: string;
}

export interface F12Request {
  id?: string;
  tripId?: string;
  deptCode: string;
  deptName: string;
  subject: string;
  recipientTitle: string;
  authorizedPerson: string;
  description: string;
  borrowerName: string;
  borrowerPosition: string;
  fiscalYear: string;
  loanPurpose: string;
  fundCode: string;
  fundName: string;
  unitName: string;
  returnDueDate: string;
  totalLoanAmount: number;
  notes: string;
  refundOverpaymentConsent: boolean;
  confirmedAt?: string | null;
  channels: F12Channel[];
}

export interface ReceiptItem {
  description: string;
  amount: number;
  glCode: string;
  glName: string;
}

export interface Receipt {
  id: string;
  fileName: string;
  merchantName: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
  vat: number;
  total: number;
  currency: string;
  confidenceScore: number; // 0-100
  status: 'clear' | 'blurry';
}

export type TripStatus =
  | 'A1_DRAFT'                     // สร้างบันทึกข้อความ (กำลังทำ A1)
  | 'A2_SEARCHING'                 // ค้นหาตั๋ว/ประกัน (กำลังทำ A2)
  | 'A3_MEMO_DRAFTED'              // ได้รับการร่างบันทึก + อีเมลแล้ว (กำลังทำ A3)
  | 'A3_A4_WAITING_SIGNATURE'      // ส่งขออนุมัติ - รอลายเซ็นนอกระบบ
  | 'A4_EPAYMENT_PREP'             // เตรียมข้อมูล F8/F12 (กำลังทำ A4)
  | 'A4_EXPORTED'                  // ข้อมูลเข้าระบบ epayment สำเร็จ
  | 'FIORI_PENDING'                // รออนุมัติในระบบ fiori
  | 'WAITING_CASH_ADVANCE'         // รอรับเงินยืม (กรณี F12)
  | 'A5_UPLOADING_RECEIPTS'        // จบทริปแล้ว - อัปโหลดหลักฐานค่าใช้จ่าย (กำลังทำ A5)
  | 'TRIP_CLEARED';                // ข้อมูลเข้าระบบ epayment เสร็จสิ้นการเคลียร์เงินยืม

export interface BudgetItemPaymentMethods {
  flight: 'เงินสด' | 'บัตรเครดิต';
  accommodation: 'เงินสด' | 'บัตรเครดิต';
  perDiem: 'เงินสด' | 'บัตรเครดิต';
  insurance: 'เงินสด' | 'บัตรเครดิต';
  visa: 'เงินสด' | 'บัตรเครดิต';
  transport: 'เงินสด' | 'บัตรเครดิต';
}

export interface CustomBudgetItem {
  id: string;
  label: string;
  calc: string;
  amount: number;
  paymentMethod: 'เงินสด' | 'บัตรเครดิต';
  isAuto?: boolean;
}

export type TripType = 'DOMESTIC' | 'INTERNATIONAL';

// รูปแบบการเบิก: LUMP_SUM = เหมาจ่ายรวมที่พัก+เบี้ยเลี้ยง (ข้อ 42/46), ITEMIZED = แยกเบิกที่พักตามจริง+เบี้ยเลี้ยงเหมาจ่าย (ข้อ 43/47)
export type ReimbursementMode = 'LUMP_SUM' | 'ITEMIZED';

// ระดับแผนประกันเดินทางประมาณการ — ไม่ใช่ tier ตามระเบียบ เป็น rule ประมาณการเบี้ยประกัน
export type InsurancePlanTierKey = 'ECONOMY' | 'STANDARD' | 'PREMIUM';

export interface TripPlan {
  id: string;
  tripType: TripType;
  reimbursementMode: ReimbursementMode;
  insurancePlanTier?: InsurancePlanTierKey;
  projectName: string;
  conferenceStartDate?: string;
  conferenceEndDate?: string;
  startDate: string;
  endDate: string;
  hasPersonalLeave?: boolean;
  leaveStartDate?: string;
  leaveEndDate?: string;
  location: string;
  country?: string; // ต่างประเทศเท่านั้น
  countryGroup?: number; // ต่างประเทศเท่านั้น (1-5)
  destinationProvince?: string; // ในประเทศเท่านั้น
  hostOrganization: string;
  travelers: Traveler[];
  budgetCode: string;
  paymentMethod: 'credit' | 'cash' | 'advance';
  itemPaymentMethods?: BudgetItemPaymentMethods;
  customBudgetItems?: CustomBudgetItem[];
  aiDetectedExpenses?: { name: string; amount: number }[]; // ค่าใช้จ่ายเพิ่มเติม (เช่น ค่าลงทะเบียน) ที่ AI ตรวจพบจากเอกสารเชิญ — ใช้เติมสรุปงบประมาณครั้งแรกเท่านั้น
  estimatedBudget: number;
  originCity?: string; // "กรุงเทพฯ, ประเทศไทย" — cache จาก A2 กันเรียก AI ซ้ำ
  destinationCity?: string; // เมือง+ประเทศปลายทางที่ AI ระบุจาก location (A2) — ใช้แสดงผลแทนที่อยู่เต็ม
  flightOptions?: FlightOption[];
  selectedFlight?: FlightOption;
  insuranceOptions?: InsuranceOption[];
  selectedInsurance?: InsuranceOption;
  memo?: MemoDraft;
  ePaymentData?: EPaymentData;
  receipts?: Receipt[];
  status: TripStatus;
  isCancelled?: boolean;
  createdAt: string;
}

// -------------------------------------------------------------
// LOOKUPS & REGULATIONS
// -------------------------------------------------------------

export const COUNTRY_GROUPS: Record<string, { group: number; example: string }> = {
  // กลุ่ม 1: ค่าครองชีพสูง (ยุโรป, อเมริกาเหนือ, เอเชียตะวันออกบางประเทศ)
  'ญี่ปุ่น': { group: 1, example: 'Tokyo, Japan' },
  'สิงคโปร์': { group: 1, example: 'Singapore' },
  'สหรัฐอเมริกา': { group: 1, example: 'Washington D.C., USA' },
  'อังกฤษ': { group: 1, example: 'London, UK' },
  'เยอรมนี': { group: 1, example: 'Berlin, Germany' },
  'ฝรั่งเศส': { group: 1, example: 'Paris, France' },
  'สวิตเซอร์แลนด์': { group: 1, example: 'Zurich, Switzerland' },
  'อิตาลี': { group: 1, example: 'Rome, Italy' },
  'แคนาดา': { group: 1, example: 'Toronto, Canada' },
  'เนเธอร์แลนด์': { group: 1, example: 'Amsterdam, Netherlands' },
  'ออสเตรีย': { group: 1, example: 'Vienna, Austria' },
  'เบลเยียม': { group: 1, example: 'Brussels, Belgium' },
  'สวีเดน': { group: 1, example: 'Stockholm, Sweden' },
  'เดนมาร์ก': { group: 1, example: 'Copenhagen, Denmark' },
  'นอร์เวย์': { group: 1, example: 'Oslo, Norway' },
  'ฟินแลนด์': { group: 1, example: 'Helsinki, Finland' },
  'ฮ่องกง': { group: 1, example: 'Hong Kong' },
  'ไต้หวัน': { group: 1, example: 'Taipei, Taiwan' },
  'สหรัฐอาหรับเอมิเรตส์': { group: 1, example: 'Dubai, UAE' },

  // กลุ่ม 2: ค่าครองชีพปานกลาง
  'จีน': { group: 2, example: 'Beijing, China' },
  'เกาหลีใต้': { group: 2, example: 'Seoul, South Korea' },
  'ออสเตรเลีย': { group: 2, example: 'Sydney, Australia' },
  'นิวซีแลนด์': { group: 2, example: 'Auckland, New Zealand' },
  'อินเดีย': { group: 2, example: 'New Delhi, India' },
  'รัสเซีย': { group: 2, example: 'Moscow, Russia' },
  'สเปน': { group: 2, example: 'Madrid, Spain' },
  'โปรตุเกส': { group: 2, example: 'Lisbon, Portugal' },
  'กรีซ': { group: 2, example: 'Athens, Greece' },
  'ตุรกี': { group: 2, example: 'Istanbul, Turkey' },
  'ซาอุดีอาระเบีย': { group: 2, example: 'Riyadh, Saudi Arabia' },
  'กาตาร์': { group: 2, example: 'Doha, Qatar' },
  'แอฟริกาใต้': { group: 2, example: 'Johannesburg, South Africa' },
  'บราซิล': { group: 2, example: 'Sao Paulo, Brazil' },

  // กลุ่ม 3: อาเซียนและประเทศอื่นๆ
  'ลาว': { group: 3, example: 'Vientiane, Laos' },
  'พม่า': { group: 3, example: 'Yangon, Myanmar' },
  'กัมพูชา': { group: 3, example: 'Phnom Penh, Cambodia' },
  'เวียดนาม': { group: 3, example: 'Hanoi, Vietnam' },
  'มาเลเซีย': { group: 3, example: 'Kuala Lumpur, Malaysia' },
  'อินโดนีเซีย': { group: 3, example: 'Jakarta, Indonesia' },
  'ฟิลิปปินส์': { group: 3, example: 'Manila, Philippines' },
  'บรูไน': { group: 3, example: 'Bandar Seri Begawan, Brunei' },
  'ศรีลังกา': { group: 3, example: 'Colombo, Sri Lanka' },
  'เนปาล': { group: 3, example: 'Kathmandu, Nepal' },
  'บังกลาเทศ': { group: 3, example: 'Dhaka, Bangladesh' },
  'อียิปต์': { group: 3, example: 'Cairo, Egypt' },
};

// อัตราค่าใช้จ่ายตาม พ.ร.ฎ. การเดินทางไปราชการต่างประเทศ (กลุ่มประเทศ 1, 2, 3 และระดับตำแหน่ง)
export interface RegulationRate {
  perDiem: number;
  accommodationMax: number;
}

export const REGULATION_RATES: Record<string, Record<number, RegulationRate>> = {
  Executive: {
    1: { perDiem: 3100, accommodationMax: 14000 },
    2: { perDiem: 2800, accommodationMax: 10000 },
    3: { perDiem: 2100, accommodationMax: 7000 },
  },
  'Senior Staff': {
    1: { perDiem: 2500, accommodationMax: 11000 },
    2: { perDiem: 2200, accommodationMax: 9000 },
    3: { perDiem: 1800, accommodationMax: 6000 },
  },
  Staff: {
    1: { perDiem: 2100, accommodationMax: 10000 },
    2: { perDiem: 1800, accommodationMax: 8000 },
    3: { perDiem: 1500, accommodationMax: 5000 },
  },
};

// ข้อ 48(1) ของประกาศฯ พ.ศ. 2563: ค่าพาหนะเดินทางไป-กลับระหว่างที่อยู่/ที่พักกับสนามบิน
// เบิกจ่ายตามที่จ่ายจริง เที่ยวละไม่เกิน 500 บาท — ใช้เป็นฐานประมาณการรายการ "ค่าพาหนะ" ใน A1
// (คิด 2 เที่ยวต่อคนต่อทริป: ไปสนามบิน + กลับจากสนามบิน)
export const AIRPORT_TRANSFER_MAX_RATE = 500;
export const AIRPORT_TRANSFERS_PER_TRIP = 2;

export const GL_CODES = [
  { code: '5103010001', name: 'ค่าโดยสารเครื่องบินไปต่างประเทศ (Airfare)' },
  { code: '5103010002', name: 'ค่าที่พักในต่างประเทศ (Accommodation)' },
  { code: '5103010003', name: 'ค่าเบี้ยเลี้ยงเดินทางต่างประเทศ (Per Diem)' },
  { code: '5103010004', name: 'ค่าประกันภัยการเดินทาง (Travel Insurance)' },
  { code: '5103010005', name: 'ค่าธรรมเนียมหนังสือเดินทาง/วีซ่า (Passport/Visa Fee)' },
  { code: '5103010006', name: 'ค่าพาหนะรับจ้างต่างประเทศ (Local Transport)' },
  { code: '5103010007', name: 'ค่าธรรมเนียมเข้าฟัง/ลงทะเบียนสัมมนา (Registration Fee)' },
];
