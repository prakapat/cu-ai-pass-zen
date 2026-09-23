/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowRight, Plane, XCircle, RotateCcw, Trash2, FileCheck2 } from 'lucide-react';
import { TripPlan, TripStatus } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

type DocumentType = 'A1_INVITATION' | 'A4_APPROVAL' | 'A5_RECEIPT' | 'IRRELEVANT';

interface TripTableProps {
  trips: TripPlan[];
  selectedTrip: TripPlan | null;
  onSelectTrip: (trip: TripPlan) => void;
  onCancelTrip: (trip: TripPlan) => void;
  onReactivateTrip: (trip: TripPlan) => void;
  onDeleteTrip: (trip: TripPlan) => void;
  // ระบุเมื่อตารางนี้แสดงผลจากการอัปโหลดเอกสาร (หน้าแรก) — เปิดคอลัมน์ "ใช้เอกสาร" ให้เลือกนำเอกสารไปใช้กับคำขอที่มีอยู่แล้ว
  documentType?: DocumentType | null;
  onUseDocumentForTrip?: (trip: TripPlan, step: 'A1' | 'A4' | 'A5') => void;
  emptyTitle?: string;
  emptySubtitle?: string;
}

// เอกสารประเภท A1 (หนังสือเชิญ/ขอเดินทาง) ใช้ได้กับคำขอที่อยู่ขั้น A1-A3 เท่านั้น (นำไปที่ A1 เสมอ)
// เอกสารประเภท A4/A5 ใช้ได้เฉพาะตอนคำขอนั้นอยู่ตรงขั้นตอนเป๊ะๆเท่านั้น ไม่มีข้อยกเว้นข้ามขั้น
function getDocumentAction(
  documentType: DocumentType,
  status: TripStatus
): { step: 'A1' | 'A4' | 'A5'; warnPastStep: boolean } | null {
  if (documentType === 'A1_INVITATION') {
    if (status === 'A1_DRAFT') return { step: 'A1', warnPastStep: false };
    if (status === 'A2_SEARCHING' || status === 'A3_MEMO_DRAFTED') return { step: 'A1', warnPastStep: true };
    return null;
  }
  if (documentType === 'A4_APPROVAL') {
    return status === 'A4_EPAYMENT_PREP' ? { step: 'A4', warnPastStep: false } : null;
  }
  if (documentType === 'A5_RECEIPT') {
    return status === 'A5_UPLOADING_RECEIPTS' ? { step: 'A5', warnPastStep: false } : null;
  }
  return null;
}

// รับ t เป็นพารามิเตอร์แทนการเรียก useLanguage() ตรงๆ เพราะฟังก์ชันนี้เป็น plain function ไม่ใช่ component/hook
// เรียกจากหลายที่ (TripTable เอง, AgentChatPage) — ผู้เรียกต้องส่ง t ของตัวเองมาเสมอ
export function getStatusBadge(status: TripStatus, t: (key: string) => string) {
  switch (status) {
    case 'A1_DRAFT':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          {t('status.A1_DRAFT')}
        </span>
      );
    case 'A2_SEARCHING':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
          {t('status.A2_SEARCHING')}
        </span>
      );
    case 'A3_MEMO_DRAFTED':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
          {t('status.A3_MEMO_DRAFTED')}
        </span>
      );
    case 'A3_A4_WAITING_SIGNATURE':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200">
          {t('status.A3_A4_WAITING_SIGNATURE')}
        </span>
      );
    case 'A4_EPAYMENT_PREP':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
          {t('status.A4_EPAYMENT_PREP')}
        </span>
      );
    case 'A4_EXPORTED':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          {t('status.A4_EXPORTED')}
        </span>
      );
    case 'FIORI_PENDING':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-pink-50 text-pink-800 border border-pink-200">
          {t('status.FIORI_PENDING')}
        </span>
      );
    case 'WAITING_CASH_ADVANCE':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-800 border border-violet-200">
          {t('status.WAITING_CASH_ADVANCE')}
        </span>
      );
    case 'A5_UPLOADING_RECEIPTS':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-800 border border-orange-200">
          {t('status.A5_UPLOADING_RECEIPTS')}
        </span>
      );
    case 'TRIP_CLEARED':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
          {t('status.TRIP_CLEARED')}
        </span>
      );
    default:
      return null;
  }
}

