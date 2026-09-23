/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SAMPLE_INVITATION_TEXT = `
TOKYO INSTITUTE OF AI TECHNOLOGY
Odaiba Center, Tokyo, Japan

Ref: TIAT-2026-INV-084
Date: June 15, 2026

Subject: Invitation to "The International Symposium on Advanced Artificial Intelligence 2026"

Dear Dr. Somชาย รักดี and Assistant Professor Dr. หญิง สุขดี,

On behalf of the Tokyo Institute of AI Technology, we are pleased to cordially invite you as honored delegates to attend and present your research at "The International Symposium on Advanced Artificial Intelligence 2026". The symposium will take place from August 10, 2026 to August 14, 2026 at the Odaiba Convention Center in Tokyo, Japan.

As representatives of your esteemed department, "คณะเทคโนโลยีสารสนเทศและนวัตกรรมดิจิทัล", your presentations on "Responsible Generative AI Workflows" will be highly valued by our global audience.

Please note that your institution will cover travel-related expenses, including round-trip airfare, accommodation, insurance, and per diem, in accordance with your official regulations. We will gladly facilitate your administrative visas and entry documentation.

We look with great anticipation to your participation.

Sincerely,

Prof. Akira Kenji
Symposium Chair, Tokyo Institute of AI Technology
`;

export const SAMPLE_SIGNED_MEMO_HTML = `
<div class="p-6 font-sans border border-slate-300 max-w-4xl mx-auto bg-white text-black leading-relaxed">
  <div class="text-center mb-6">
    <div class="text-2xl font-bold tracking-widest text-red-600 mb-1">【 ตราครุฑอนุมัติแล้ว 】</div>
    <h2 class="text-xl font-bold">บันทึกข้อความ</h2>
  </div>
  
  <table class="w-full mb-4 text-sm border-collapse">
    <tbody>
      <tr>
        <td class="w-1/2 py-1"><strong>ส่วนราชการ:</strong> คณะเทคโนโลยีสารสนเทศและนวัตกรรมดิจิทัล โทร. 02-123-4567</td>
        <td class="w-1/2 py-1"><strong>ที่:</strong> อว 8604 / ว 2045</td>
      </tr>
      <tr>
        <td class="py-1"><strong>วันที่:</strong> 2 กรกฎาคม 2026</td>
        <td class="py-1"><strong>เรื่อง:</strong> ขออนุมัติเดินทางไปราชการต่างประเทศและขออนุมัติค่าใช้จ่าย</td>
      </tr>
      <tr>
        <td colspan="2" class="py-1"><strong>เรียน:</strong> อธิการบดี (อนุมัติแล้วโดย คณบดีคณะเทคโนโลยีสารสนเทศฯ ปฏิบัติการแทน)</td>
      </tr>
    </tbody>
  </table>
  
  <hr class="border-t-2 border-black my-4" />
  
  <p class="indent-8 mb-4">
    ตามที่ คณะเทคโนโลยีสารสนเทศและนวัตกรรมดิจิทัล ได้เสนอขออนุมัติส่งบุคลากรจำนวน 2 ราย ได้แก่ <strong>ดร. สมชาย รักดี</strong> และ <strong>ผศ.ดร. หญิง สุขดี</strong> เดินทางไปเข้าร่วมและเสนอผลงานในงาน <strong>The International Symposium on Advanced Artificial Intelligence 2026</strong> ณ Odaiba Center, Tokyo ประเทศญี่ปุ่น ตั้งแต่วันที่ 10 สิงหาคม 2026 ถึง 14 สิงหาคม 2026 นั้น
  </p>
  
  <p class="indent-8 mb-4">
    บัดนี้ อธิการบดีได้พิจารณา <strong>"อนุมัติ"</strong> โครงการเดินทางดังกล่าว พร้อมอนุมัติวงเงินงบประมาณประมาณการรวมทั้งสิ้น <strong>185,200 บาท (หนึ่งแสนแปดหมื่นห้าพันสองร้อยบาทถ้วน)</strong> โดยเบิกจ่ายจากกองทุนพัฒนาบุคลากร รหัสงบประมาณ <strong>BG-6901-2026</strong> โดยมีรายละเอียดค่าใช้จ่ายควบคุมดังนี้:
  </p>
  
  <table class="w-full border-collapse border border-black mb-6 text-xs text-left">
    <thead>
      <tr class="bg-gray-100">
        <th class="border border-black p-2">รายการค่าใช้จ่ายควบคุม</th>
        <th class="border border-black p-2 text-right">วงเงินอนุมัติสูงสุด (บาท)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="border border-black p-2">1. ค่าตั๋วเครื่องบินไป-กลับ (เบิกจ่ายตามจริง)</td>
        <td class="border border-black p-2 text-right">48,000.00</td>
      </tr>
      <tr>
        <td class="border border-black p-2">2. ค่าที่พักในต่างประเทศ (เบิกจ่ายตามจริงไม่เกินอัตราควบคุม)</td>
        <td class="border border-black p-2 text-right">64,000.00</td>
      </tr>
      <tr>
        <td class="border border-black p-2">3. ค่าเบี้ยเลี้ยงเดินทางต่างประเทศ (Per Diem)</td>
        <td class="border border-black p-2 text-right">49,000.00</td>
      </tr>
      <tr>
        <td class="border border-black p-2">4. ค่าประกันภัยการเดินทาง (เบิกจ่ายตามจริง)</td>
        <td class="border border-black p-2 text-right">1,900.00</td>
      </tr>
      <tr>
        <td class="border border-black p-2">5. ค่าธรรมเนียมหนังสือเดินทางราชการและวีซ่า</td>
        <td class="border border-black p-2 text-right">3,000.00</td>
      </tr>
      <tr>
        <td class="border border-black p-2">6. ค่าพาหนะรับจ้างและค่าใช้จ่ายอื่นๆ</td>
        <td class="border border-black p-2 text-right">4,000.00</td>
      </tr>
      <tr class="font-bold bg-gray-50">
        <td class="border border-black p-2">ยอดรวมทั้งสิ้น</td>
        <td class="border border-black p-2 text-right">185,200.00</td>
      </tr>
    </tbody>
  </table>
  
  <div class="flex justify-end mt-10">
    <div class="text-center">
      <p class="mb-8"><strong>อนุมัติ</strong></p>
      <p class="mb-1">...................................................................</p>
      <p class="text-xs">(ศ.ดร. บัญชา มีชัย)</p>
      <p class="text-xs">รองอธิการบดี ปฏิบัติการแทนอธิการบดี</p>
      <p class="text-xs">ลงวันที่ 2 กรกฎาคม 2026</p>
    </div>
  </div>
</div>
`;

