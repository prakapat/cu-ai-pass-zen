/**
 * Official Thai Memorandum Generator (บันทึกข้อความ)
 * สร้าง 2 เอกสาร: บันทึกขออนุมัติเดินทาง + บันทึกขออนุมัติค่าใช้จ่าย
 * โครงสร้างอ้างอิงจาก template ราชการจริง + ตัวอย่างที่ใช้งานจริงของมหาวิทยาลัย —
 * ไม่มีเนื้อหาเฉพาะแผนก/โครงการ hardcode อีกต่อไป ทุกอย่างมาจาก input จริงของ trip
 */

import { TripPlan, CustomBudgetItem } from '../types';
import { arabicToThaiBahtText } from './thaiBaht';

// ตราพระเกี้ยว จุฬาลงกรณ์มหาวิทยาลัย — เสิร์ฟจาก public/cu-emblem.png (ดู vite.config.ts, Vite เสิร์ฟไฟล์ใน public/ ที่ root path ตรงๆ)
const LOGO_IMG = `<img src="/cu-emblem.png" alt="ตราพระเกี้ยว จุฬาลงกรณ์มหาวิทยาลัย" style="width: 65px; height: auto; display: block;" />`;

const MEMO_STYLE = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
    .memo-header-title { font-size: 28px; font-weight: 700; color: #000000; letter-spacing: -0.5px; }
    .memo-label { font-weight: 700; color: #000000; }
    .memo-table-cell { padding: 4px 0; vertical-align: top; }
    .memo-indent { text-indent: 2.5em; margin-bottom: 14px; text-align: justify; }
    .memo-sig-box { display: inline-block; width: 280px; text-align: center; margin-top: 15px; font-size: 15px; }
  </style>
`;

// ทุกค่าที่มาจาก trip data (user กรอกเอง หรือ AI ดึงจากเอกสารที่อัปโหลด) ต้อง escape ก่อน interpolate เข้า HTML เสมอ
// เพราะ contentHtml/expenseContentHtml ถูก render ผ่าน dangerouslySetInnerHTML ใน A3DocumentDrafting.tsx
// ให้ผู้ใช้สิทธิ์อื่น (FINANCE_OFFICER/ADMIN) เห็นด้วย — ถ้าไม่ escape จะเป็นช่องโหว่ stored XSS ข้ามสิทธิ์
function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return escapeHtml(dateStr);
  }
}

// ต่อท้าย "ไปปฏิบัติงาน..." เฉพาะทริปต่างประเทศเท่านั้น — เดิม hardcode "ต่างประเทศ" ทุกที่ ทำให้ทริปในประเทศ (tripType DOMESTIC) มีเรื่อง/เนื้อหาบอกผิดว่าไปต่างประเทศ
function travelScopeText(tripPlan: TripPlan): string {
  return tripPlan.tripType === 'DOMESTIC' ? '' : 'ต่างประเทศ';
}

// สถานที่+ประเทศปลายทาง — ทริปต่างประเทศต่อท้าย "ประเทศ..."  ทริปในประเทศใช้ location เฉยๆ (มีชื่อจังหวัดอยู่ในนั้นแล้ว และ tripPlan.country เป็น undefined สำหรับทริปในประเทศ)
function locationPhrase(tripPlan: TripPlan): string {
  return tripPlan.tripType === 'DOMESTIC' ? tripPlan.location : `${tripPlan.location}, ประเทศ${tripPlan.country}`;
}

// ผู้ลงนามเสนอ — ใช้ผู้เดินทางคนแรกในรายชื่อเป็นค่าเริ่มต้น (โปรเจกต์นี้ยังไม่มีแนวคิด "ผู้ขออนุมัติ" แยกจากรายชื่อผู้เดินทาง)
function getSigner(tripPlan: TripPlan): { name: string; position: string } {
  const first = tripPlan.travelers?.[0];
  if (!first) return { name: '(ชื่อ-สกุลผู้ขออนุมัติ)', position: '' };
  const posStr = first.position ? `${first.position}${first.positionLevel && first.positionLevel !== '-' ? ' ' + first.positionLevel : ''}` : (first.rank || '');
  return { name: first.name || '(ชื่อ-สกุลผู้ขออนุมัติ)', position: posStr };
}

// ข้อความขอหนังสือนำ — ปรับตามที่ user ติ๊กพาสปอร์ต/วีซ่า (อ้างอิงถ้อยคำจริงจากเอกสารตัวอย่าง)
function buildPassportVisaSentence(requestPassport?: boolean, requestVisa?: boolean): string {
  if (!requestPassport && !requestVisa) return '';
  let action = '';
  if (requestPassport && requestVisa) {
    action = 'การออกหนังสือเดินทางราชการและขอรับการตรวจลงตรา (วีซ่า)';
  } else if (requestPassport) {
    action = 'การออกหนังสือเดินทางราชการ';
  } else {
    action = 'การขอรับการตรวจลงตรา (วีซ่า)';
  }
  return `<p class="memo-indent">และประสงค์จะขอให้มหาวิทยาลัยออกหนังสือนำไปยังกระทรวงการต่างประเทศ เพื่ออำนวยความสะดวกใน${action}ให้กับผู้เข้าร่วม</p>`;
}

// ช่วงลากิจ/ลาพักผ่อนก่อน-หลังการเดินทาง — ดึงจากข้อมูลที่ A1 เก็บไว้ (เดิม A3 ไม่เคยใช้เลย)
function buildPersonalLeaveHtml(tripPlan: TripPlan): string {
  if (!tripPlan.hasPersonalLeave) return '';
  const start = formatDate(tripPlan.leaveStartDate);
  const end = formatDate(tripPlan.leaveEndDate);
  return `
    <p class="memo-indent">
      อนึ่ง ผู้เดินทางมีการลากิจส่วนตัว/ลาพักผ่อน ก่อน/หลัง การไปปฏิบัติงานดังกล่าว โดยมีรายละเอียดดังนี้ ตั้งแต่วันที่ <strong>${start}</strong> ถึงวันที่ <strong>${end}</strong>
    </p>
  `;
}

function headerTableHtml(tripPlan: TripPlan, subject: string): string {
  const หน่วยงาน = escapeHtml(tripPlan.memo?.หน่วยงาน || '');
  const เลขที่หนังสือ = escapeHtml(tripPlan.memo?.เลขที่หนังสือ || '');
  const วันที่บันทึก = tripPlan.memo?.วันที่บันทึก ? formatDate(tripPlan.memo.วันที่บันทึก) : formatDate(new Date().toISOString());
  const recipient = escapeHtml(tripPlan.memo?.เรียนถึง || 'อธิการบดี');
  const via = escapeHtml(tripPlan.memo?.ผ่าน || '');
  subject = escapeHtml(subject);

  return `
    <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px;">
      <div style="width: 80px; shrink: 0;">${LOGO_IMG}</div>
      <div style="flex-grow: 1; text-align: center; padding-right: 80px;">
        <h1 class="memo-header-title" style="margin: 0; line-height: 1.2;">บันทึกข้อความ</h1>
      </div>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 16px;">
      <tr>
        <td colspan="2" class="memo-table-cell"><span class="memo-label">ส่วนงาน</span> ${หน่วยงาน}</td>
      </tr>
      <tr>
        <td style="width: 60%;" class="memo-table-cell"><span class="memo-label">ที่</span> ${เลขที่หนังสือ}</td>
        <td style="width: 40%;" class="memo-table-cell"><span class="memo-label">วันที่</span> ${วันที่บันทึก}</td>
      </tr>
      <tr>
        <td colspan="2" class="memo-table-cell"><span class="memo-label">เรื่อง</span> ${subject}</td>
      </tr>
      <tr>
        <td colspan="2" class="memo-table-cell"><span class="memo-label">เรียน</span> ${recipient}</td>
      </tr>
      ${via ? `<tr><td colspan="2" class="memo-table-cell"><span class="memo-label">ผ่าน</span> ${via}</td></tr>` : ''}
    </table>

    <hr style="border: 0; border-top: 2px solid #000000; margin-top: 4px; margin-bottom: 20px;">
  `;
}

function signatureBlockHtml(tripPlan: TripPlan): string {
  const signer = getSigner(tripPlan);
  return `
    <div style="text-align: right; margin-top: 40px; margin-bottom: 20px;">
      <div class="memo-sig-box">
        <div style="margin-bottom: 35px;">(ลงชื่อ)........................................................</div>
        <div style="font-weight: bold;">(${escapeHtml(signer.name)})</div>
        <div style="font-size: 14px; color: #475569;">${escapeHtml(signer.position)}</div>
      </div>
    </div>
  `;
}

// เอกสารที่ 1: บันทึกขออนุมัติเดินทางไปปฏิบัติงานต่างประเทศ (โครงสร้างตาม template ราชการ)
export function generateOfficialMemoHtml(tripPlan: TripPlan): string {
  const travelers = tripPlan.travelers || [];
  const travelerCount = travelers.length || 1;
  const subject = tripPlan.memo?.subject || `ขออนุมัติเดินทางไปปฏิบัติงาน${travelScopeText(tripPlan)} (${tripPlan.projectName})`;

  const startDateThai = formatDate(tripPlan.startDate);
  const endDateThai = formatDate(tripPlan.endDate);

  const justification = tripPlan.memo?.justificationText
    ? escapeHtml(tripPlan.memo.justificationText)
    : `ด้วย ${escapeHtml(tripPlan.memo?.หน่วยงาน || 'หน่วยงาน')} มีความประสงค์ขออนุมัติให้บุคลากรเดินทางไปปฏิบัติงาน${travelScopeText(tripPlan)} เพื่อเข้าร่วม ${escapeHtml(tripPlan.projectName)} ณ ${escapeHtml(locationPhrase(tripPlan))} อันจะเป็นประโยชน์ต่อการพัฒนาบุคลากรและการดำเนินภารกิจของหน่วยงานต่อไป`;

  const customPurpose = escapeHtml(tripPlan.memo?.วัตถุประสงค์เพิ่มเติม || '');

  return `
  <div style="font-family: 'Sarabun', 'TH Sarabun PSK', 'Angsana New', sans-serif; padding: 40px; border: 1px solid #cbd5e1; max-width: 820px; margin: 0 auto; background: #ffffff; color: #0f172a; line-height: 1.6; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    ${MEMO_STYLE}
    ${headerTableHtml(tripPlan, subject)}

    <p class="memo-indent">${justification}${customPurpose ? ` ${customPurpose}` : ''} โดยมีกำหนดการระหว่างวันที่ <strong>${startDateThai} - ${endDateThai}</strong> โดยมีผู้เข้าร่วมเดินทางจำนวน ${travelerCount} ราย ดังนี้</p>

    <div style="margin-left: 2.5em; margin-bottom: 20px;">
      ${travelers.map((t, idx) => {
        const posStr = escapeHtml(t.position ? `${t.position}${t.positionLevel && t.positionLevel !== '-' ? ' ' + t.positionLevel : ''}` : (t.rank || '-'));
        return `
          <div style="display: flex; justify-content: space-between; max-width: 620px; padding: 2px 0;">
            <span>${idx + 1}. ${escapeHtml(t.name)}</span>
            <span style="color: #334155; font-weight: 500;">${posStr}</span>
          </div>
        `;
      }).join('')}
    </div>

    ${buildPassportVisaSentence(tripPlan.memo?.requestPassport, tripPlan.memo?.requestVisa)}
    ${buildPersonalLeaveHtml(tripPlan)}

    <p class="memo-indent" style="margin-top: 25px; margin-bottom: 35px;">
      จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติและสั่งให้ไปปฏิบัติงาน${travelScopeText(tripPlan)}ด้วย จักขอบคุณยิ่ง
    </p>

    ${signatureBlockHtml(tripPlan)}
  </div>
  `;
}

// เอกสารที่ 2: บันทึกขออนุมัติค่าใช้จ่าย — ดึงรายการจาก trip.customBudgetItems ตรงๆ (ไม่คำนวณซ้ำ) ให้ตัวเลขตรงกับ A1/A2 เป๊ะ
export function generateExpenseMemoHtml(tripPlan: TripPlan): string {
  const travelerCount = tripPlan.travelers?.length || 1;
  const items: CustomBudgetItem[] = tripPlan.customBudgetItems || [];
  const grandTotal = tripPlan.estimatedBudget || items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const bahtText = arabicToThaiBahtText(grandTotal);

  const subject = tripPlan.memo?.expenseSubject || `ขออนุมัติค่าใช้จ่ายในการเดินทางไปปฏิบัติงาน${travelScopeText(tripPlan)} (${tripPlan.projectName})`;
  const startDateThai = formatDate(tripPlan.startDate);
  const endDateThai = formatDate(tripPlan.endDate);

  const รหัสกองทุน = escapeHtml(tripPlan.memo?.รหัสกองทุน || '-');
  const รหัสศูนย์ต้นทุน = escapeHtml(tripPlan.memo?.รหัสศูนย์ต้นทุน || '-');
  const รหัสเขตตามหน้าที่ = escapeHtml(tripPlan.memo?.รหัสเขตตามหน้าที่ || '-');
  const รหัสภาระผูกพัน = escapeHtml(tripPlan.memo?.รหัสภาระผูกพัน || '-');

  return `
  <div style="font-family: 'Sarabun', 'TH Sarabun PSK', 'Angsana New', sans-serif; padding: 40px; border: 1px solid #cbd5e1; max-width: 820px; margin: 0 auto; background: #ffffff; color: #0f172a; line-height: 1.6; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    ${MEMO_STYLE}
    ${headerTableHtml(tripPlan, subject)}

    <p class="memo-indent">
      ตามที่ได้รับอนุมัติให้เดินทางไปปฏิบัติงาน${travelScopeText(tripPlan)} ณ ${escapeHtml(locationPhrase(tripPlan))} ตามโครงการ <strong>${escapeHtml(tripPlan.projectName)}</strong> ระหว่างวันที่ <strong>${startDateThai} - ${endDateThai}</strong> จำนวน ${travelerCount} ราย นั้น
    </p>

    <p class="memo-indent">
      ในการนี้ ใคร่ขออนุมัติค่าใช้จ่ายโดยถัวเฉลี่ยแต่ละรายการในการเดินทางดังกล่าว โดยขอเบิกจ่ายจากงบประมาณเงินรายได้มหาวิทยาลัย
      รหัสกองทุน/เงินทุน <strong>${รหัสกองทุน}</strong> รหัสศูนย์ต้นทุน <strong>${รหัสศูนย์ต้นทุน}</strong>
      รหัสเขตตามหน้าที่ <strong>${รหัสเขตตามหน้าที่}</strong> รหัสภาระผูกพัน <strong>${รหัสภาระผูกพัน}</strong>
      เป็นเงินทั้งสิ้น <strong>${grandTotal.toLocaleString()} บาท (${bahtText})</strong> ดังมีรายละเอียดค่าใช้จ่ายดังต่อไปนี้
    </p>

    <div style="margin-left: 1.5em; margin-right: 1em; margin-bottom: 20px; background: #fafafa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px;">
      ${items.map((item) => `
        <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0;">
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <div style="font-size: 13px; color: #64748b;">${escapeHtml(item.calc)} • จ่ายโดย: <span style="color: #1d4ed8; font-weight: bold;">${escapeHtml(item.paymentMethod)}</span></div>
          </div>
          <div style="font-family: monospace; font-weight: bold; text-align: right;">฿${Number(item.amount).toLocaleString()}</div>
        </div>
      `).join('')}

      <div style="display: flex; justify-content: space-between; padding: 10px 0 2px 0; font-size: 17px;">
        <div><strong>รวมเงินทั้งสิ้น</strong></div>
        <div style="font-family: monospace; font-weight: bold; color: #1e3a8a; font-size: 18px;">฿${grandTotal.toLocaleString()} บาท</div>
      </div>
      <div style="text-align: right; font-weight: bold; color: #334155; font-size: 14px;">(${bahtText})</div>
    </div>

    <p class="memo-indent" style="margin-top: 25px; margin-bottom: 35px;">
      จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติค่าใช้จ่ายดังกล่าว โดยถัวเฉลี่ยแต่ละรายการค่าใช้จ่ายด้วย จะเป็นพระคุณยิ่ง
    </p>

    ${signatureBlockHtml(tripPlan)}
  </div>
  `;
}
