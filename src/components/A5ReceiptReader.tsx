/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Receipt as ReceiptIcon,
  Upload,
  Sparkles,
  Check,
  AlertCircle,
  Download,
  Trash2,
  TrendingDown,
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';
import { TripPlan, Receipt, GL_CODES } from '../types';
import { SAMPLE_RECEIPTS } from '../data/samples';
import type { ParsedInvitationFile } from './DashboardOverview';
import * as XLSX from 'xlsx';
import { useLanguage } from '../i18n/LanguageContext';

interface A5ReceiptReaderProps {
  trip: TripPlan | null;
  onUpdateTrip: (updated: TripPlan) => void;
  onNextStep: () => void;
  onPrevStep: () => void;
  // ไฟล์ใบเสร็จที่ผู้ใช้เลือก "ใช้เอกสาร" มาจากหน้าแรก — ให้ประมวลผลทันทีที่เปิดหน้านี้ เสมือนผู้ใช้ลากไฟล์นี้มาวางเอง
  autoProcessFile?: ParsedInvitationFile;
  onAutoProcessed?: () => void;
}

export default function A5ReceiptReader({
  trip,
  onUpdateTrip,
  onNextStep,
  onPrevStep,
  autoProcessFile,
  onAutoProcessed
}: A5ReceiptReaderProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>(trip?.receipts || []);
  const [dragActive, setDragActive] = useState(false);

  // Drag-and-drop file upload handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadReceipt(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await uploadReceipt(e.target.files[0]);
    }
  };

  // เรียก AI อ่านใบเสร็จจาก base64 ที่มีอยู่แล้ว แล้วเพิ่มเข้ารายการ — ใช้ร่วมกันทั้งอัปโหลดมือและ auto-process จากหน้าแรก
  const parseReceiptData = async (fileData: string, mimeType: string, fileName: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/a5-parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData, mimeType, fileName })
      });

      const result = await res.json();
      if (result.success && result.data) {
        const parsed = result.data;
        const newReceipt: Receipt = {
          id: `rec-${Date.now()}`,
          fileName,
          merchantName: parsed.merchantName || 'ร้านค้า',
          date: parsed.date || new Date().toISOString().split('T')[0],
          currency: parsed.currency || 'THB',
          subtotal: parsed.subtotal || parsed.total,
          vat: parsed.vat || 0,
          total: parsed.total,
          confidenceScore: parsed.qualityScore || 90,
          status: parsed.qualityScore && parsed.qualityScore < 70 ? 'blurry' : 'clear',
          items: (parsed.items || []).map((item: any) => ({
            description: item.description,
            amount: item.amount,
            glCode: item.glCode,
            glName: GL_CODES.find((g) => g.code === item.glCode)?.name || 'ค่าใช้จ่ายทั่วไป'
          }))
        };

        setReceipts((prev) => [...prev, newReceipt]);
      }
    } catch (e) {
      console.error("Failed to parse receipt with AI", e);
    } finally {
      setLoading(false);
    }
  };

  const uploadReceipt = async (file: File) => {
    const base64 = await toBase64(file);
    await parseReceiptData(base64.split(',')[1], file.type, file.name);
  };

  // ไฟล์ที่ผู้ใช้เลือก "ใช้เอกสาร" มาจากหน้าแรก (มี base64 อยู่แล้ว ไม่ต้องอ่านไฟล์ใหม่) — ประมวลผลทันทีที่เปิดหน้านี้ เสมือนลากไฟล์นี้มาวางเอง
  useEffect(() => {
    if (!autoProcessFile) return;
    parseReceiptData(autoProcessFile.fileData, autoProcessFile.mimeType, autoProcessFile.fileName).finally(() =>
      onAutoProcessed?.()
    );
  }, [autoProcessFile]);

  const useSampleReceipts = () => {
    setReceipts(SAMPLE_RECEIPTS as Receipt[]);
  };

  const removeReceipt = (id: string) => {
    setReceipts(receipts.filter((r) => r.id !== id));
  };

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });

  // Handle manual GL Code adjustments for low confidence
  const handleGlCodeChange = (receiptId: string, itemIdx: number, newCode: string) => {
    const updated = receipts.map((rec) => {
      if (rec.id === receiptId) {
        const updatedItems = [...rec.items];
        updatedItems[itemIdx] = {
          ...updatedItems[itemIdx],
          glCode: newCode,
          glName: GL_CODES.find((g) => g.code === newCode)?.name || 'ค่าใช้จ่าย'
        };
        return { ...rec, items: updatedItems };
      }
      return rec;
    });
    setReceipts(updated);
  };

  // Compile totals per GL Code from receipts (Actual Expenses)
  const getActualTotalsByGl = () => {
    const map: Record<string, number> = {};
    receipts.forEach((rec) => {
      rec.items.forEach((item) => {
        // Simple mock currency exchange JPY to THB (e.g. 1 JPY = 0.22 THB) for comparison
        const rate = rec.currency === 'JPY' ? 0.22 : rec.currency === 'USD' ? 33.5 : 1.0;
        const valueInThb = item.amount * rate;
        map[item.glCode] = (map[item.glCode] || 0) + valueInThb;
      });
    });
    return map;
  };

  const actualTotals = getActualTotalsByGl();

  // Get approved values from trip plan for comparison
  const getApprovedBudgetList = () => {
    if (!trip) return [];
    const travelersCount = trip.travelers.length;
    const tripDays = trip.travelers[0]?.days || 5;

    if (trip.customBudgetItems && trip.customBudgetItems.length > 0) {
      const getItemAmount = (idOrLabelKeyword: string, defaultVal: number) => {
        const found = trip.customBudgetItems?.find(i => i.id === idOrLabelKeyword || i.label.includes(idOrLabelKeyword));
        return found ? found.amount : defaultVal;
      };

      const airfare = getItemAmount('flight', getItemAmount('ตั๋ว', trip.selectedFlight?.totalPrice || (20000 * travelersCount)));
      const accommodation = getItemAmount('accommodation', getItemAmount('ที่พัก', trip.travelers.reduce((sum, t) => sum + (t.maxAccommodationRate * (tripDays - 1)), 0)));
      const perDiem = getItemAmount('perDiem', getItemAmount('เบี้ยเลี้ยง', trip.travelers.reduce((sum, t) => sum + (t.perDiemRate * tripDays), 0)));
      const insurance = getItemAmount('insurance', getItemAmount('ประกัน', trip.selectedInsurance?.totalPrice || (950 * travelersCount)));
      const passportFee = getItemAmount('visa', getItemAmount('วีซ่า', 1500 * travelersCount));
      const otherFees = getItemAmount('transport', getItemAmount('พาหนะ', 2000 * travelersCount));

      return [
        { code: '5103010001', name: 'ค่าโดยสารเครื่องบินไปต่างประเทศ (Airfare)', approved: airfare },
        { code: '5103010002', name: 'ค่าที่พักในต่างประเทศ (Accommodation)', approved: accommodation },
        { code: '5103010003', name: 'ค่าเบี้ยเลี้ยงเดินทางต่างประเทศ (Per Diem)', approved: perDiem },
        { code: '5103010004', name: 'ค่าประกันภัยการเดินทาง (Travel Insurance)', approved: insurance },
        { code: '5103010005', name: 'ค่าธรรมเนียมหนังสือเดินทาง/วีซ่า (Passport/Visa Fee)', approved: passportFee },
        { code: '5103010006', name: 'ค่าพาหนะรับจ้างต่างประเทศ (Local Transport)', approved: otherFees }
      ];
    }

    const airfare = trip.selectedFlight?.totalPrice || (20000 * travelersCount);
    const insurance = trip.selectedInsurance?.totalPrice || (950 * travelersCount);
    const accommodation = trip.travelers.reduce((sum, t) => sum + (t.maxAccommodationRate * (tripDays - 1)), 0);
    const perDiem = trip.travelers.reduce((sum, t) => sum + (t.perDiemRate * tripDays), 0);
    const passportFee = 1500 * travelersCount;
    const otherFees = 2000 * travelersCount;

    return [
      { code: '5103010001', name: 'ค่าโดยสารเครื่องบินไปต่างประเทศ (Airfare)', approved: airfare },
      { code: '5103010002', name: 'ค่าที่พักในต่างประเทศ (Accommodation)', approved: accommodation },
      { code: '5103010003', name: 'ค่าเบี้ยเลี้ยงเดินทางต่างประเทศ (Per Diem)', approved: perDiem },
      { code: '5103010004', name: 'ค่าประกันภัยการเดินทาง (Travel Insurance)', approved: insurance },
      { code: '5103010005', name: 'ค่าธรรมเนียมหนังสือเดินทาง/วีซ่า (Passport/Visa Fee)', approved: passportFee },
      { code: '5103010006', name: 'ค่าพาหนะรับจ้างต่างประเทศ (Local Transport)', approved: otherFees }
    ];
  };

  const comparisonData = getApprovedBudgetList().map((item) => {
    const actual = Math.round(actualTotals[item.code] || 0);
    const diff = actual - item.approved;
    return { ...item, actual, diff };
  });

  const grandApproved = comparisonData.reduce((sum, i) => sum + i.approved, 0);
  const grandActual = comparisonData.reduce((sum, i) => sum + i.actual, 0);
  const grandDiff = grandActual - grandApproved;

  // Export actual summary report to Excel
  const handleExportComparisonExcel = () => {
    if (!trip) return;

    const dataRows = comparisonData.map((item) => ({
      'รหัส GL (GL Code)': item.code,
      'รายการวิเคราะห์ค่าใช้จ่าย': item.name,
      'วงเงินที่อนุมัติควบคุม (Approved Budget)': item.approved,
      'วงเงินจ่ายจริงจากใบเสร็จ (Actual Spend - THB)': item.actual,
      'ผลต่างความผันแปร (Variance)': item.diff,
      'การวิเคราะห์': item.diff > 0 ? 'จ่ายเกินส่วนควบคุม' : item.diff < 0 ? 'ประหยัดงบประมาณ' : 'เบิกตามงบ'
    }));

    // Add totals row
    dataRows.push({
      'รหัส GL (GL Code)': 'TOTALS',
      'รายการวิเคราะห์ค่าใช้จ่าย': 'สรุปยอดรวมค่าใช้จ่ายทริปต่างประเทศ',
      'วงเงินที่อนุมัติควบคุม (Approved Budget)': grandApproved,
      'วงเงินจ่ายจริงจากใบเสร็จ (Actual Spend - THB)': grandActual,
      'ผลต่างความผันแปร (Variance)': grandDiff,
      'การวิเคราะห์': grandDiff > 0 ? 'ต้องขออนุมัติสมทบจ่ายเพิ่ม' : 'ส่งคืนเงินเหลือเข้าระเบียบ'
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'สรุปรายการจ่ายจริงเทียบอนุมัติ');

    XLSX.writeFile(
      workbook,
      `Actual_Expense_Summary_Trip_${trip.country || trip.destinationProvince || trip.location}_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  };

  const handleFinishClearing = () => {
    if (!trip) return;

    const updatedTrip: TripPlan = {
      ...trip,
      receipts,
      status: 'TRIP_CLEARED' // Closes the workflow loop, final state
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
            <ReceiptIcon className="text-blue-600 animate-pulse" size={22} />
            {t('a5.heading')}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {t('a5.subheading')}
          </p>
        </div>
        <button
          onClick={useSampleReceipts}
          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-750 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
        >
          <Sparkles size={13} />
          {t('a5.uploadSampleReceipts')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Upload Zone & Receipt Items */}
        <div className="lg:col-span-1 space-y-5">
          <h3 className="text-xs font-bold text-slate-950">{t('a5.uploadStepTitle')}</h3>

          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer relative ${
              dragActive
                ? 'border-blue-500 bg-blue-50/30'
                : 'border-slate-250 bg-slate-50 hover:bg-slate-100/70'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              accept="image/*,application/pdf"
            />
            <div className="space-y-2">
              <Upload className="mx-auto text-blue-600" size={24} />
              <p className="text-xs font-bold text-slate-800">{t('a5.dropOrScan')}</p>
              <p className="text-2xs text-slate-500 font-medium">{t('a5.merchantAnalysis')}</p>
            </div>
          </div>

          {loading && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center gap-2 text-xs text-slate-600 font-bold">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span>{t('a5.ocrInProgress')}</span>
            </div>
          )}

          {/* List of scanned receipts */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900">{t('a5.receiptsInSystem', { count: receipts.length })}</h4>
            {receipts.length === 0 ? (
              <p className="text-2xs text-slate-400 italic">{t('a5.noReceiptsYet')}</p>
            ) : (
              <div className="space-y-3 max-h-[350px] overflow-y-auto">
                {receipts.map((rec) => (
                  <div key={rec.id} className="p-3.5 bg-white border border-slate-150 rounded-xl space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="space-y-0.5">
                        <span className="font-bold text-xs text-slate-900">{rec.merchantName}</span>
                        <p className="text-2xs text-slate-400">{rec.fileName} • {rec.date}</p>
                      </div>
                      <button
                        onClick={() => removeReceipt(rec.id)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Extracted items mapping */}
                    <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                      {rec.items.map((item, itemIdx) => {
                        const isLowConf = rec.confidenceScore < 80;
                        return (
                          <div key={itemIdx} className="space-y-1 text-2xs">
                            <div className="flex justify-between text-slate-700 font-medium">
                              <span>• {item.description}</span>
                              <span>
                                {rec.currency} {item.amount.toLocaleString()}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-1">
                              <span className="text-3xs text-slate-500 font-bold uppercase">{t('a5.glCategory')}</span>
                              <select
                                value={item.glCode}
                                onChange={(e) => handleGlCodeChange(rec.id, itemIdx, e.target.value)}
                                className={`px-1.5 py-0.5 border rounded-md text-3xs bg-white focus:outline-hidden ${
                                  isLowConf ? 'border-amber-400 bg-amber-50/10' : 'border-slate-200'
                                }`}
                              >
                                {GL_CODES.map((g) => (
                                  <option key={g.code} value={g.code}>
                                    {g.code} ({g.name.split(' (')[0]})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {isLowConf && (
                              <div className="flex items-center gap-1 text-3xs text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded-md mt-1">
                                <AlertCircle size={8} /> {t('a5.lowConfidence', { score: rec.confidenceScore })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Actual vs. Approved Comparison */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-950 flex items-center gap-1.5">
              <FileSpreadsheet className="text-emerald-600 shrink-0" size={16} />
              {t('a5.comparisonTableTitle')}
            </h3>
            <button
              onClick={handleExportComparisonExcel}
              disabled={receipts.length === 0}
              className="self-start sm:self-auto shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-2xs font-bold flex items-center gap-1 shadow-xs transition-all disabled:opacity-45"
            >
              <Download size={12} />
              {t('a5.exportExcel')}
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[520px]">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <th className="p-3">{t('a5.colGlCode')}</th>
                  <th className="p-3 text-right">{t('a5.colApproved')}</th>
                  <th className="p-3 text-right">{t('a5.colActual')}</th>
                  <th className="p-3 text-right">{t('a5.colVariance')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150">
                {comparisonData.map((item) => (
                  <tr key={item.code} className="hover:bg-slate-50/50">
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{item.name.split(' (')[0]}</div>
                      <div className="text-3xs text-slate-400 font-mono mt-0.5">GL Code: {item.code}</div>
                    </td>
                    <td className="p-3 text-right text-slate-800">฿{item.approved.toLocaleString()}</td>
                    <td className="p-3 text-right text-slate-900 font-semibold">฿{item.actual.toLocaleString()}</td>
                    <td className="p-3 text-right">
                      {item.diff === 0 ? (
                        <span className="text-slate-500 font-medium">-</span>
                      ) : item.diff < 0 ? (
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md inline-flex items-center gap-0.5">
                          <TrendingDown size={11} /> ฿{Math.abs(item.diff).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-red-700 font-bold bg-red-50 px-2 py-0.5 rounded-md inline-flex items-center gap-0.5">
                          <TrendingUp size={11} /> +฿{item.diff.toLocaleString()}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold text-sm">
                  <td className="p-3 text-slate-900">{t('a5.grandTotalLabel')}</td>
                  <td className="p-3 text-right text-slate-800">฿{grandApproved.toLocaleString()}</td>
                  <td className="p-3 text-right text-blue-950">฿{grandActual.toLocaleString()}</td>
                  <td className="p-3 text-right">
                    {grandDiff === 0 ? (
                      <span className="text-slate-500 font-bold">-</span>
                    ) : grandDiff < 0 ? (
                      <span className="text-emerald-800">{t('a5.returnAdvance')} ฿{Math.abs(grandDiff).toLocaleString()}</span>
                    ) : (
                      <span className="text-red-800">{t('a5.needMoreReimbursement')} ฿{grandDiff.toLocaleString()}</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Quick clearing message based on workflow results */}
          {receipts.length > 0 && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 text-xs text-emerald-900 leading-relaxed font-medium">
              <span className="font-bold flex items-center gap-1.5 text-emerald-800">
                <Check size={16} /> {t('a5.analysisSavedTitle')}
              </span>
              <p className="text-slate-700">
                {grandDiff < 0 ? (
                  <>
                    {t('a5.underBudgetLine1', { actual: grandActual.toLocaleString(), approved: grandApproved.toLocaleString() })}
                    <br />
                    {t('a5.underBudgetLine2', { saved: Math.abs(grandDiff).toLocaleString() })}
                  </>
                ) : (
                  <>
                    {t('a5.overBudgetLine1', { actual: grandActual.toLocaleString(), approved: grandApproved.toLocaleString() })}
                    <br />
                    {t('a5.overBudgetLine2', { extra: grandDiff.toLocaleString() })}
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer controls */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={onPrevStep}
          className="w-full sm:w-auto px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer order-2 sm:order-1"
        >
          {t('a5.backToEPaymentMapping')}
        </button>

        <button
          id="btn-confirm-a5"
          type="button"
          onClick={handleFinishClearing}
          disabled={receipts.length === 0}
          className="w-full sm:w-auto justify-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-250 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg shadow-md shadow-blue-950/20 transition-all flex items-center gap-1 cursor-pointer order-1 sm:order-2"
        >
          {t('a5.finishClearing')}
          <Check size={14} />
        </button>
      </div>
    </div>
  );
}