export const SAMPLE_RECEIPTS = [
  {
    id: "rec-hotel",
    fileName: "hilton_tokyo_receipt.png",
    merchantName: "HILTON TOKYO",
    date: "2026-08-14",
    currency: "JPY",
    subtotal: 210000,
    vat: 21000,
    total: 231000,
    confidenceScore: 97,
    status: "clear" as const,
    items: [
      {
        description: "Room accommodation (4 Nights - Dr. Somchai)",
        amount: 210000,
        glCode: "5103010002",
        glName: "ค่าที่พักในต่างประเทศ (Accommodation)"
      }
    ]
  },
  {
    id: "rec-flight",
    fileName: "thai_airways_ticket.png",
    merchantName: "THAI AIRWAYS INTERNATIONAL",
    date: "2026-08-02",
    currency: "THB",
    subtotal: 44860,
    vat: 3140,
    total: 48000,
    confidenceScore: 98,
    status: "clear" as const,
    items: [
      {
        description: "BKK-NRT Roundtrip Flight tickets (2 passengers)",
        amount: 48000,
        glCode: "5103010001",
        glName: "ค่าโดยสารเครื่องบินไปต่างประเทศ (Airfare)"
      }
    ]
  },
  {
    id: "rec-dinner",
    fileName: "shinjuku_restaurant.png",
    merchantName: "SHINJUKU SHABU SEN",
    date: "2026-08-12",
    currency: "JPY",
    subtotal: 12000,
    vat: 1200,
    total: 13200,
    confidenceScore: 74, // Low confidence to trigger user check (<80%)
    status: "clear" as const,
    items: [
      {
        description: "Official Academic Dinner Meeting",
        amount: 13200,
        glCode: "5103010003",
        glName: "ค่าเบี้ยเลี้ยงเดินทางต่างประเทศ (Per Diem)"
      }
    ]
  }
];
