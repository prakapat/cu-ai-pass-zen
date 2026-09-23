/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FileText,
  CheckCircle,
  Plus,
  Upload,
  Plane,
  Receipt,
  XCircle,
  AlertCircle,
  Sparkles,
  ListChecks,
  Lock,
  ShieldAlert
} from 'lucide-react';
import { TripPlan } from '../types';
import TripTable from './TripTable';
import { useLanguage } from '../i18n/LanguageContext';

export interface ParsedInvitationFile {
  fileName: string;
  mimeType: string;
  fileData: string;
}

type DocumentType = 'A1_INVITATION' | 'A4_APPROVAL' | 'A5_RECEIPT' | 'IRRELEVANT';

interface MisuseState {
  streak: number;
  total: number;
  accountAiLocked: boolean;
  pageLockedUntil: string | null;
}

interface LockNotice {
  type: 'page' | 'account';
  message: string;
  lockedUntil?: string;
}

interface DashboardOverviewProps {
  trips: TripPlan[];
  selectedTrip: TripPlan | null;
  onSelectTrip: (trip: TripPlan) => void;
  onCreateNewTrip: () => void;
  onCreateNewTripFromDocument: (extracted: any, files: ParsedInvitationFile[]) => Promise<void>;
  onUseDocumentForTrip: (trip: TripPlan, step: 'A1' | 'A4' | 'A5', files: ParsedInvitationFile[], extracted: any) => void;
  onCancelTrip: (trip: TripPlan) => void;
  onReactivateTrip: (trip: TripPlan) => void;
  onDeleteTrip: (trip: TripPlan) => void;
  onGoToRequestList: () => void;
}

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

// เอกสารเดียวกันมักถูกอัปโหลดซ้ำสำหรับงานประชุมประจำปีที่ชื่อโครงการซ้ำกันในแต่ละปี
// จึงต้องเทียบทั้งชื่อโครงการและวันจัดประชุม (ไม่ใช่ชื่อโครงการอย่างเดียว) เพื่อไม่ให้จับคู่ผิดปี/ผิดรอบ
function findMatchingTrips(extracted: any, trips: TripPlan[]): TripPlan[] {
  const name = (extracted?.projectName || '').trim().toLowerCase();
  if (!name) return [];
  const extractedStart = extracted?.startDate || '';

  return trips.filter((trip) => {
    const tripName = (trip.projectName || '').trim().toLowerCase();
    if (!tripName) return false;
    const nameMatches = tripName.includes(name) || name.includes(tripName);
    if (!nameMatches) return false;

    const sameStartDate =
      !!extractedStart && (extractedStart === trip.conferenceStartDate || extractedStart === trip.startDate);
    return sameStartDate;
  });
}