export default function TripTable({
  trips,
  selectedTrip,
  onSelectTrip,
  onCancelTrip,
  onReactivateTrip,
  onDeleteTrip,
  documentType,
  onUseDocumentForTrip,
  emptyTitle,
  emptySubtitle
}: TripTableProps) {
  const { t, lang } = useLanguage();
  const showDocumentColumn = !!documentType && documentType !== 'IRRELEVANT' && !!onUseDocumentForTrip;

  const handleCancelClick = (e: React.MouseEvent, trip: TripPlan) => {
    e.stopPropagation();
    if (window.confirm(t('workflow.confirmCancel', { name: trip.projectName || t('workflow.thisItem') }))) {
      onCancelTrip(trip);
    }
  };

  const handleReactivateClick = (e: React.MouseEvent, trip: TripPlan) => {
    e.stopPropagation();
    onReactivateTrip(trip);
  };

  const handleDeleteClick = (e: React.MouseEvent, trip: TripPlan) => {
    e.stopPropagation();
    onDeleteTrip(trip);
  };

  const handleUseDocumentClick = (e: React.MouseEvent, trip: TripPlan, action: { step: 'A1' | 'A4' | 'A5'; warnPastStep: boolean }) => {
    e.stopPropagation();
    if (action.warnPastStep) {
      if (!window.confirm(t('table.confirmPastStep'))) return;
    }
    onUseDocumentForTrip?.(trip, action.step);
  };

  if (trips.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400">
        <Plane size={48} className="mx-auto mb-3 text-slate-300 animate-pulse" />
        <p className="text-sm font-medium">{emptyTitle ?? t('table.emptyTitle')}</p>
        <p className="text-xs mt-1">{emptySubtitle ?? t('table.emptySubtitle')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 text-slate-650 uppercase text-2xs font-bold tracking-wider border-b border-slate-200">
            <th className="py-3 px-6">{t('table.projectCode')}</th>
            <th className="py-3 px-6">{t('table.destination')}</th>
            <th className="py-3 px-6">{t('table.travelDate')}</th>
            <th className="py-3 px-6">{t('table.totalBudget')}</th>
            <th className="py-3 px-6">{t('table.statusStep')}</th>
            {showDocumentColumn && <th className="py-3 px-6">{t('table.useDocument')}</th>}
            <th className="py-3 px-6 text-right">{t('table.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {trips.map((trip) => {
            const isSelected = selectedTrip?.id === trip.id;
            const canCancel = !trip.isCancelled && trip.status !== 'TRIP_CLEARED';
            const documentAction =
              showDocumentColumn && documentType ? getDocumentAction(documentType, trip.status) : null;
            return (
              <tr
                key={trip.id}
                className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                  trip.isCancelled ? 'opacity-50' : ''
                } ${isSelected ? 'bg-blue-50/30 hover:bg-blue-50/40' : ''}`}
                onClick={() => onSelectTrip(trip)}
              >
                <td className="py-4 px-6 border-b border-slate-100">
                  <div className="font-bold text-sm text-slate-950 line-clamp-1">
                    {trip.projectName}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 font-medium">
                    {t('workflow.travelersCount', { count: trip.travelers.length })} • {trip.budgetCode || t('table.noBudgetCode')}
                  </div>
                </td>
                <td className="py-4 px-6 text-sm text-slate-800 border-b border-slate-100">
                  {trip.tripType === 'DOMESTIC'
                    ? `${trip.location}, ${t('workflow.province')}${trip.destinationProvince || '-'} (${t('table.domestic')})`
                    : `${trip.location}, ${t('workflow.country')}${trip.country || '-'} (${t('table.group')} ${trip.countryGroup ?? '-'})`}
                </td>
                <td className="py-4 px-6 text-sm text-slate-700 border-b border-slate-100">
                  <div className="font-bold text-xs">
                    {new Date(trip.startDate).toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </div>
                  <div className="text-2xs text-slate-400 mt-0.5 font-medium">
                    {t('table.until')} {new Date(trip.endDate).toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </div>
                </td>
                <td className="py-4 px-6 text-sm font-bold text-slate-900 border-b border-slate-100 font-mono">
                  ฿{trip.estimatedBudget.toLocaleString()}
                </td>
                <td className="py-4 px-6 text-sm border-b border-slate-100">
                  {trip.isCancelled ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-800 border border-red-200">
                      {t('workflow.cancelled')}
                    </span>
                  ) : (
                    getStatusBadge(trip.status, t)
                  )}
                </td>
                {showDocumentColumn && (
                  <td className="py-4 px-6 text-sm border-b border-slate-100">
                    {documentAction ? (
                      <button
                        onClick={(e) => handleUseDocumentClick(e, trip, documentAction)}
                        title={t('table.useDocumentTitle', { step: documentAction.step })}
                        className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-all bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
                      >
                        <FileCheck2 size={12} />
                        {documentAction.step}
                      </button>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                )}
                <td className="py-4 px-6 text-right text-sm border-b border-slate-100">
                  <div className="inline-flex items-center gap-2">
                    {trip.isCancelled ? (
                      <button
                        onClick={(e) => handleReactivateClick(e, trip)}
                        title={t('table.reactivateTitle')}
                        className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-all bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                      >
                        <RotateCcw size={12} />
                        {t('table.useAction')}
                      </button>
                    ) : (
                      <>
                        {canCancel && (
                          <button
                            onClick={(e) => handleCancelClick(e, trip)}
                            title={t('table.cancelTitle')}
                            className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-all bg-white hover:bg-red-50 text-red-600 border border-red-200"
                          >
                            <XCircle size={12} />
                            {t('table.cancelAction')}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTrip(trip);
                          }}
                          className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {isSelected ? t('table.opening') : t('table.openAction')}
                          <ArrowRight size={12} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => handleDeleteClick(e, trip)}
                      title={t('table.deleteTitle')}
                      className="inline-flex items-center justify-center p-1.5 rounded-lg transition-all bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
