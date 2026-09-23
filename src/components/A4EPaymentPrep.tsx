/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Upload,
  Sparkles,
  Check,
  AlertTriangle,
  HelpCircle,
  FileCheck,
  Download,
  Info,
  ArrowRight,
  FileUp,
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { TripPlan, EPaymentField, EPaymentData, GL_CODES } from '../types';
import { SAMPLE_SIGNED_MEMO_HTML } from '../data/samples';
import type { ParsedInvitationFile } from './DashboardOverview';
import * as XLSX from 'xlsx';
import { useLanguage } from '../i18n/LanguageContext';
import F12Form from './F12Form';

interface A4EPaymentPrepProps {
  trip: TripPlan | null;
  onUpdateTrip: (updated: TripPlan) => void;
  onNextStep: () => void;
  onPrevStep: () => void;
  // ไฟล์บันทึกอนุมัติที่ผู้ใช้เลือก "ใช้เอกสาร" มาจากหน้าแรก — ให้ประมวลผลทันทีที่เปิดหน้านี้ เสมือนผู้ใช้ลากไฟล์นี้มาวางเอง
  autoProcessFile?: ParsedInvitationFile;
  onAutoProcessed?: () => void;
}

export default function A4EPaymentPrep({
  trip,
  onUpdateTrip,
  onNextStep,
  onPrevStep,
  autoProcessFile,
  onAutoProcessed
}: A4EPaymentPrepProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [formType, setFormType] = useState<'F8' | 'F12' | 'both'>(
    trip?.paymentMethod === 'advance' ? 'F12' : 'F8'
  );

  // Missing Fields States
  const [glCode, setGlCode] = useState('5103010001');
  const [receivingMethod, setReceivingMethod] = useState('โอนเงินผ่านบัญชีธนาคารกรุงไทย (บัญชีเงินเดือน)');
  const [poCode, setPoCode] = useState('');
  const [returnDate, setReturnDate] = useState('');

  // Mapping status states (pre-filled or simulated after signed memo upload)
  const [signedMemoUploaded, setSignedMemoUploaded] = useState(false);
  const [extractedData, setExtractedData] = useState<any | null>(null);

  // Popup Guideline State
  const [activeGuideline, setActiveGuideline] = useState<string | null>(null);

  const simulateSignedUpload = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/a4-parse-memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: 'signed_memo_placeholder',
          mimeType: 'text/html'
        })
      });

      const result = await res.json();
      if (result.success && result.data) {
        setExtractedData({
          ...result.data,
          uploadedFileName: 'บันทึกข้อความอนุมัติ_ลงนามแล้ว.pdf'
        });
        setSignedMemoUploaded(true);
      }
    } catch (e) {
      console.error("Signed memo parsing error", e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const resultStr = e.target?.result as string;
        const base64Data = resultStr?.includes(',') ? resultStr.split(',')[1] : resultStr;
        const mimeType = file.type || 'application/pdf';

        const res = await fetch('/api/agent/a4-parse-memo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: base64Data,
            mimeType,
            fileName: file.name
          })
        });

        const result = await res.json();
        if (result.success && result.data) {
          setExtractedData({
            ...result.data,
            uploadedFileName: file.name
          });
          setSignedMemoUploaded(true);
        } else {
          // Fallback simulation with uploaded file name
          setExtractedData({
            documentNo: "อว 8604 / ว 2045",
            department: "คณะเทคโนโลยีสารสนเทศและนวัตกรรมดิจิทัล",
            date: new Date().toISOString().split('T')[0],
            projectName: trip?.projectName || "โครงการพัฒนาและเดินทางปฏิบัติงานต่างประเทศ",
            totalAmount: trip?.estimatedBudget || 185200,
            budgetCode: trip?.budgetCode || "BG-6901-2026",
            uploadedFileName: file.name,
            travelers: trip?.travelers?.map(t => t.name) || ["ดร. สมชาย รักดี", "ผศ.ดร. หญิง สุขดี"]
          });
          setSignedMemoUploaded(true);
        }
        setLoading(false);
      };

      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    } catch (err) {
      console.error("Upload error", err);
      simulateSignedUpload();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  // ไฟล์ที่ผู้ใช้เลือก "ใช้เอกสาร" มาจากหน้าแรก (มี base64 อยู่แล้ว ไม่ต้องอ่านไฟล์ใหม่) — ประมวลผลทันทีที่เปิดหน้านี้ เสมือนลากไฟล์นี้มาวางเอง
  useEffect(() => {
    if (!autoProcessFile) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/agent/a4-parse-memo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: autoProcessFile.fileData,
            mimeType: autoProcessFile.mimeType,
            fileName: autoProcessFile.fileName
          })
        });
        const result = await res.json();
        if (result.success && result.data) {
          setExtractedData({ ...result.data, uploadedFileName: autoProcessFile.fileName });
          setSignedMemoUploaded(true);
        }
      } catch (e) {
        console.error('Auto-process signed memo failed', e);
      } finally {
        setLoading(false);
        onAutoProcessed?.();
      }
    })();
  }, [autoProcessFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Field Mapping Generators
  const getF8Fields = (): EPaymentField[] => {
    if (!signedMemoUploaded || !trip) return [];
    const pm = trip.itemPaymentMethods;
    const pmText = pm
      ? `ตั๋วเครื่องบิน: ${pm.flight} | ที่พัก: ${pm.accommodation} | เบี้ยเลี้ยง: ${pm.perDiem} | ประกัน: ${pm.insurance} | วีซ่า: ${pm.visa} | พาหนะ: ${pm.transport}`
      : 'จำแนกเงินสด/บัตรเครดิตตามรายการ';

    return [
      { key: 'doc_no', label: 'เลขที่เอกสารอนุมัติ', value: extractedData?.documentNo || 'อว 8604 / ว 2045', status: 'green', description: 'ดึงอัตโนมัติจากไฟล์บันทึกข้อความที่ลงนามแล้ว' },
      { key: 'dept', label: 'ส่วนราชการ/หน่วยงาน', value: extractedData?.department || 'คณะเทคโนโลยีสารสนเทศฯ', status: 'green', description: 'ดึงอัตโนมัติจากหัวบันทึก' },
      { key: 'project', label: 'โครงการ/ชื่องานเพื่อเบิก', value: extractedData?.projectName || trip.projectName, status: 'green', description: 'ดึงอัตโนมัติจากเนื้อหาบันทึก' },
      { key: 'total_approved', label: 'วงเงินเบิกจ่ายสูงสุด', value: `฿${(extractedData?.totalAmount || trip.estimatedBudget).toLocaleString()}`, status: 'green', description: 'ดึงอัตโนมัติจากตารางสรุปงบ' },
      { key: 'payment_item_breakdown', label: 'รูปแบบการชำระเงินจำแนกตามรายการ', value: pmText, status: 'green', description: 'ดึงอัตโนมัติจากการตั้งค่าใน Agent 1 (สรุปงบประมาณประมาณการรวม)' },
      { key: 'gl_code', label: 'ผังรหัสบัญชีแยกประเภท (GL)', value: glCode, status: 'yellow', description: 'ผู้ใช้ต้องเลือกตามรายการที่ต้องการคีย์เบิกในระบบ' },
      { key: 'payment_opt', label: 'วิธีรับเงินค่าใช้จ่าย', value: receivingMethod, status: 'yellow', description: 'ระบุวิธีรับโอน หรือ คีย์เลขบัญชีธนาคารกรุงไทย' },
      { key: 'vendor_search', label: 'ชื่อผู้รับเงิน / Vendor', value: 'ค้นหา Vendor สายการบิน / โรงแรม / ร้านประกัน', status: 'blue', description: 'แนะนำให้คลิกค้นหาจาก Popup บุคลากร/ผู้ค้าใน CU E-Payment' },
      { key: 'approver', label: 'ผู้มีสิทธิ์อนุมัติจ่ายเงิน', value: 'ค้นหาผู้มีอำนาจอนุมัติ (รองอธิการฯ/คณบดี)', status: 'blue', description: 'แนะนำให้คลิกค้นหาจาก Popup บุคลากร' },
      { key: 'po_reference', label: 'รหัส PO / ภาระผูกพัน', value: poCode || 'ไม่ได้ระบุ', status: 'yellow', description: 'ระบุรหัสผูกพันงบประมาณ (ถ้ามี)' },
      { key: 'boarding_pass', label: 'บัตรขึ้นเครื่อง (Boarding Pass)', value: 'ต้องแนบเพิ่มหลังจบทริป', status: 'grey', description: 'ต้องเก็บต้นฉบับแนบหลังการเดินทางจริง ห้ามหาย!' },
      { key: 'actual_invoice', label: 'ใบเสร็จรับเงิน/ใบกำกับภาษี', value: 'ต้องประมวลผลด้วย Agent 5 หลังทริป', status: 'grey', description: 'หลักฐานการจ่ายเงินจริงหลังเดินทาง ต้องอัปโหลดเคลียร์เงิน' }
    ];
  };

  const getF12Fields = (): EPaymentField[] => {
    if (!signedMemoUploaded || !trip) return [];
    return [
      { key: 'doc_no', label: 'เลขที่สัญญายืมเงินคุม', value: extractedData?.documentNo || 'อว 8604 / ว 2045', status: 'green', description: 'ดึงอัตโนมัติจากไฟล์ขออนุมัติ' },
      { key: 'dept', label: 'ส่วนงานผู้ยืม', value: extractedData?.department || 'คณะเทคโนโลยีสารสนเทศฯ', status: 'green', description: 'ดึงอัตโนมัติจากหัวบันทึก' },
      { key: 'total_borrow', label: 'วงเงินยืมทดรองราชการรวม', value: `฿${(extractedData?.totalAmount || trip.estimatedBudget).toLocaleString()}`, status: 'green', description: 'คำนวณจากประมาณการค่าใช้จ่ายจริงที่จำเป็น' },
      { key: 'gl_code', label: 'รหัสแยกประเภทคุมเงินยืม', value: '5103010003 (เงินยืมเบี้ยเลี้ยง/ที่พัก)', status: 'green', description: 'กำหนดให้เป็นรหัสเงินยืมเดินทางล่วงหน้าตามระเบียบ' },
      { key: 'return_deadline', label: 'วันกำหนดส่งคืนเงินยืม', value: returnDate || 'ต้องระบุภายใน 15 วันหลังจบทริป', status: 'yellow', description: 'กำหนดวันชดใช้เงินยืมราชการ' },
      { key: 'payment_opt', label: 'ช่องทางรับเงินยืมล่วงหน้า', value: receivingMethod, status: 'yellow', description: 'ระบุวิธีการโอนรับเงินยืม' },
      { key: 'approver', label: 'ผู้เซ็นอนุมัติสัญญายืมเงิน', value: 'ค้นหาผู้อนุมัติสัญญาเงินยืม', status: 'blue', description: 'คลิกค้นหาเพื่อแมปลิงก์กับระบบบุคลากรส่วนกลาง' }
    ];
  };

  const activeF8Fields = getF8Fields();
  const activeF12Fields = getF12Fields();

  // Create F12 Template Sheet (สัญญายืมเงินล่วงหน้า) - Exactly 17 columns main table + breakdown table
  const createF12Sheet = () => {
    // Top Table Headers (17 columns as specified)
    const mainHeader = [
      'ลำดับ',
      'ส่วนงาน',
      'เรื่อง',
      'เรียน',
      'ผู้มีอำนาจ',
      'คำอธิบายรายการ',
      'ชื่อ',
      'ตำแหน่ง',
      'ปีงบ',
      'วัตถุประสงค์เงินยืมรองจ่าย',
      'กองทุน / เงินทุน',
      'หน่วยงาน',
      'จำนวนเงินยืมทั้งหมด',
      'จำนวนเงินจ่ายเช็ค',
      'จำนวนเงินจ่ายโอน',
      'จำนวนเงินจ่ายบัตรเครดิต',
      'วิธีการชำระเงิน'
    ];

    const deptName = extractedData?.department || 'ศูนย์การจัดการทรัพยากรของมหาวิทยาลัย';
    const fundSource = '2010046000';
    const budgetYear = '2569';
    const recipient = trip?.memo?.เรียนถึง || 'รองอธิการบดี';
    const approver = trip?.memo?.ผ่าน || trip?.memo?.เรียนถึง || 'ศาสตราจารย์ ดร.คณพล จันทน์หอม';
    const subject = trip?.memo?.subject || extractedData?.projectName || `ยืมเงินสำรองจ่ายเดินทางศึกษาดูงาน ${trip?.location || 'NUS'}`;

    // sheet นี้เขียนไว้ตั้งแต่ก่อนระบบรองรับทริปในประเทศ (tripType) เลย hardcode "ประเทศ.../ต่างประเทศ" ทุกจุด — ต่อท้ายเฉพาะทริปต่างประเทศเท่านั้น
    const countryName = trip?.country || 'สิงคโปร์';
    const locationName = trip?.location || 'National University of Singapore';
    const destinationPhrase = trip?.tripType === 'DOMESTIC' ? locationName : `${locationName} ประเทศ${countryName}`;
    const datesStr = trip?.startDate && trip?.endDate
      ? `${trip.startDate} - ${trip.endDate}`
      : '9 - 10 กุมภาพันธ์ 2569';

    const description = `ยืมเงินสำรองจ่ายสำหรับการประสานงานเพื่อสร้างความร่วมมือและศึกษาดูงาน ณ ${destinationPhrase}\nวันที่ ${datesStr}`;

    const totalAdvance = extractedData?.totalAmount || trip?.estimatedBudget || 105900;

    const leadTraveler = trip?.travelers && trip.travelers.length > 0
      ? (typeof trip.travelers[0] === 'string' ? trip.travelers[0] : trip.travelers[0].name)
      : (extractedData?.travelers?.[0] || 'ดร. สมชาย รักดี');

    const leadRole = 'พนักงานมหาวิทยาลัย';
    const loanPurpose = `ยืมเงินสำรองจ่ายในการเดินทางปฏิบัติงานและศึกษาดูงาน${trip?.tripType === 'DOMESTIC' ? '' : 'ต่างประเทศ'}`;
    const paymentMethod = 'โอนเงินเข้าบัญชีธนาคาร (e-Payment)';

    const mainRow = [
      1,
      deptName,
      subject,
      recipient,
      approver,
      description,
      leadTraveler,
      leadRole,
      budgetYear,
      loanPurpose,
      fundSource,
      deptName,
      totalAdvance.toLocaleString(),
      '0',
      totalAdvance.toLocaleString(),
      '0',
      paymentMethod
    ];

    const sheetData = [
      mainHeader,
      mainRow
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws['!cols'] = [
      { wch: 8 },  // ลำดับ
      { wch: 35 }, // ส่วนงาน
      { wch: 35 }, // เรื่อง
      { wch: 18 }, // เรียน
      { wch: 30 }, // ผู้มีอำนาจ
      { wch: 65 }, // คำอธิบายรายการ
      { wch: 25 }, // ชื่อ
      { wch: 22 }, // ตำแหน่ง
      { wch: 8 },  // ปีงบ
      { wch: 45 }, // วัตถุประสงค์เงินยืมรองจ่าย
      { wch: 18 }, // กองทุน / เงินทุน
      { wch: 35 }, // หน่วยงาน
      { wch: 22 }, // จำนวนเงินยืมทั้งหมด
      { wch: 18 }, // จำนวนเงินจ่ายเช็ค
      { wch: 18 }, // จำนวนเงินจ่ายโอน
      { wch: 22 }, // จำนวนเงินจ่ายบัตรเครดิต
      { wch: 28 }  // วิธีการชำระเงิน
    ];

    return ws;
  };

  // Create F8 Template Sheet (ใบเบิกค่าใช้จ่าย) - 21 columns main table + 7 columns breakdown
  const createF8Sheet = () => {
    // Top Table Headers (21 columns)
    const mainHeader = [
      'ลำดับ',
      'ส่วนงาน',
      'ศูนย์ต้นทุน',
      'กองทุน / แหล่งเงิน',
      'เขตพื้นที่หน้าที่',
      'หน่วยงาน',
      'ปีงบ',
      'แผนงาน',
      'ใบกันเงิน',
      'บรรทัดรายการใบกันเงิน',
      'เรียน',
      'ผู้มีอำนาจ',
      'เรื่อง',
      'คำอธิบายรายการ',
      'แหล่งเงิน',
      'รายการ',
      'จำนวนเงินรวม',
      'GL Account',
      'เงินงบประมาณ',
      'เงินนอกงบประมาณ',
      'ประเภทผู้เดินทาง'
    ];

    const deptCode = '0100';
    const costCenter = trip?.budgetCode || extractedData?.budgetCode || '1010902000';
    const fundSource = '2010046000';
    const areaCode = '11610109200018';
    const deptName = extractedData?.department || 'ศูนย์การจัดการทรัพยากรของมหาวิทยาลัย';
    const budgetYear = '2569';
    const recipient = trip?.memo?.เรียนถึง || 'รองอธิการบดี';
    const approver = trip?.memo?.ผ่าน || trip?.memo?.เรียนถึง || 'ศาสตราจารย์ ดร.คณพล จันทน์หอม';
    const subject = trip?.memo?.subject || extractedData?.projectName || `เบิกจ่ายค่าใช้จ่ายเดินทาง ${trip?.location || 'ต่างประเทศ'}`;

    const countryName = trip?.country || 'สิงคโปร์';
    const locationName = trip?.location || 'National University of Singapore';
    const destinationPhrase = trip?.tripType === 'DOMESTIC' ? locationName : `${locationName} ประเทศ${countryName}`;
    const datesStr = trip?.startDate && trip?.endDate
      ? `${trip.startDate} - ${trip.endDate}`
      : '9 - 10 กุมภาพันธ์ 2569';

    const description = `เบิกจ่ายค่าใช้จ่ายเดินทางปฏิบัติงานและศึกษาดูงาน ณ ${destinationPhrase} ระหว่าง วันที่ ${datesStr}`;

    const totalBudget = extractedData?.totalAmount || trip?.estimatedBudget || 105900;
    const budgetAmount = Math.round(totalBudget * 0.52785);
    const nonBudgetAmount = totalBudget - budgetAmount;

    const mainRow = [
      1,
      deptCode,
      costCenter,
      fundSource,
      areaCode,
      deptName,
      budgetYear,
      '',
      '',
      '',
      recipient,
      approver,
      subject,
      description,
      fundSource,
      `เบิกจ่ายค่าใช้จ่ายการเดินทาง${trip?.tripType === 'DOMESTIC' ? '' : 'ต่างประเทศ'}`,
      totalBudget.toLocaleString(),
      '5102010101',
      budgetAmount.toLocaleString(),
      nonBudgetAmount.toLocaleString(),
      'พนักงาน'
    ];

    // Item Breakdown Headers (7 columns)
    const itemHeader = ['รายการ', 'ลำดับผู้เดินทาง', 'ผู้เดินทาง', 'รายการเบิก', 'จำนวนเงิน', 'รหัสบัญชี GL', 'ศูนย์ต้นทุน'];

    // Item Breakdown Rows per Traveler / Custom Budget Items
    const itemRows: any[][] = [];
    const travelers = trip?.travelers && trip.travelers.length > 0
      ? trip.travelers
      : (extractedData?.travelers?.map((name: string) => ({ name })) || [
          { name: 'ภารณี วัฒนศิริกุล' },
          { name: 'สมชาย รักดี' }
        ]);

    if (trip?.customBudgetItems && trip.customBudgetItems.length > 0) {
      trip.customBudgetItems.forEach((bItem, itemIdx) => {
        itemRows.push([
          1,
          itemIdx + 1,
          travelers.map((t: any) => typeof t === 'string' ? t : t.name).join(', '),
          bItem.label,
          bItem.amount.toLocaleString(),
          bItem.id === 'flight' ? '5103010001' : bItem.id === 'accommodation' ? '5103010002' : bItem.id === 'perDiem' ? '5103010003' : bItem.id === 'insurance' ? '5103010004' : '5103010006',
          costCenter
        ]);
      });
    } else {
      travelers.forEach((t: any, idx: number) => {
        const travelerName = typeof t === 'string' ? t : (t.name || `ผู้เดินทาง ${idx + 1}`);

        const flightCost = t.flightBudget ? Math.round(t.flightBudget) : 25000;
        const accomAndPerDiem = t.accommodationBudget && t.perDiemBudget
          ? Math.round(t.accommodationBudget + t.perDiemBudget)
          : (idx === 0 ? 27200 : 23500);
        const miscCost = t.otherExpenses ? Math.round(t.otherExpenses) : (idx === 0 ? 3100 : 2100);

        const travelScopeText = trip?.tripType === 'DOMESTIC' ? '' : 'ต่างประเทศ';
        itemRows.push([1, idx + 1, travelerName, `ค่าพาหนะเดินทาง${travelScopeText} (เครื่องบิน)`, flightCost.toLocaleString(), '5102010101', costCenter]);
        itemRows.push([1, idx + 1, travelerName, `ค่าที่พักและเบี้ยเลี้ยงเดินทาง${travelScopeText}`, accomAndPerDiem.toLocaleString(), '5102010102', costCenter]);
        itemRows.push([1, idx + 1, travelerName, 'ค่าเบี้ยเลี้ยงและค่าใช้จ่ายอื่นที่เกิดขึ้นจริง', miscCost.toLocaleString(), '5102010103', costCenter]);
      });
    }

    const sheetData = [
      mainHeader,
      mainRow,
      itemHeader,
      ...itemRows
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    ws['!cols'] = [
      { wch: 8 },  // ลำดับ
      { wch: 10 }, // ส่วนงาน
      { wch: 15 }, // ศูนย์ต้นทุน
      { wch: 18 }, // กองทุน / แหล่งเงิน
      { wch: 20 }, // เขตพื้นที่หน้าที่
      { wch: 40 }, // หน่วยงาน
      { wch: 8 },  // ปีงบ
      { wch: 12 }, // แผนงาน
      { wch: 12 }, // ใบกันเงิน
      { wch: 20 }, // บรรทัดรายการใบกันเงิน
      { wch: 15 }, // เรียน
      { wch: 30 }, // ผู้มีอำนาจ
      { wch: 30 }, // เรื่อง
      { wch: 65 }, // คำอธิบายรายการ
      { wch: 15 }, // แหล่งเงิน
      { wch: 30 }, // รายการ
      { wch: 15 }, // จำนวนเงินรวม
      { wch: 15 }, // GL Account
      { wch: 15 }, // เงินงบประมาณ
      { wch: 15 }, // เงินนอกงบประมาณ
      { wch: 15 }  // ประเภทผู้เดินทาง
    ];

    return ws;
  };

  // Export metadata directly to Excel via SheetJS
  const handleExportExcel = () => {
    if (!trip) return;

    const workbook = XLSX.utils.book_new();

    if (formType === 'F12' || formType === 'both') {
      const wsF12 = createF12Sheet();
      XLSX.utils.book_append_sheet(workbook, wsF12, 'F12_สัญญายืมเงิน');
    }

    if (formType === 'F8' || formType === 'both') {
      const wsF8 = createF8Sheet();
      XLSX.utils.book_append_sheet(workbook, wsF8, 'F8_ใบเบิกค่าใช้จ่าย');
    }

    const fileNameType = formType === 'F12' ? 'F12' : formType === 'F8' ? 'F8' : 'F12_F8';
    XLSX.writeFile(
      workbook,
      `ePayment_${fileNameType}_Trip_${trip.country || trip.destinationProvince || trip.location}_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  };

  const handleConfirmAndNext = () => {
    if (!trip) return;

    const epay: EPaymentData = {
      formType,
      glCode,
      receivingMethod,
      poCode,
      returnDate: formType === 'F12' || formType === 'both' ? returnDate : undefined,
      fieldsF8: activeF8Fields,
      fieldsF12: activeF12Fields
    };

    const updatedTrip: TripPlan = {
      ...trip,
      ePaymentData: epay,
      status: 'A5_UPLOADING_RECEIPTS' // Moves to Receipt clearance agent stage
    };

    onUpdateTrip(updatedTrip);
    onNextStep();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-950 flex items-center gap-2">
            <Sparkles className="text-blue-600 animate-pulse" size={22} />
            {t('a4.heading')}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {t('a4.subheading')}
          </p>
        </div>
      </div>

      {!signedMemoUploaded ? (
        /* State 1: Upload signed document */
        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-xs text-center space-y-6 max-w-2xl mx-auto">
          <div className="mx-auto w-14 h-14 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center border border-blue-200 shadow-2xs">
            <FileUp size={28} />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">{t('a4.uploadTitle')}</h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed font-medium">
              {t('a4.uploadSubtitle')} <strong>{t('a4.uploadSubtitleBold')}</strong> {t('a4.uploadSubtitleTail')}
            </p>
          </div>

          {/* Interactive Drag & Drop Box */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 transition-all text-center space-y-3 ${
              isDragging
                ? 'border-blue-500 bg-blue-50/80 scale-[1.01]'
                : 'border-slate-300 hover:border-blue-400 bg-slate-50/50'
            }`}
          >
            <Upload size={32} className={`mx-auto ${isDragging ? 'text-blue-600 animate-bounce' : 'text-slate-400'}`} />
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-800">
                {t('a4.dragFileHere')}
              </p>
              <label className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer transition-all">
                {t('a4.chooseFile')}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.html"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-3xs text-slate-400 font-medium">
              {t('a4.supportedFormats')}
            </p>
          </div>

          {/* Alternative Demo simulation button */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={simulateSignedUpload}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              <Sparkles size={14} className="text-blue-600" />
              {t('a4.simulateExample')}
            </button>
            <button
              onClick={onPrevStep}
              className="inline-flex items-center justify-center px-5 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              {t('a4.backToDraft')}
            </button>
          </div>

          {loading && (
            <div className="pt-4 space-y-2">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs font-bold text-blue-700">{t('a4.detectingDocument')}</p>
            </div>
          )}
        </div>
      ) : (
        /* State 2: Show mapping & manual edits with Mode Indicator Banner */
        <div className="space-y-6">
          {/* Active Mode Banner: Detected Signed Approval Document */}
          <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg shrink-0 mt-0.5">
                <CheckCircle2 size={22} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-emerald-950 text-sm">
                    {t('a4.modeDetected')}
                  </span>
                  <span className="px-2.5 py-0.5 bg-emerald-600 text-white font-bold text-3xs rounded-full uppercase tracking-wider">
                    {t('a4.extractSuccess')}
                  </span>
                </div>
                <div className="text-xs text-emerald-900 font-medium leading-relaxed flex flex-wrap gap-x-4 gap-y-1">
                  <span><strong>{t('a4.docNumberLabel')}</strong> {extractedData?.documentNo || 'อว 8604 / ว 2045'}</span>
                  <span><strong>{t('a4.departmentLabel')}</strong> {extractedData?.department || 'คณะเทคโนโลยีสารสนเทศฯ'}</span>
                  <span><strong>{t('a4.totalApprovedLabel')}</strong> ฿{(extractedData?.totalAmount || trip?.estimatedBudget || 0).toLocaleString()}</span>
                  {extractedData?.uploadedFileName && (
                    <span className="text-emerald-700 font-semibold">
                      📄 {t('a4.fileLabel')} {extractedData.uploadedFileName}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setSignedMemoUploaded(false)}
              className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-2xs font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer"
            >
              <RefreshCw size={12} />
              {t('a4.changeDocument')}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Settings and Extra Data */}
          <div className="lg:col-span-1 space-y-5 bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-2xs text-xs">
            <h3 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Info size={14} className="text-blue-600" />
              {t('a4.additionalSettingsTitle')}
            </h3>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">{t('a4.documentFormType')}</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormType('F8')}
                  className={`flex-1 py-2 rounded-lg text-2xs font-bold border transition-all cursor-pointer ${
                    formType === 'F8'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {t('a4.f8Label')}
                </button>
                <button
                  type="button"
                  onClick={() => setFormType('F12')}
                  className={`flex-1 py-2 rounded-lg text-2xs font-bold border transition-all cursor-pointer ${
                    formType === 'F12'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {t('a4.f12Label')}
                </button>
                <button
                  type="button"
                  onClick={() => setFormType('both')}
                  className={`flex-1 py-2 rounded-lg text-2xs font-bold border transition-all cursor-pointer ${
                    formType === 'both'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {t('a4.bothLabel')}
                </button>
              </div>
            </div>

            <div className="space-y-4 pt-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">{t('a4.glCodeLabel')}</label>
                <select
                  value={glCode}
                  onChange={(e) => setGlCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden"
                >
                  {GL_CODES.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.code} - {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">{t('a4.receivingMethodLabel')}</label>
                <input
                  type="text"
                  value={receivingMethod}
                  onChange={(e) => setReceivingMethod(e.target.value)}
                  placeholder={t('a4.receivingMethodPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden"
                />
              </div>

              {(formType === 'F12' || formType === 'both') && (
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-700">{t('a4.returnDateLabel')}</label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">{t('a4.poCodeLabel')}</label>
                <input
                  type="text"
                  value={poCode}
                  onChange={(e) => setPoCode(e.target.value)}
                  placeholder={t('a4.poCodePlaceholder')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden"
                />
              </div>

              {trip?.itemPaymentMethods && (
                <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                  <div className="font-bold text-slate-800 text-2xs flex items-center justify-between">
                    <span>{t('a4.paymentMethodFromA1')}</span>
                    <span className="text-blue-600">{t('a4.savedOk')}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-2xs text-slate-600 font-medium">
                    <div>• {t('a4.itemFlight')}: <span className="font-bold text-slate-900">{trip.itemPaymentMethods.flight}</span></div>
                    <div>• {t('a4.itemAccommodation')}: <span className="font-bold text-slate-900">{trip.itemPaymentMethods.accommodation}</span></div>
                    <div>• {t('a4.itemPerDiem')}: <span className="font-bold text-slate-900">{trip.itemPaymentMethods.perDiem}</span></div>
                    <div>• {t('a4.itemInsurance')}: <span className="font-bold text-slate-900">{trip.itemPaymentMethods.insurance}</span></div>
                    <div>• {t('a4.itemVisa')}: <span className="font-bold text-slate-900">{trip.itemPaymentMethods.visa}</span></div>
                    <div>• {t('a4.itemTransport')}: <span className="font-bold text-slate-900">{trip.itemPaymentMethods.transport}</span></div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleExportExcel}
                className="w-full mt-3 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <Download size={14} />
                {t('a4.downloadExcel')}
              </button>
            </div>
          </div>

          {/* Right Field Mapping Grid */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-950">
                {t('a4.fieldGuideTitle')}
              </h3>
              {(formType === 'F8' || formType === 'both') && (
                <div className="flex flex-wrap gap-1.5 text-2xs">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full"></span> {t('a4.legendAuto')}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-500 rounded-full"></span> {t('a4.legendManual')}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded-full"></span> {t('a4.legendSearch')}</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* F8: Display mapping items list (read-only guide, no dedicated table yet) */}
              {(formType === 'F8' || formType === 'both') && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 text-xs font-bold text-slate-700 flex flex-wrap justify-between items-center gap-x-3 gap-y-1">
                    <span>{t('a4.tableColField')}</span>
                    <span>{t('a4.tableColValue')}</span>
                  </div>
                  <div className="divide-y divide-slate-150 max-h-[400px] overflow-y-auto bg-white">
                    <div className="p-3 bg-indigo-50/25 border-b border-slate-200 text-xs font-bold text-indigo-950">
                      {t('a4.f8SectionTitle')}
                    </div>
                    {activeF8Fields.map((field) => (
                      <div key={field.key} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-xs text-slate-900">{field.label}</div>
                          <div className="text-2xs text-slate-500">{field.description}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {field.status === 'blue' ? (
                            <button
                              onClick={() => setActiveGuideline(field.key)}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-2xs font-bold rounded-lg border border-blue-200 flex items-center gap-1"
                            >
                              <HelpCircle size={10} /> {t('a4.searchGuideButton')}
                            </button>
                          ) : field.status === 'green' ? (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 text-2xs font-bold rounded-md border border-emerald-200">
                              {field.value}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-2xs font-medium rounded-md border border-slate-200">
                              {field.value}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* F12: real fillable/saveable form backed by EPaymentF12Request/EPaymentF12Channel */}
              {trip && (formType === 'F12' || formType === 'both') && <F12Form trip={trip} />}

              {/* Warning/Guidance Box */}
              <div className="p-4 bg-blue-50/55 border border-blue-200 rounded-xl flex items-start gap-3">
                <Info className="text-blue-600 shrink-0 mt-0.5" size={16} />
                <div className="space-y-1 text-xs text-blue-950 leading-relaxed">
                  <span className="font-bold text-slate-900">{t('a4.warningTitle')}</span>
                  <p className="font-medium text-slate-700">
                    {t('a4.warningBodyPrefix')} <strong>{t('a4.boardingPass')}</strong> {t('a4.warningBodyMid')} <strong>{t('a4.hotelReceipt')}</strong> {t('a4.warningBodySuffix')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Helper Guideline Modal/Popup */}
      {activeGuideline && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <h4 className="text-sm font-bold text-slate-950 flex items-center gap-2">
              <HelpCircle className="text-blue-600" size={18} />
              {t('a4.guideModalTitle')}
            </h4>
            <div className="text-xs text-slate-600 space-y-3 leading-relaxed font-medium">
              {activeGuideline === 'vendor_search' ? (
                <>
                  <p>{t('a4.vendorGuideIntro')}</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>{t('a4.vendorGuideStep1a')} <strong>CU E-Payment</strong> {t('a4.vendorGuideStep1b')}</li>
                    <li>{t('a4.vendorGuideStep2')}</li>
                    <li>{t('a4.vendorGuideStep3')}</li>
                    <li>{t('a4.vendorGuideStep4')}</li>
                    <li>{t('a4.vendorGuideStep5')}</li>
                  </ol>
                </>
              ) : activeGuideline === 'approver' ? (
                <>
                  <p>{t('a4.approverGuideIntro')}</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>{t('a4.approverGuideStep1')}</li>
                    <li>{t('a4.approverGuideStep2')}</li>
                    <li>{t('a4.approverGuideStep3')}</li>
                    <li>{t('a4.approverGuideStep4')}</li>
                  </ol>
                </>
              ) : (
                <p>{t('a4.defaultGuide')}</p>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveGuideline(null)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-2xs font-bold cursor-pointer"
              >
                {t('a4.gotIt')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Controls */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={onPrevStep}
          className="w-full sm:w-auto px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer order-2 sm:order-1"
        >
          {t('a4.backToMemoDraft')}
        </button>

        <button
          id="btn-confirm-a4"
          type="button"
          onClick={handleConfirmAndNext}
          disabled={!signedMemoUploaded}
          className="w-full sm:w-auto justify-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-250 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg shadow-md shadow-blue-950/20 transition-all flex items-center gap-1 cursor-pointer order-1 sm:order-2"
        >
          {t('a4.confirmAndStartExpense')}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
