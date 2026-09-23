/**
 * สร้างไฟล์ .docx จริง (ไม่ใช่ HTML-as-.doc) สำหรับบันทึกข้อความราชการ 2 ฉบับ
 * โครงสร้างอ้างอิงจาก template ราชการจริงของมหาวิทยาลัย — ใช้ข้อมูลเดียวกับ preview HTML ใน memoGenerator.ts
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  TabStopType,
  VerticalAlign,
  ImageRun
} from 'docx';
import { TripPlan, CustomBudgetItem } from '../types';
import { arabicToThaiBahtText } from './thaiBaht';

const FONT = 'TH Sarabun New';
const BODY_SIZE = 28; // 14pt (half-points)
const TITLE_SIZE = 36; // 18pt

// ตราพระเกี้ยว จุฬาลงกรณ์มหาวิทยาลัย (public/cu-emblem.png, สัดส่วนจริง 961x1329) — โหลดครั้งเดียวแล้ว cache ไว้ใช้ซ้ำทั้ง 2 เอกสาร
let logoBufferPromise: Promise<ArrayBuffer> | null = null;
function getLogoBuffer(): Promise<ArrayBuffer> {
  if (!logoBufferPromise) {
    logoBufferPromise = fetch('/cu-emblem.png').then((res) => res.arrayBuffer());
  }
  return logoBufferPromise;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
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

function getSigner(tripPlan: TripPlan): { name: string; position: string } {
  const first = tripPlan.travelers?.[0];
  if (!first) return { name: '(ชื่อ-สกุลผู้ขออนุมัติ)', position: '' };
  const posStr = first.position ? `${first.position}${first.positionLevel && first.positionLevel !== '-' ? ' ' + first.positionLevel : ''}` : (first.rank || '');
  return { name: first.name || '(ชื่อ-สกุลผู้ขออนุมัติ)', position: posStr };
}

function buildPassportVisaText(requestPassport?: boolean, requestVisa?: boolean): string | null {
  if (!requestPassport && !requestVisa) return null;
  let action = 'การออกหนังสือเดินทางราชการ';
  if (requestPassport && requestVisa) action = 'การออกหนังสือเดินทางราชการและขอรับการตรวจลงตรา (วีซ่า)';
  else if (!requestPassport && requestVisa) action = 'การขอรับการตรวจลงตรา (วีซ่า)';
  return `และประสงค์จะขอให้มหาวิทยาลัยออกหนังสือนำไปยังกระทรวงการต่างประเทศ เพื่ออำนวยความสะดวกใน${action}ให้กับผู้เข้าร่วม`;
}

// ย่อหน้าธรรมดา เยื้องบรรทัดแรกแบบราชการ (2.5em ~ 720 twips) เต็มบรรทัด (justify)
function bodyParagraph(text: string, opts: { bold?: boolean } = {}): Paragraph {
  return new Paragraph({
    indent: { firstLine: 720 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160 },
    children: [new TextRun({ text, font: FONT, size: BODY_SIZE, bold: opts.bold })]
  });
}

// แถวหัวกระดาษแบบ 2 คอลัมน์ ไม่มีเส้นขอบ (label ตัวหนา + value)
function headerRow(pairs: { label: string; value: string }[]): TableRow {
  return new TableRow({
    children: pairs.map(
      (p) =>
        new TableCell({
          width: { size: Math.floor(9000 / pairs.length), type: WidthType.DXA },
          borders: NO_BORDERS,
          verticalAlign: VerticalAlign.TOP,
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `${p.label} `, bold: true, font: FONT, size: BODY_SIZE }),
                new TextRun({ text: p.value, font: FONT, size: BODY_SIZE })
              ]
            })
          ]
        })
    )
  });
}

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
};

async function buildHeader(tripPlan: TripPlan, subject: string): Promise<(Paragraph | Table)[]> {
  const หน่วยงาน = tripPlan.memo?.หน่วยงาน || '';
  const เลขที่หนังสือ = tripPlan.memo?.เลขที่หนังสือ || '';
  const วันที่บันทึก = tripPlan.memo?.วันที่บันทึก ? formatDate(tripPlan.memo.วันที่บันทึก) : formatDate(new Date().toISOString());
  const recipient = tripPlan.memo?.เรียนถึง || 'อธิการบดี';
  const via = tripPlan.memo?.ผ่าน || '';

  const rows: TableRow[] = [
    headerRow([{ label: 'ส่วนงาน', value: หน่วยงาน }]),
    headerRow([
      { label: 'ที่', value: เลขที่หนังสือ },
      { label: 'วันที่', value: วันที่บันทึก }
    ]),
    headerRow([{ label: 'เรื่อง', value: subject }]),
    headerRow([{ label: 'เรียน', value: recipient }])
  ];
  if (via) rows.push(headerRow([{ label: 'ผ่าน', value: via }]));

  const logoBuffer = await getLogoBuffer();

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new ImageRun({
          type: 'png',
          data: logoBuffer,
          transformation: { width: 60, height: 83 }
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: 'บันทึกข้อความ', bold: true, font: FONT, size: TITLE_SIZE })]
    }),
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      columnWidths: [9000],
      rows
    }),
    new Paragraph({
      spacing: { before: 100, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000', space: 1 } },
      children: [new TextRun({ text: '', font: FONT, size: BODY_SIZE })]
    })
  ];
}

function attendeeParagraph(idx: number, name: string, position: string): Paragraph {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 8500 }],
    spacing: { after: 40 },
    indent: { left: 720 },
    children: [new TextRun({ text: `${idx + 1}. ${name}\t${position}`, font: FONT, size: BODY_SIZE })]
  });
}

function signatureParagraphs(tripPlan: TripPlan): Paragraph[] {
  const signer = getSigner(tripPlan);
  return [
    new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: '(ลงชื่อ)........................................................', font: FONT, size: BODY_SIZE })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 400 }, children: [new TextRun({ text: `(${signer.name})`, bold: true, font: FONT, size: BODY_SIZE })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: signer.position, font: FONT, size: BODY_SIZE })] })
  ];
}

// เอกสารที่ 1: บันทึกขออนุมัติเดินทาง
export async function buildTravelMemoDocx(tripPlan: TripPlan): Promise<Document> {
  const travelers = tripPlan.travelers || [];
  const travelerCount = travelers.length || 1;
  const subject = tripPlan.memo?.subject || `ขออนุมัติเดินทางไปปฏิบัติงาน${travelScopeText(tripPlan)} (${tripPlan.projectName})`;
  const startDateThai = formatDate(tripPlan.startDate);
  const endDateThai = formatDate(tripPlan.endDate);

  const justification = tripPlan.memo?.justificationText ||
    `ด้วย ${tripPlan.memo?.หน่วยงาน || 'หน่วยงาน'} มีความประสงค์ขออนุมัติให้บุคลากรเดินทางไปปฏิบัติงาน${travelScopeText(tripPlan)} เพื่อเข้าร่วม ${tripPlan.projectName} ณ ${locationPhrase(tripPlan)} อันจะเป็นประโยชน์ต่อการพัฒนาบุคลากรและการดำเนินภารกิจของหน่วยงานต่อไป`;
  const customPurpose = tripPlan.memo?.วัตถุประสงค์เพิ่มเติม || '';

  const children: (Paragraph | Table)[] = [
    ...(await buildHeader(tripPlan, subject)),
    bodyParagraph(
      `${justification}${customPurpose ? ` ${customPurpose}` : ''} โดยมีกำหนดการระหว่างวันที่ ${startDateThai} - ${endDateThai} โดยมีผู้เข้าร่วมเดินทางจำนวน ${travelerCount} ราย ดังนี้`
    ),
    ...travelers.map((t, idx) => {
      const posStr = t.position ? `${t.position}${t.positionLevel && t.positionLevel !== '-' ? ' ' + t.positionLevel : ''}` : (t.rank || '-');
      return attendeeParagraph(idx, t.name, posStr);
    })
  ];

  const passportVisaText = buildPassportVisaText(tripPlan.memo?.requestPassport, tripPlan.memo?.requestVisa);
  if (passportVisaText) children.push(bodyParagraph(passportVisaText));

  if (tripPlan.hasPersonalLeave) {
    children.push(
      bodyParagraph(
        `อนึ่ง ผู้เดินทางมีการลากิจส่วนตัว/ลาพักผ่อน ก่อน/หลัง การไปปฏิบัติงานดังกล่าว ตั้งแต่วันที่ ${formatDate(tripPlan.leaveStartDate)} ถึงวันที่ ${formatDate(tripPlan.leaveEndDate)}`
      )
    );
  }

  children.push(bodyParagraph(`จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติและสั่งให้ไปปฏิบัติงาน${travelScopeText(tripPlan)}ด้วย จักขอบคุณยิ่ง`));
  children.push(...signatureParagraphs(tripPlan));

  return new Document({ sections: [{ children }] });
}

// เอกสารที่ 2: บันทึกขออนุมัติค่าใช้จ่าย — ดึงรายการจาก trip.customBudgetItems ตรงๆ
export async function buildExpenseMemoDocx(tripPlan: TripPlan): Promise<Document> {
  const travelerCount = tripPlan.travelers?.length || 1;
  const items: CustomBudgetItem[] = tripPlan.customBudgetItems || [];
  const grandTotal = tripPlan.estimatedBudget || items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const bahtText = arabicToThaiBahtText(grandTotal);
  const subject = tripPlan.memo?.expenseSubject || `ขออนุมัติค่าใช้จ่ายในการเดินทางไปปฏิบัติงาน${travelScopeText(tripPlan)} (${tripPlan.projectName})`;
  const startDateThai = formatDate(tripPlan.startDate);
  const endDateThai = formatDate(tripPlan.endDate);

  const รหัสกองทุน = tripPlan.memo?.รหัสกองทุน || '-';
  const รหัสศูนย์ต้นทุน = tripPlan.memo?.รหัสศูนย์ต้นทุน || '-';
  const รหัสเขตตามหน้าที่ = tripPlan.memo?.รหัสเขตตามหน้าที่ || '-';
  const รหัสภาระผูกพัน = tripPlan.memo?.รหัสภาระผูกพัน || '-';

  const tableRows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({ width: { size: 7000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: 'รายการ', bold: true, font: FONT, size: BODY_SIZE })] })] }),
        new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'จำนวนเงิน (บาท)', bold: true, font: FONT, size: BODY_SIZE })] })] })
      ]
    }),
    ...items.map(
      (item) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 7000, type: WidthType.DXA },
              children: [
                new Paragraph({ children: [new TextRun({ text: item.label, bold: true, font: FONT, size: BODY_SIZE })] }),
                new Paragraph({ children: [new TextRun({ text: `${item.calc} • จ่ายโดย: ${item.paymentMethod}`, font: FONT, size: BODY_SIZE - 4, color: '64748B' })] })
              ]
            }),
            new TableCell({
              width: { size: 2000, type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `฿${Number(item.amount).toLocaleString()}`, font: FONT, size: BODY_SIZE })] })]
            })
          ]
        })
    ),
    new TableRow({
      children: [
        new TableCell({ width: { size: 7000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: 'รวมเงินทั้งสิ้น', bold: true, font: FONT, size: BODY_SIZE })] })] }),
        new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `฿${grandTotal.toLocaleString()}`, bold: true, font: FONT, size: BODY_SIZE })] })] })
      ]
    })
  ];

  const children: (Paragraph | Table)[] = [
    ...(await buildHeader(tripPlan, subject)),
    bodyParagraph(
      `ตามที่ได้รับอนุมัติให้เดินทางไปปฏิบัติงาน${travelScopeText(tripPlan)} ณ ${locationPhrase(tripPlan)} ตามโครงการ ${tripPlan.projectName} ระหว่างวันที่ ${startDateThai} - ${endDateThai} จำนวน ${travelerCount} ราย นั้น`
    ),
    bodyParagraph(
      `ในการนี้ ใคร่ขออนุมัติค่าใช้จ่ายโดยถัวเฉลี่ยแต่ละรายการในการเดินทางดังกล่าว โดยขอเบิกจ่ายจากงบประมาณเงินรายได้มหาวิทยาลัย รหัสกองทุน/เงินทุน ${รหัสกองทุน} รหัสศูนย์ต้นทุน ${รหัสศูนย์ต้นทุน} รหัสเขตตามหน้าที่ ${รหัสเขตตามหน้าที่} รหัสภาระผูกพัน ${รหัสภาระผูกพัน} เป็นเงินทั้งสิ้น ${grandTotal.toLocaleString()} บาท (${bahtText}) ดังมีรายละเอียดค่าใช้จ่ายดังต่อไปนี้`
    ),
    new Table({ width: { size: 9000, type: WidthType.DXA }, columnWidths: [7000, 2000], rows: tableRows }),
    new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: '', font: FONT, size: BODY_SIZE })] }),
    bodyParagraph('จึงเรียนมาเพื่อโปรดพิจารณาอนุมัติค่าใช้จ่ายดังกล่าว โดยถัวเฉลี่ยแต่ละรายการค่าใช้จ่ายด้วย จะเป็นพระคุณยิ่ง'),
    ...signatureParagraphs(tripPlan)
  ];

  return new Document({ sections: [{ children }] });
}

export async function downloadDocx(doc: Document, filename: string): Promise<void> {
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