export default function DashboardOverview({
  trips,
  selectedTrip,
  onSelectTrip,
  onCreateNewTrip,
  onCreateNewTripFromDocument,
  onUseDocumentForTrip,
  onCancelTrip,
  onReactivateTrip,
  onDeleteTrip,
  onGoToRequestList
}: DashboardOverviewProps) {
  const { t } = useLanguage();
  const [dragActive, setDragActive] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [extracted, setExtracted] = useState<any | null>(null);
  const [pendingFiles, setPendingFiles] = useState<ParsedInvitationFile[]>([]);
  const [matchedTrips, setMatchedTrips] = useState<TripPlan[] | null>(null);
  const [irrelevantMisuse, setIrrelevantMisuse] = useState<MisuseState | null>(null);
  const [lockNotice, setLockNotice] = useState<LockNotice | null>(null);
  const [confirmingDuplicateCreate, setConfirmingDuplicateCreate] = useState(false);

  // Stats calculations (ยอดงบประมาณและรอเคลียร์เงิน ไม่รวมทริปที่ยกเลิกแล้ว)
  const totalTrips = trips.length;
  const activeBudget = trips
    .filter((t) => !t.isCancelled)
    .reduce((sum, t) => sum + t.estimatedBudget, 0);
  const pendingClearance = trips.filter(
    (t) => !t.isCancelled && t.status === 'A5_UPLOADING_RECEIPTS'
  ).length;
  const cancelledCount = trips.filter((t) => t.isCancelled).length;
  const approvedMemos = trips.filter(
    (t) =>
      t.status !== 'A1_DRAFT' &&
      t.status !== 'A2_SEARCHING' &&
      t.status !== 'A3_MEMO_DRAFTED'
  ).length;

  const resetCheck = () => {
    setExtracted(null);
    setMatchedTrips(null);
    setPendingFiles([]);
    setCheckError(null);
    setIsSimulated(false);
    setIrrelevantMisuse(null);
    setConfirmingDuplicateCreate(false);
    // ไม่ล้าง lockNotice ที่นี่ — ถ้ายังถูกล็อคอยู่จริงต้องยังเห็นแบนเนอร์ต่อไป จนกว่าจะลองอัปโหลดใหม่แล้วเช็คสถานะซ้ำ
  };

  const checkFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setChecking(true);
    setCheckError(null);
    setIrrelevantMisuse(null);
    setLockNotice(null);
    try {
      const encoded: ParsedInvitationFile[] = await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type,
          fileData: (await toBase64(file)).split(',')[1]
        }))
      );

      const res = await fetch('/api/agent/a1-parse-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: encoded })
      });
      const result = await res.json();

      if (res.status === 423) {
        setLockNotice(
          result.lockedUntil
            ? { type: 'page', message: result.error, lockedUntil: result.lockedUntil }
            : { type: 'account', message: result.error }
        );
        return;
      }

      setIsSimulated(!!result.simulated);

      if (result.success && result.data?.documentType === 'IRRELEVANT') {
        setIrrelevantMisuse(result.misuse || null);
        return;
      }

      if (result.success && result.data) {
        setPendingFiles(encoded);
        setExtracted(result.data);
        setMatchedTrips(findMatchingTrips(result.data, trips));
      } else {
        setCheckError(t('dashboard.readFailed'));
      }
    } catch (e) {
      console.error('Failed to check uploaded document', e);
      setCheckError(t('dashboard.readError'));
    } finally {
      setChecking(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await checkFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await checkFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const [creating, setCreating] = useState(false);

  const handleConfirmCreate = async () => {
    if (!extracted || creating) return;
    setCreating(true);
    setCheckError(null);
    try {
      await onCreateNewTripFromDocument(extracted, pendingFiles);
      resetCheck();
    } catch (e) {
      console.error('Failed to create trip from document', e);
      setCheckError(t('dashboard.createFailed', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setCreating(false);
    }
  };

  const handleUseDocument = (trip: TripPlan, step: 'A1' | 'A4' | 'A5') => {
    onUseDocumentForTrip(trip, step, pendingFiles, extracted);
    resetCheck();
  };

  const lockMinutesRemaining = (lockedUntil: string) =>
    Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000));

  return (
    <div className="space-y-8">
      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-3xs font-bold text-slate-500 uppercase tracking-wider">
              {t('dashboard.kpiTotalTrips')}
            </p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-1">{totalTrips}</h3>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 shrink-0">
            <Plane size={18} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-3xs font-bold text-slate-500 uppercase tracking-wider">
              {t('dashboard.kpiPlannedBudget')}
            </p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-1 font-mono truncate">
              ฿{activeBudget.toLocaleString()}
            </h3>
          </div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100 shrink-0">
            <CheckCircle size={18} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-3xs font-bold text-slate-500 uppercase tracking-wider">
              {t('dashboard.kpiApprovedMemos')}
            </p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-1">{approvedMemos}</h3>
          </div>
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg border border-amber-100 shrink-0">
            <FileText size={18} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-3xs font-bold text-slate-500 uppercase tracking-wider">
              {t('dashboard.kpiPendingClearance')}
            </p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-1">{pendingClearance}</h3>
          </div>
          <div className="p-2 bg-orange-50 text-orange-600 rounded-lg border border-orange-100 shrink-0">
            <Receipt size={18} />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-3xs font-bold text-slate-500 uppercase tracking-wider">
              {t('dashboard.kpiCancelled')}
            </p>
            <h3 className="text-xl font-extrabold text-slate-900 mt-1">{cancelledCount}</h3>
          </div>
          <div className="p-2 bg-red-50 text-red-600 rounded-lg border border-red-100 shrink-0">
            <XCircle size={18} />
          </div>
        </div>
      </div>

      {/* Document upload / smart lookup section */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-6 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{t('dashboard.uploadTitle')}</h2>
            <p className="text-xs text-slate-500">{t('dashboard.uploadSubtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onGoToRequestList}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <ListChecks size={14} />
              {t('dashboard.viewAllRequests')}
            </button>
            <button
              onClick={onCreateNewTrip}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <Plus size={14} />
              {t('dashboard.createWithoutDocument')}
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {lockNotice && (
            <div
              className={`flex items-start gap-2 p-4 rounded-lg text-xs font-semibold ${
                lockNotice.type === 'account'
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-amber-50 border border-amber-200 text-amber-900'
              }`}
            >
              {lockNotice.type === 'account' ? (
                <ShieldAlert size={16} className="text-red-600 shrink-0 mt-0.5" />
              ) : (
                <Lock size={16} className="text-amber-600 shrink-0 mt-0.5" />
              )}
              <span>
                {lockNotice.message}
                {lockNotice.type === 'page' && lockNotice.lockedUntil && (
                  <> {t('dashboard.lockMinutesRemaining', { minutes: lockMinutesRemaining(lockNotice.lockedUntil) })}</>
                )}
              </span>
            </div>
          )}

          {!extracted && !lockNotice && !irrelevantMisuse?.pageLockedUntil && !irrelevantMisuse?.accountAiLocked && (
            <div
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                dragActive
                  ? 'border-blue-500 bg-blue-50/30'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                id="dashboard-document-upload"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileInput}
                accept=".pdf,image/*"
                multiple
                disabled={checking}
              />
              <div className="space-y-2">
                <div className="mx-auto w-11 h-11 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center border border-blue-200">
                  {checking ? (
                    <Sparkles size={22} className="animate-spin" />
                  ) : (
                    <Upload size={22} />
                  )}
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {checking ? t('dashboard.aiReading') : t('dashboard.dropOrClick')}
                </p>
                <p className="text-2xs text-slate-500">{t('dashboard.supportedFormats')}</p>
              </div>
            </div>
          )}

          {checkError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-semibold">
              <AlertCircle size={14} className="text-red-600 shrink-0 mt-0.5" />
              <span>{checkError}</span>
            </div>
          )}

          {irrelevantMisuse && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-semibold">
                <AlertCircle size={14} className="text-red-600 shrink-0 mt-0.5" />
                <span>{t('dashboard.irrelevantDoc')}</span>
              </div>
              {irrelevantMisuse.accountAiLocked ? (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-2xs text-red-800 font-semibold">
                  <ShieldAlert size={14} className="text-red-600 shrink-0 mt-0.5" />
                  <span>{t('dashboard.accountLocked')}</span>
                </div>
              ) : irrelevantMisuse.pageLockedUntil ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-2xs text-amber-900 font-semibold">
                  <Lock size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <span>{t('dashboard.pageLocked', { total: irrelevantMisuse.total })}</span>
                </div>
              ) : (
                <button onClick={resetCheck} className="text-xs font-bold text-slate-500 hover:text-slate-800">
                  {t('dashboard.tryAnotherDoc')}
                </button>
              )}
            </div>
          )}

          {!checking && isSimulated && extracted && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-2xs text-amber-900">
              <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>{t('dashboard.simulatedModeTitle')}</strong> {t('dashboard.simulatedModeBody')}
              </span>
            </div>
          )}

          {extracted && matchedTrips && matchedTrips.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-semibold">
                <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>{t('dashboard.matchesFound', { count: matchedTrips.length, name: extracted.projectName })}</span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <TripTable
                  trips={matchedTrips}
                  selectedTrip={selectedTrip}
                  onSelectTrip={onSelectTrip}
                  onCancelTrip={onCancelTrip}
                  onReactivateTrip={onReactivateTrip}
                  onDeleteTrip={onDeleteTrip}
                  documentType={extracted.documentType}
                  onUseDocumentForTrip={handleUseDocument}
                />
              </div>

              {confirmingDuplicateCreate ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2.5">
                  <p className="text-xs font-bold text-amber-900">{t('dashboard.duplicateWarning')}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleConfirmCreate}
                      disabled={creating}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-2xs font-bold transition-all"
                    >
                      {creating ? t('common.loading') : t('dashboard.confirmCreateNew')}
                    </button>
                    <button
                      onClick={() => setConfirmingDuplicateCreate(false)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-2xs font-bold transition-all"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  <button onClick={resetCheck} className="text-xs font-bold text-slate-500 hover:text-slate-800">
                    {t('dashboard.clearAndRetry')}
                  </button>
                  <button
                    onClick={() => setConfirmingDuplicateCreate(true)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800"
                  >
                    {t('dashboard.createFromDoc')}
                  </button>
                </div>
              )}
            </div>
          )}

          {extracted && matchedTrips && matchedTrips.length === 0 && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                <AlertCircle size={14} className="text-blue-600 shrink-0 mt-0.5" />
                <span className="font-semibold">
                  {t('dashboard.noMatchFound')} <strong>{extracted.projectName || '-'}</strong>
                  {extracted.location ? ` • ${extracted.location}` : ''}
                  {extracted.startDate ? ` • ${extracted.startDate} ${t('table.until')} ${extracted.endDate || extracted.startDate}` : ''}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-slate-700">{t('dashboard.createFromDocQuestion')}</span>
                <button
                  onClick={handleConfirmCreate}
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <Plus size={14} />
                  {creating ? t('common.loading') : t('dashboard.createFromDocConfirm')}
                </button>
                <button
                  onClick={resetCheck}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-bold transition-all"
                >
                  {t('dashboard.notThisClearRetry')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
