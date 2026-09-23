/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Mail,
  Download,
  Copy,
  Sparkles,
  ArrowRight,
  Printer,
  Check,
  FileCheck2,
  ShieldAlert,
  DownloadCloud
} from 'lucide-react';
import { TripPlan, MemoDraft, VISA_REQUIRED_COUNTRIES } from '../types';
import { generateOfficialMemoHtml, generateExpenseMemoHtml } from '../utils/memoGenerator';
import { buildTravelMemoDocx, buildExpenseMemoDocx, downloadDocx } from '../utils/docxGenerator';
import { useLanguage } from '../i18n/LanguageContext';

interface A3DocumentDraftingProps {
  trip: TripPlan | null;
  onUpdateTrip: (updated: TripPlan) => void;
  onNextStep: () => void;
  onPrevStep: () => void;
}

const todayIso = () => new Date().toISOString().split('T')[0];

export default function A3DocumentDrafting({
  trip,
  onUpdateTrip,
  onNextStep,
  onPrevStep
}: A3DocumentDraftingProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [activeTab, setActiveTab] = useState<'travel' | 'expense'>('travel');

  const isVisaRequiredCountry = VISA_REQUIRED_COUNTRIES.includes(trip?.country || '');
  // เคยกด "ยืนยันข้อมูลและร่างบันทึก" สำเร็จมาก่อนหรือไม่ — เช็คจาก trip.memo ที่บันทึกไว้ใน DB ตรงๆ (อัปเดตทันทีหลัง onUpdateTrip)
  const isDrafted = !!trip?.memo?.contentHtml;

  // เอกสารขอเพิ่มเติม — ไม่แยกเป็นบันทึกฉบับอื่นอีกต่อไป แค่แทรกข้อความ/ค่าใช้จ่ายเข้า 2 ฉบับหลัก
  const [requestPassport, setRequestPassport] = useState<boolean>(trip?.memo?.requestPassport ?? false);
  const [requestVisa, setRequestVisa] = useState<boolean>(trip?.memo?.requestVisa ?? isVisaRequiredCountry);

  // Header ของบันทึกข้อความ — input จริงทั้งหมด ไม่ hardcode
  const [หน่วยงาน, setหน่วยงาน] = useState(trip?.memo?.หน่วยงาน || '');
  const [เลขที่หนังสือ, setเลขที่หนังสือ] = useState(trip?.memo?.เลขที่หนังสือ || '');
  const [วันที่บันทึก, setวันที่บันทึก] = useState(trip?.memo?.วันที่บันทึก || todayIso());
  const [เรียนถึง, setเรียนถึง] = useState(trip?.memo?.เรียนถึง || 'อธิการบดี');
  const [ผ่าน, setผ่าน] = useState(trip?.memo?.ผ่าน || '');
  const [วัตถุประสงค์เพิ่มเติม, setวัตถุประสงค์เพิ่มเติม] = useState(trip?.memo?.วัตถุประสงค์เพิ่มเติม || '');

  // รหัสงบประมาณ 4 ส่วนตามระบบบัญชีจริงของมหาวิทยาลัย
  const [รหัสกองทุน, setรหัสกองทุน] = useState(trip?.memo?.รหัสกองทุน || trip?.budgetCode || '');
  const [รหัสศูนย์ต้นทุน, setรหัสศูนย์ต้นทุน] = useState(trip?.memo?.รหัสศูนย์ต้นทุน || '');
  const [รหัสเขตตามหน้าที่, setรหัสเขตตามหน้าที่] = useState(trip?.memo?.รหัสเขตตามหน้าที่ || '');
  const [รหัสภาระผูกพัน, setรหัสภาระผูกพัน] = useState(trip?.memo?.รหัสภาระผูกพัน || '');

  // ย่อหน้าเหตุผล/ความสำคัญที่ AI ร่าง — ส่วนเดียวที่ให้ AI แต่ง (โครงสร้าง/ตัวเลขที่เหลือคำนวณแบบ deterministic เสมอ)
  const [justificationText, setJustificationText] = useState(trip?.memo?.justificationText || '');

  // "ต่างประเทศ" ต่อท้ายเฉพาะทริปต่างประเทศ — เดิม hardcode ทุกทริป ทำให้ทริปในประเทศขึ้นเรื่อง/อีเมลผิดว่าไปปฏิบัติงานต่างประเทศ
  const travelScopeText = trip?.tripType === 'DOMESTIC' ? '' : 'ต่างประเทศ';
  const locationPhrase = trip ? (trip.tripType === 'DOMESTIC' ? trip.location : `${trip.location}, ประเทศ${trip.country}`) : '';

  const [subject, setSubject] = useState(trip?.memo?.subject || `ขออนุมัติเดินทางไปปฏิบัติงาน${travelScopeText}`);
  const [expenseSubject, setExpenseSubject] = useState(trip?.memo?.expenseSubject || `ขออนุมัติค่าใช้จ่ายในการเดินทางไปปฏิบัติงาน${travelScopeText}`);
  const [contentHtml, setContentHtml] = useState(trip?.memo?.contentHtml || (trip ? generateOfficialMemoHtml(trip) : ''));
  const [expenseContentHtml, setExpenseContentHtml] = useState(trip?.memo?.expenseContentHtml || (trip ? generateExpenseMemoHtml(trip) : ''));

  const [emailSubject, setEmailSubject] = useState(
    trip?.memo?.emailSubject || (trip ? `[แจ้งพิจารณา] บันทึกขออนุมัติเดินทางทริป ${trip.projectName} - ${trip.location}` : '')
  );
  const [emailBody, setEmailBody] = useState(
    trip?.memo?.emailBody ||
      (trip
        ? `เรียน ทีมงานที่เกี่ยวข้อง,\n\nระบบ AI Agent ได้จัดร่างบันทึกข้อความขออนุมัติเดินทางไปราชการ${travelScopeText}เรียบร้อยแล้ว\nชื่องาน: ${trip.projectName}\nปลายทาง: ${locationPhrase}\nยอดงบประมาณประมาณการรวม: ${trip.estimatedBudget?.toLocaleString()} บาท\n\nสามารถดาวน์โหลดไฟล์เอกสาร .docx เพื่อนำไปลงนามเสนอผู้บริหารผ่านระบบ CU LessPaper หรือเสนอเซ็นสดต่อไป`
        : '')
  );

  // Regenerate ทั้ง 2 preview แบบ real-time ทุกครั้งที่แก้ input หรือ budget items เปลี่ยน
  useEffect(() => {
    if (!trip) return;
    const currentMemo: MemoDraft = {
      ...(trip.memo as MemoDraft),
      หน่วยงาน,
      เลขที่หนังสือ,
      วันที่บันทึก,
      เรียนถึง,
      ผ่าน,
      รหัสกองทุน,
      รหัสศูนย์ต้นทุน,
      รหัสเขตตามหน้าที่,
      รหัสภาระผูกพัน,
      วัตถุประสงค์เพิ่มเติม,
      justificationText,
      subject,
      expenseSubject,
      requestPassport,
      requestVisa
    };
    const previewTrip: TripPlan = { ...trip, memo: currentMemo };
    setContentHtml(generateOfficialMemoHtml(previewTrip));
    setExpenseContentHtml(generateExpenseMemoHtml(previewTrip));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    หน่วยงาน,
    เลขที่หนังสือ,
    วันที่บันทึก,
    เรียนถึง,
    ผ่าน,
    รหัสกองทุน,
    รหัสศูนย์ต้นทุน,
    รหัสเขตตามหน้าที่,
    รหัสภาระผูกพัน,
    วัตถุประสงค์เพิ่มเติม,
    justificationText,
    subject,
    expenseSubject,
    requestPassport,
    requestVisa,
    trip
  ]);

  useEffect(() => {
    if (trip?.country && trip.memo?.requestVisa === undefined) {
      setRequestVisa(VISA_REQUIRED_COUNTRIES.includes(trip.country));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.country]);

  // ยืนยันข้อมูล + ร่างย่อหน้าเหตุผล/อีเมลด้วย AI แล้วบันทึกบันทึกทั้ง 2 ฉบับ (เดินทาง+ค่าใช้จ่าย) ลง database ทันที
  // ไม่รอจนกว่าจะกด "ดาวน์โหลดและส่งขออนุมัตินอกระบบ" (ซึ่งเปลี่ยน status ไปขั้นตอนถัดไปด้วย) เพื่อให้ user กลับมาดูดราฟต์ที่ยังไม่ยืนยันสำเร็จได้เสมอ
  // ใช้ค่า justification/email ที่ AI ตอบกลับมาสร้าง contentHtml/expenseContentHtml ตรงๆ ในฟังก์ชันนี้เลย ไม่รอ useEffect preview
  // (state หลัง setJustificationText ยังไม่อัปเดตจน re-render รอบถัดไป อ่านจาก state ตรงนี้จะได้ค่าเก่า)
  const handleConfirmAndDraft = async () => {
    if (!trip) return;
    if (!หน่วยงาน.trim()) {
      setError(t('a3.fillDepartmentFirstDraft'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/agent/a3-draft-memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripPlan: trip,
          หน่วยงาน,
          วัตถุประสงค์เพิ่มเติม
        })
      });

      const result = await res.json();
      const nextJustification = (result.success && result.data?.justificationText) || justificationText;
      const nextEmailSubject = (result.success && result.data?.emailSubject) || emailSubject;
      const nextEmailBody = (result.success && result.data?.emailBody) || emailBody;

      setJustificationText(nextJustification);
      setEmailSubject(nextEmailSubject);
      setEmailBody(nextEmailBody);

      const draftMemo = {
        หน่วยงาน,
        เลขที่หนังสือ,
        วันที่บันทึก,
        เรียนถึง,
        ผ่าน,
        รหัสกองทุน,
        รหัสศูนย์ต้นทุน,
        รหัสเขตตามหน้าที่,
        รหัสภาระผูกพัน,
        วัตถุประสงค์เพิ่มเติม,
        justificationText: nextJustification,
        subject,
        expenseSubject,
        requestPassport,
        requestVisa
      };
      const previewTrip: TripPlan = { ...trip, memo: draftMemo as MemoDraft };

      onUpdateTrip({
        ...trip,
        memo: {
          ...draftMemo,
          contentHtml: generateOfficialMemoHtml(previewTrip),
          expenseContentHtml: generateExpenseMemoHtml(previewTrip),
          emailSubject: nextEmailSubject,
          emailBody: nextEmailBody,
          generatedDate: new Date().toLocaleDateString('th-TH')
        }
      });
    } catch (e) {
      console.error('Drafting error', e);
      setError(t('a3.draftError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(`${emailSubject}\n\n${emailBody}`);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleDownloadTravelDocx = async () => {
    if (!trip) return;
    const doc = await buildTravelMemoDocx({ ...trip, memo: trip.memo as MemoDraft });
    await downloadDocx(doc, `1_บันทึกขออนุมัติเดินทาง_${trip.country || trip.destinationProvince || trip.location}.docx`);
  };

  const handleDownloadExpenseDocx = async () => {
    if (!trip) return;
    const doc = await buildExpenseMemoDocx({ ...trip, memo: trip.memo as MemoDraft });
    await downloadDocx(doc, `2_บันทึกขออนุมัติค่าใช้จ่าย_${trip.country || trip.destinationProvince || trip.location}.docx`);
  };

  const handleDownloadAllDocx = async () => {
    await handleDownloadTravelDocx();
    await handleDownloadExpenseDocx();
  };

  const handleProceedToWaitingSignature = () => {
    if (!trip) return;
    if (!หน่วยงาน.trim()) {
      setError(t('a3.fillDepartmentFirstProceed'));
      return;
    }
    setError(null);

    const finalMemo: MemoDraft = {
      หน่วยงาน,
      เลขที่หนังสือ,
      วันที่บันทึก,
      เรียนถึง,
      ผ่าน,
      รหัสกองทุน,
      รหัสศูนย์ต้นทุน,
      รหัสเขตตามหน้าที่,
      รหัสภาระผูกพัน,
      วัตถุประสงค์เพิ่มเติม,
      justificationText,
      subject,
      contentHtml,
      expenseSubject,
      expenseContentHtml,
      emailSubject,
      emailBody,
      generatedDate: new Date().toLocaleDateString('th-TH'),
      requestPassport,
      requestVisa
    };

    const updatedTrip: TripPlan = {
      ...trip,
      memo: finalMemo,
      status: 'A3_A4_WAITING_SIGNATURE'
    };

    onUpdateTrip(updatedTrip);
    onNextStep();
  };

  return (
    <div className="space-y-8">
      {/* Step Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-950 flex items-center gap-2">
            <FileText className="text-blue-600" size={22} />
            {t('a3.heading')}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {t('a3.subheading')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Inputs Panel */}
        <div className="lg:col-span-1 space-y-5 bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-2xs">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1">
            <Sparkles size={14} className="text-blue-600" />
            {t('a3.formTitle')}
          </h3>

          <div className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-bold text-slate-700">{t('a3.department')} <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={หน่วยงาน}
                onChange={(e) => setหน่วยงาน(e.target.value)}
                placeholder={t('a3.departmentPlaceholder')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">{t('a3.docNumber')}</label>
                <input
                  type="text"
                  value={เลขที่หนังสือ}
                  onChange={(e) => setเลขที่หนังสือ(e.target.value)}
                  placeholder={t('a3.docNumberPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-700">{t('a3.docDate')}</label>
                <input
                  type="date"
                  value={วันที่บันทึก}
                  onChange={(e) => setวันที่บันทึก(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700">{t('a3.attentionTo')}</label>
              <input
                type="text"
                value={เรียนถึง}
                onChange={(e) => setเรียนถึง(e.target.value)}
                placeholder={t('a3.attentionToPlaceholder')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700">{t('a3.throughApprover')}</label>
              <input
                type="text"
                value={ผ่าน}
                onChange={(e) => setผ่าน(e.target.value)}
                placeholder={t('a3.throughApproverPlaceholder')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden text-xs"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200">
              <label className="font-bold text-slate-700 block">{t('a3.budgetCodeLabel')}</label>
              <input type="text" value={รหัสกองทุน} onChange={(e) => setรหัสกองทุน(e.target.value)} placeholder={t('a3.fundCode')} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden text-xs" />
              <input type="text" value={รหัสศูนย์ต้นทุน} onChange={(e) => setรหัสศูนย์ต้นทุน(e.target.value)} placeholder={t('a3.costCenterCode')} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden text-xs" />
              <input type="text" value={รหัสเขตตามหน้าที่} onChange={(e) => setรหัสเขตตามหน้าที่(e.target.value)} placeholder={t('a3.functionalAreaCode')} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden text-xs" />
              <input type="text" value={รหัสภาระผูกพัน} onChange={(e) => setรหัสภาระผูกพัน(e.target.value)} placeholder={t('a3.commitmentCode')} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden text-xs" />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700">{t('a3.additionalPurpose')}</label>
              <textarea
                value={วัตถุประสงค์เพิ่มเติม}
                onChange={(e) => setวัตถุประสงค์เพิ่มเติม(e.target.value)}
                placeholder={t('a3.additionalPurposePlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden resize-none text-xs"
              />
            </div>

            {/* Additional Official Requests — inline text only, ไม่แยกเป็นบันทึกอีกฉบับ */}
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <FileCheck2 size={15} className="text-blue-600" />
                {t('a3.additionalRequests')}
              </label>

              <div className="p-3 bg-white border border-slate-200 rounded-lg hover:border-blue-300 transition-all">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requestPassport}
                    onChange={(e) => setRequestPassport(e.target.checked)}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="font-semibold text-slate-800 text-xs">
                    {t('a3.requestPassport')}
                  </span>
                </label>
              </div>

              <div className={`p-3 border rounded-lg transition-all space-y-1.5 ${isVisaRequiredCountry ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-slate-200 hover:border-blue-300'}`}>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requestVisa}
                    onChange={(e) => setRequestVisa(e.target.checked)}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="font-semibold text-slate-800 text-xs">{t('a3.requestVisa')}</span>
                      {isVisaRequiredCountry && (
                        <span className="px-2 py-0.5 rounded-full text-3xs font-bold bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1 shadow-2xs">
                          <Sparkles size={10} className="text-amber-600" />
                          {t('a3.aiRecommendedFor', { country: trip?.country ?? '' })}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
                {isVisaRequiredCountry && (
                  <div className="text-3xs text-amber-900 bg-amber-100/80 p-2 rounded border border-amber-200 flex items-start gap-1.5 font-medium">
                    <ShieldAlert size={14} className="text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      {t('a3.visaRequiredNote', { country: trip?.country ?? '' })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {isDrafted && (
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-2xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <FileCheck2 size={14} />
                {t('a3.savedConfirmed')}
              </div>
            )}

            <button
              id="btn-confirm-draft-a3"
              type="button"
              onClick={handleConfirmAndDraft}
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md shadow-blue-950/10 transition-all flex items-center justify-center gap-1.5"
            >
              <Sparkles size={13} className={loading ? 'animate-spin text-blue-100' : ''} />
              {loading ? t('a3.drafting') : isDrafted ? t('a3.confirmAgain') : t('a3.confirmAndDraft')}
            </button>
          </div>
        </div>

        {/* Right Preview Panel */}
        <div className="lg:col-span-2 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
            <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
              <Printer size={16} className="text-slate-500" />
              {t('a3.aiOutputTitle')}
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={activeTab === 'travel' ? handleDownloadTravelDocx : handleDownloadExpenseDocx}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg text-2xs font-bold flex items-center gap-1 shadow-2xs transition-all"
              >
                <Download size={12} />
                {t('a3.downloadSelected')}
              </button>
              <button
                onClick={handleDownloadAllDocx}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-2xs font-bold flex items-center gap-1 shadow-md shadow-emerald-950/20 transition-all"
              >
                <DownloadCloud size={12} />
                {t('a3.downloadBoth')}
              </button>
            </div>
          </div>

          {/* 2-document Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('travel')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'travel' ? 'bg-blue-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileText size={14} />
              {t('a3.tabTravelMemo')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('expense')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'expense' ? 'bg-blue-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileCheck2 size={14} />
              {t('a3.tabExpenseMemo')}
            </button>
          </div>

          {loading ? (
            <div className="py-24 text-center space-y-4">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-500 font-medium">{t('a3.draftingInProgress')}</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-slate-100 p-4 sm:p-5 rounded-xl border border-slate-200 shadow-inner max-h-[520px] overflow-y-auto overflow-x-auto">
                <div
                  className="bg-white shadow-md p-6 sm:p-8 rounded-xs min-w-[600px] sm:min-w-0"
                  dangerouslySetInnerHTML={{ __html: activeTab === 'travel' ? contentHtml : expenseContentHtml }}
                />
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Mail size={14} className="text-slate-500 shrink-0" />
                    {t('a3.emailDraftTitle')}
                  </span>
                  <button
                    onClick={handleCopyEmail}
                    className="self-start sm:self-auto px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md text-2xs font-bold flex items-center gap-1 shadow-2xs transition-all shrink-0"
                  >
                    {copiedEmail ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                    {copiedEmail ? t('a3.copied') : t('a3.copyEmailText')}
                  </button>
                </div>
                <div className="p-5 text-xs space-y-3 font-mono text-slate-700">
                  <div>
                    <span className="font-semibold text-slate-900">{t('a3.emailSubjectLabel')}</span> {emailSubject}
                  </div>
                  <hr className="border-t border-slate-100" />
                  <div className="whitespace-pre-line leading-relaxed">{emailBody}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* On-screen custom error banner instead of alert */}
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-850 rounded-xl text-xs flex items-center gap-2">
          <ShieldAlert size={16} className="text-red-600 shrink-0" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={onPrevStep}
          className="w-full sm:w-auto px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all order-2 sm:order-1"
        >
          {t('a3.backToFlightInsurance')}
        </button>

        <button
          id="btn-confirm-a3"
          type="button"
          onClick={handleProceedToWaitingSignature}
          disabled={loading}
          className="w-full sm:w-auto justify-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-md shadow-blue-950/20 transition-all flex items-center gap-1 order-1 sm:order-2"
        >
          {t('a3.waitingSignatureOffSystem')}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
