/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Plane,
  FolderOpen,
  Sliders,
  CheckCircle,
  Clock,
  ArrowRight,
  Shield,
  FileText,
  Briefcase,
  Layers,
  ChevronRight,
  Sparkles,
  Award,
  LogOut,
  Lock,
  Home,
  AlertCircle,
  Pencil,
  XCircle,
  RotateCcw,
  Trash2,
  ShieldAlert
} from 'lucide-react';
import { TripPlan, TripStatus } from './types';
import { useLanguage } from './i18n/LanguageContext';
import DashboardOverview, { ParsedInvitationFile } from './components/DashboardOverview';
import RequestListPage from './components/RequestListPage';
import LoginPage from './components/LoginPage';
import A1RegulationReader from './components/A1RegulationReader';
import A2TravelSearch from './components/A2TravelSearch';
import A3DocumentDrafting from './components/A3DocumentDrafting';
import A4EPaymentPrep from './components/A4EPaymentPrep';
import A5ReceiptReader from './components/A5ReceiptReader';
import AgentChatPage, { ProposedTripDraft, ProposedTripUpdate, ChatTraveler } from './components/AgentChatPage';
import AdminPage from './components/AdminPage';
import UserProfilePage from './components/UserProfilePage';
import DeleteTripModal from './components/DeleteTripModal';

interface AuthUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
}

// สถานะทริปที่แต่ละ role เข้าถึงหน้าจอ Agent ได้ (สอดคล้องกับ requireRole ฝั่ง server.ts)
const ROLE_ALLOWED_STATUSES: Record<string, TripStatus[]> = {
  REQUESTER: ['A1_DRAFT', 'A2_SEARCHING', 'A3_MEMO_DRAFTED', 'A3_A4_WAITING_SIGNATURE', 'A5_UPLOADING_RECEIPTS', 'TRIP_CLEARED'],
  FINANCE_OFFICER: ['A4_EPAYMENT_PREP', 'A4_EXPORTED', 'FIORI_PENDING', 'WAITING_CASH_ADVANCE', 'A5_UPLOADING_RECEIPTS', 'TRIP_CLEARED'],
  APPROVER: [],
  ADMIN: ['A1_DRAFT', 'A2_SEARCHING', 'A3_MEMO_DRAFTED', 'A3_A4_WAITING_SIGNATURE', 'A4_EPAYMENT_PREP', 'A4_EXPORTED', 'FIORI_PENDING', 'WAITING_CASH_ADVANCE', 'A5_UPLOADING_RECEIPTS', 'TRIP_CLEARED']
};

export default function App() {
  const { t, lang, toggleLang } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [trips, setTrips] = useState<TripPlan[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripPlan | null>(null);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'requests' | 'agent' | 'admin' | 'workflow'>('dashboard');
  const [showProfile, setShowProfile] = useState(false);

  // เช็ค session ที่มีอยู่ตอนเปิดแอป
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((result) => {
        if (result.success) setUser(result.data);
      })
      .catch((err) => console.error('Failed to check session:', err))
      .finally(() => setIsCheckingAuth(false));
  }, []);

  // โหลดรายการทริปจริงจาก MySQL ผ่าน Prisma หลัง login สำเร็จ
  useEffect(() => {
    if (!user) return;
    setIsLoadingTrips(true);
    fetch('/api/trips')
      .then((res) => res.json())
      .then((result) => {
        const loaded: TripPlan[] = result.data || [];
        setTrips(loaded);
        setSelectedTrip(loaded[0] || null);
      })
      .catch((err) => console.error('Failed to load trips:', err))
      .finally(() => setIsLoadingTrips(false));
  }, [user]);

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' })
      .catch((err) => console.error('Logout failed:', err))
      .finally(() => {
        setUser(null);
        setTrips([]);
        setSelectedTrip(null);
        setActiveTab('dashboard');
      });
  };

  // อัปเดต state ทันที (optimistic) แล้วค่อยบันทึกลง DB ผ่าน PUT
  const handleUpdateTrip = (updated: TripPlan) => {
    setTrips(trips.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedTrip(updated);

    fetch(`/api/trips/${updated.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    }).catch((err) => console.error('Failed to save trip update:', err));
  };

  const handleCreateNewTrip = async () => {
    const newTripData = {
      projectName: '',
      startDate: '',
      endDate: '',
      location: '',
      country: '',
      countryGroup: 5,
      hostOrganization: '',
      travelers: [
        { name: '', position: 'อาจารย์', positionLevel: 'P1', rank: 'Staff', perDiemRate: 1500, maxAccommodationRate: 5000, days: 5 }
      ],
      budgetCode: '',
      paymentMethod: 'advance',
      estimatedBudget: 0,
      status: 'A1_DRAFT'
    };

    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTripData)
      });
      const result = await res.json();
      const created: TripPlan = result.data;
      setTrips([created, ...trips]);
      setSelectedTrip(created);
      setActiveTab('workflow');
    } catch (err) {
      console.error('Failed to create trip:', err);
    }
  };

  // ถ้า AI เจอรายชื่อผู้เดินทางในเอกสาร ใช้ชื่อ+rank ตามที่ AI อ่านได้ — ถ้าไม่เจอเลย ให้ default เป็นชื่อผู้ใช้ที่ล็อกอินอยู่แทนการปล่อยว่าง
  const buildTravelersFromExtraction = (extractedTravelers?: { name: string; rank: string }[]) => {
    if (extractedTravelers && extractedTravelers.length > 0) {
      return extractedTravelers.map((t) => ({
        name: t.name || '',
        position: 'อาจารย์',
        positionLevel: 'P1',
        rank: t.rank || 'Staff',
        perDiemRate: 1500,
        maxAccommodationRate: 5000,
        days: 5
      }));
    }
    return [
      {
        name: user ? `${user.firstName} ${user.lastName}` : '',
        position: 'อาจารย์',
        positionLevel: 'P1',
        rank: 'Staff',
        perDiemRate: 1500,
        maxAccommodationRate: 5000,
        days: 5
      }
    ];
  };

  // สร้างคำขอใหม่จากข้อมูลที่ AI อ่านได้จากเอกสารที่อัปโหลดในหน้าแรก (ยังไม่พบคำขอนี้ในระบบ)
  // แนบไฟล์ต้นฉบับเข้ากับทริปที่สร้างทันที เพื่อให้ผู้ใช้ไม่ต้องอัปโหลดซ้ำในหน้า A1
  const handleCreateNewTripFromDocument = async (extracted: any, files: ParsedInvitationFile[]) => {
    const newTripData = {
      tripType: extracted.tripType === 'DOMESTIC' ? 'DOMESTIC' : 'INTERNATIONAL',
      projectName: extracted.projectName || '',
      startDate: extracted.startDate || '',
      endDate: extracted.endDate || '',
      conferenceStartDate: extracted.startDate || '',
      conferenceEndDate: extracted.endDate || '',
      location: extracted.location || '',
      country: extracted.country || '',
      destinationProvince: extracted.destinationProvince || '',
      countryGroup: 5,
      hostOrganization: extracted.hostOrganization || '',
      travelers: buildTravelersFromExtraction(extracted.travelers),
      budgetCode: '',
      paymentMethod: 'advance',
      estimatedBudget: 0,
      status: 'A1_DRAFT',
      aiDetectedExpenses: extracted.additionalExpenses || []
    };

    const res = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTripData)
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      console.error('Failed to create trip from document:', result.error);
      throw new Error(result.error || 'Failed to create trip from document');
    }
    const created: TripPlan = result.data;

    // ต้อง await ก่อนไปหน้า workflow เสมอ — ไม่งั้น A1RegulationReader mount และ fetch attachments เร็วกว่าการแนบไฟล์จะเสร็จ (race condition)
    // ทำให้ไฟล์ที่เพิ่งอัปโหลดไม่ขึ้นในรายการไฟล์แนบตอนหน้าเพิ่งเปิด
    if (files.length > 0) {
      try {
        await fetch(`/api/trips/${created.id}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files, type: 'INVITATION_LETTER' })
        });
      } catch (err) {
        console.error('Failed to attach document to new trip:', err);
      }
    }

    setTrips([created, ...trips]);
    setSelectedTrip(created);
    setActiveTab('workflow');
  };

  // ไฟล์ที่ต้องประมวลผลอัตโนมัติทันทีที่เปิดหน้า A4/A5 (มาจาก "ใช้เอกสาร" ในหน้าแรก) — A4EPaymentPrep/A5ReceiptReader อ่านค่านี้แล้วเรียก AI parse เอง
  const [autoProcessJob, setAutoProcessJob] = useState<{ step: 'A4' | 'A5'; file: ParsedInvitationFile } | null>(null);

  // นำเอกสารที่อัปโหลดในหน้าแรกไปใช้กับคำขอที่มีอยู่แล้ว (แนบไฟล์ + ประมวลผลขั้นตอนที่เลือกทันที)
  const handleUseDocumentForTrip = async (
    trip: TripPlan,
    step: 'A1' | 'A4' | 'A5',
    files: ParsedInvitationFile[],
    extracted: any
  ) => {
    const attachmentType = step === 'A1' ? 'INVITATION_LETTER' : step === 'A4' ? 'SIGNED_MEMO' : 'RECEIPT';
    let workingTrip = trip;

    if (step === 'A1') {
      // เอกสาร A1 ใหม่ทับข้อมูลเดิม — ต้องล้าง A2 (ตั๋ว/ประกัน) และ A3 (บันทึกข้อความ) ที่ผูกกับข้อมูล A1 เดิมไปด้วย แล้วย้อนสถานะจริงกลับไป A1_DRAFT
      const updates = {
        tripType: extracted?.tripType === 'DOMESTIC' ? 'DOMESTIC' : 'INTERNATIONAL',
        projectName: extracted?.projectName || trip.projectName,
        startDate: extracted?.startDate || trip.startDate,
        endDate: extracted?.endDate || trip.endDate,
        conferenceStartDate: extracted?.startDate || trip.conferenceStartDate,
        conferenceEndDate: extracted?.endDate || trip.conferenceEndDate,
        location: extracted?.location || trip.location,
        country: extracted?.country || trip.country,
        destinationProvince: extracted?.destinationProvince || trip.destinationProvince,
        hostOrganization: extracted?.hostOrganization || trip.hostOrganization,
        flightOptions: null,
        selectedFlight: null,
        insuranceOptions: null,
        selectedInsurance: null,
        memo: null,
        customBudgetItems: null,
        aiDetectedExpenses: extracted?.additionalExpenses || [],
        status: 'A1_DRAFT'
      };
      try {
        const res = await fetch(`/api/trips/${trip.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        const result = await res.json();
        if (result.success && result.data) {
          workingTrip = result.data;
          setTrips((prev) => prev.map((t) => (t.id === workingTrip.id ? workingTrip : t)));
        }
      } catch (err) {
        console.error('Failed to reset trip back to A1 with new document:', err);
      }
    }

    if (files.length > 0) {
      try {
        await fetch(`/api/trips/${workingTrip.id}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files, type: attachmentType })
        });
      } catch (err) {
        console.error('Failed to attach document to existing trip:', err);
      }
    }

    if ((step === 'A4' || step === 'A5') && files.length > 0) {
      setAutoProcessJob({ step, file: files[0] });
    }

    setSelectedTrip(workingTrip);
    setActiveTab('workflow');
    setViewedStatus(null);
  };

  // เติมค่า default ของฟิลด์ที่ chat ไม่รู้ (rank/perDiemRate/ฯลฯ คำนวณจริงในหน้า A1) ให้ผู้เดินทางแต่ละคนที่ AI เตรียมมา
  const buildTravelersForTrip = (travelers: ChatTraveler[]) =>
    (travelers.length ? travelers : [{ name: '' }]).map((t) => ({
      name: t.name || '',
      position: t.position || 'อาจารย์',
      positionLevel: t.positionLevel || 'P1',
      rank: 'Staff',
      perDiemRate: 1500,
      maxAccommodationRate: 5000,
      days: 5
    }));

  // ผู้ใช้กดยืนยันร่างคำขอที่ AI เตรียมไว้ในแชท — AI ไม่มีสิทธิ์เขียน DB เอง จุดนี้เป็นจุดเดียวที่เรียก write API จริง (เหมือน handleCreateNewTrip)
  const handleConfirmCreateTripFromChat = async (draft: ProposedTripDraft) => {
    const newTripData = {
      tripType: draft.tripType,
      projectName: draft.projectName,
      startDate: draft.startDate,
      endDate: draft.endDate,
      conferenceStartDate: draft.startDate,
      conferenceEndDate: draft.endDate,
      location: draft.location,
      country: draft.country,
      destinationProvince: draft.destinationProvince,
      countryGroup: 5,
      hostOrganization: draft.hostOrganization,
      travelers: buildTravelersForTrip(draft.travelers),
      budgetCode: '',
      paymentMethod: 'advance',
      estimatedBudget: 0,
      status: 'A1_DRAFT'
    };

    const res = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTripData)
    });
    if (!res.ok) throw new Error('Failed to create trip from chat draft');
    const result = await res.json();
    const created: TripPlan = result.data;
    setTrips((prev) => [created, ...prev]);
    setSelectedTrip(created);
    setActiveTab('workflow');
  };

  // ผู้ใช้กดยืนยันการแก้ไขคำขอเดิมที่ AI เตรียมไว้ในแชท — เหมือนข้างบน AI แค่เตรียมข้อมูล จุดนี้เป็นจุดเดียวที่เรียก write API จริง
  const handleConfirmUpdateTripFromChat = async (update: ProposedTripUpdate) => {
    const updates = {
      tripType: update.tripType,
      projectName: update.projectName,
      startDate: update.startDate,
      endDate: update.endDate,
      conferenceStartDate: update.startDate,
      conferenceEndDate: update.endDate,
      location: update.location,
      country: update.country,
      destinationProvince: update.destinationProvince,
      hostOrganization: update.hostOrganization,
      travelers: buildTravelersForTrip(update.travelers)
    };

    const res = await fetch(`/api/trips/${update.tripId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Failed to update trip from chat');
    const result = await res.json();
    const updated: TripPlan = result.data;
    setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedTrip(updated);
    setActiveTab('workflow');
  };

  // เปิดทริปที่ chatbot ค้นหาเจอ/สร้างใหม่ให้ — โหลดรายการทริปใหม่เสมอ เพราะทริปที่ chatbot เพิ่งสร้างยังไม่อยู่ใน state ปัจจุบัน
  const handleOpenTripFromChat = async (tripId: string) => {
    try {
      const res = await fetch('/api/trips');
      const result = await res.json();
      const loaded: TripPlan[] = result.data || [];
      setTrips(loaded);
      const target = loaded.find((t) => t.id === tripId);
      if (target) {
        setSelectedTrip(target);
        setActiveTab('workflow');
      }
    } catch (err) {
      console.error('Failed to open trip from chat:', err);
    }
  };

  // หน้าที่กำลังดูอยู่ ณ ตอนนี้ — แยกจาก selectedTrip.status (ความก้าวหน้าจริงที่บันทึกลง DB) โดยเจตนา
  // เดิมปุ่ม "กลับไปขั้นตอนก่อนหน้า"/คลิก step card ที่ทำเสร็จแล้ว เขียนทับ selectedTrip.status ลง DB ทันทีเพื่อสลับหน้า
  // ทำให้ย้อนไปดู A1 แล้วไปต่อ A2/A3/A4 ไม่ได้อีก เพราะสถานะจริงถูกเขียนทับเป็น A1_DRAFT ไปแล้ว (บั๊ก)
  // ตอนนี้การ "ดูขั้นตอนก่อนหน้า" แค่เปลี่ยน viewedStatus (ไม่ persist) — status จริงจะเปลี่ยนก็ต่อเมื่อกดยืนยัน/ดำเนินการต่อในแต่ละ Agent เท่านั้น
  const [viewedStatus, setViewedStatus] = useState<TripStatus | null>(null);
  const effectiveStatus = viewedStatus ?? selectedTrip?.status;

  useEffect(() => {
    setViewedStatus(null);
  }, [selectedTrip?.id, selectedTrip?.status]);

  // ยกเลิกทริปที่ยังไม่จบ (flag ไว้ ไม่ลบข้อมูล) — เอาออกจากยอดงบประมาณรวมและนับแยกในแดชบอร์ด
  const handleCancelTrip = (trip: TripPlan) => {
    handleUpdateTrip({ ...trip, isCancelled: true });
  };

  // นำทริปที่ยกเลิกไว้กลับมาใช้งานใหม่
  const handleReactivateTrip = (trip: TripPlan) => {
    handleUpdateTrip({ ...trip, isCancelled: false });
  };

  // ลบทริปออกจากระบบถาวร — ต้องพิมพ์คำว่า "delete" ยืนยันใน DeleteTripModal ก่อนเรียกฟังก์ชันนี้เสมอ
  const [deletingTrip, setDeletingTrip] = useState<TripPlan | null>(null);

  const handleDeleteTrip = async (trip: TripPlan) => {
    const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || 'Failed to delete trip');
    setTrips((prev) => prev.filter((t) => t.id !== trip.id));
    setSelectedTrip((prev) => (prev?.id === trip.id ? null : prev));
    setDeletingTrip(null);
  };

  // ปุ่มแก้ไขสถานะการยกเลิก/ใช้งานปกติ บนหน้าเวิร์กสเปซโดยตรง (เดิมทำได้แค่จากหน้ารายการคำขอ)
  const [statusEditOpen, setStatusEditOpen] = useState(false);

  useEffect(() => {
    setStatusEditOpen(false);
  }, [selectedTrip?.id]);

  const handleTripStatusChange = (value: 'ACTIVE' | 'CANCELLED') => {
    if (!selectedTrip) return;
    if (value === 'CANCELLED') {
      if (window.confirm(t('workflow.confirmCancel', { name: selectedTrip.projectName || t('workflow.thisItem') }))) {
        handleCancelTrip(selectedTrip);
      }
    } else {
      handleReactivateTrip(selectedTrip);
    }
    setStatusEditOpen(false);
  };

  // Stepper elements mapping
  const steps: { label: string; agent: string; statusGroup: TripStatus[] }[] = [
    { label: t('steps.a1'), agent: `A1: ${t('steps.a1Agent')}`, statusGroup: ['A1_DRAFT'] },
    { label: t('steps.a2'), agent: `A2: ${t('steps.a2Agent')}`, statusGroup: ['A2_SEARCHING'] },
    { label: t('steps.a3'), agent: `A3: ${t('steps.a3Agent')}`, statusGroup: ['A3_MEMO_DRAFTED'] },
    { label: t('steps.a4'), agent: `A4: ${t('steps.a4Agent')}`, statusGroup: ['A3_A4_WAITING_SIGNATURE', 'A4_EPAYMENT_PREP', 'A4_EXPORTED', 'FIORI_PENDING', 'WAITING_CASH_ADVANCE'] },
    { label: t('steps.a5'), agent: `A5: ${t('steps.a5Agent')}`, statusGroup: ['A5_UPLOADING_RECEIPTS', 'TRIP_CLEARED'] }
  ];

  // Index ของขั้นตอนที่ทริปนี้ไปถึงจริงในระบบ (มาจาก status ที่บันทึกไว้ ไม่ใช่ค่า UI ชั่วคราว) — ใช้กันการข้ามไปข้างหน้า
  const currentStepIndex = selectedTrip ? steps.findIndex((s) => s.statusGroup.includes(selectedTrip.status)) : -1;
  // Index ของขั้นตอนที่กำลังแสดงอยู่บนหน้าจอตอนนี้ (อาจย้อนกลับไปดูขั้นตอนก่อนหน้าอยู่ก็ได้) — ใช้ไฮไลต์ step card ที่ active
  const viewedStepIndex = selectedTrip && effectiveStatus ? steps.findIndex((s) => s.statusGroup.includes(effectiveStatus)) : -1;

  // Helper to check if step is completed/active/upcoming
  const getStepState = (statusGroup: TripStatus[]) => {
    if (!selectedTrip) return 'upcoming';
    const stepIdx = steps.findIndex((s) => s.statusGroup === statusGroup);

    if (stepIdx === viewedStepIndex) return 'active';
    if (stepIdx <= currentStepIndex) return 'completed';
    return 'upcoming';
  };

  // ป้องกันการคลิกข้ามไปขั้นตอนที่ยังไม่ถึง/ยังไม่ยืนยันข้อมูล — ย้อนกลับไปขั้นตอนที่ทำแล้วได้เสมอ แต่ห้ามข้ามไปข้างหน้า
  const [stepBlockedMessage, setStepBlockedMessage] = useState<string | null>(null);

  useEffect(() => {
    setStepBlockedMessage(null);
  }, [selectedTrip?.id]);

  const handleStepCardClick = (step: { label: string; statusGroup: TripStatus[] }) => {
    const stepIdx = steps.findIndex((s) => s.statusGroup === step.statusGroup);
    if (stepIdx > currentStepIndex) {
      const currentLabel = currentStepIndex >= 0 ? steps[currentStepIndex].label : '';
      setStepBlockedMessage(t('workflow.stepBlocked', { current: currentLabel, next: step.label }));
      return;
    }
    setStepBlockedMessage(null);
    setViewedStatus(step.statusGroup[0]);
  };

  // Render correct agent workspace depending on selected trip state
  const renderAgentWorkspace = () => {
    if (!selectedTrip) return null;

    const allowedStatuses = user ? ROLE_ALLOWED_STATUSES[user.role] || [] : [];
    if (!effectiveStatus || !allowedStatuses.includes(effectiveStatus)) {
      return (
        <div className="py-16 text-center space-y-3">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto">
            <Lock size={22} />
          </div>
          <p className="text-sm font-bold text-slate-700">{t('workflow.noAccessTitle')}</p>
          <p className="text-xs text-slate-500">
            {t('workflow.noAccessBody', { role: user ? t(`role.${user.role}`) : '' })}
          </p>
        </div>
      );
    }

    switch (effectiveStatus) {
      case 'A1_DRAFT':
        return (
          <A1RegulationReader
            trip={selectedTrip}
            onUpdateTrip={handleUpdateTrip}
            onNextStep={() => setActiveTab('workflow')}
          />
        );
      case 'A2_SEARCHING':
        return (
          <A2TravelSearch
            trip={selectedTrip}
            onUpdateTrip={handleUpdateTrip}
            onNextStep={() => setActiveTab('workflow')}
            onPrevStep={() => setViewedStatus('A1_DRAFT')}
          />
        );
      case 'A3_MEMO_DRAFTED':
        return (
          <A3DocumentDrafting
            trip={selectedTrip}
            onUpdateTrip={handleUpdateTrip}
            onNextStep={() => setActiveTab('workflow')}
            onPrevStep={() => setViewedStatus('A2_SEARCHING')}
          />
        );
      case 'A3_A4_WAITING_SIGNATURE':
      case 'A4_EPAYMENT_PREP':
      case 'A4_EXPORTED':
      case 'FIORI_PENDING':
      case 'WAITING_CASH_ADVANCE':
        return (
          <A4EPaymentPrep
            trip={selectedTrip}
            onUpdateTrip={handleUpdateTrip}
            onNextStep={() => setActiveTab('workflow')}
            onPrevStep={() => setViewedStatus('A3_MEMO_DRAFTED')}
            autoProcessFile={autoProcessJob?.step === 'A4' ? autoProcessJob.file : undefined}
            onAutoProcessed={() => setAutoProcessJob(null)}
          />
        );
      case 'A5_UPLOADING_RECEIPTS':
      case 'TRIP_CLEARED':
        return (
          <A5ReceiptReader
            trip={selectedTrip}
            onUpdateTrip={handleUpdateTrip}
            onNextStep={() => setActiveTab('workflow')}
            onPrevStep={() => setViewedStatus('A4_EPAYMENT_PREP')}
            autoProcessFile={autoProcessJob?.step === 'A5' ? autoProcessJob.file : undefined}
            onAutoProcessed={() => setAutoProcessJob(null)}
          />
        );
      default:
        return null;
    }
  };

  if (isCheckingAuth) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (!user) {
    return <LoginPage onLoginSuccess={setUser} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col antialiased">
      {/* Top Navigation Bar */}
      <nav className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-100">
            <Plane className="rotate-45" size={20} />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-slate-900">CU-AI PASS</h1>
            <p className="text-3xs text-blue-600 font-bold uppercase tracking-wider">
              Planning, Approval, and Settlement System
            </p>
          </div>
        </div>

        {/* Home / Request list navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            title={t('nav.homeTitle')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'dashboard'
                ? 'text-white bg-blue-600'
                : 'text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <Home size={15} />
            {t('nav.home')}
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            title={t('nav.requests')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'requests'
                ? 'text-white bg-blue-600'
                : 'text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <FileText size={15} />
            {t('nav.requests')}
          </button>
          <button
            onClick={() => setActiveTab('agent')}
            title={t('nav.agent')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'agent'
                ? 'text-white bg-blue-600'
                : 'text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <Sparkles size={15} />
            {t('nav.agent')}
          </button>
          {user?.role === 'ADMIN' && (
            <button
              onClick={() => setActiveTab('admin')}
              title={t('nav.admin')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'admin'
                  ? 'text-white bg-blue-600'
                  : 'text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <ShieldAlert size={15} />
              {t('nav.admin')}
            </button>
          )}
        </div>

        {/* Profile */}
        <div className="flex items-center gap-5">
          <button
            onClick={toggleLang}
            title={t('nav.langToggle')}
            className="relative inline-flex items-center w-[50px] h-[22px] rounded-full bg-slate-900 px-1 shrink-0"
          >
            <span className="absolute inset-0 flex items-center">
              <span className="flex-1 text-center text-[10px] leading-none font-extrabold text-white select-none">TH</span>
              <span className="flex-1 text-center text-[10px] leading-none font-extrabold text-white select-none">EN</span>
            </span>
            <span
              className={`absolute top-[3px] bottom-[3px] w-5 rounded-full bg-white shadow-md flex items-center justify-center text-[10px] leading-none font-extrabold text-slate-900 transition-all duration-200 ease-out select-none ${
                lang === 'th' ? 'left-[3px]' : 'left-[calc(100%-23px)]'
              }`}
            >
              {lang === 'th' ? 'TH' : 'EN'}
            </span>
          </button>
          <div className="flex items-center gap-3 border-l pl-5 border-slate-200">
            <button
              onClick={() => setShowProfile(true)}
              title={t('nav.viewProfile')}
              className="flex items-center gap-3 rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-slate-100 transition-colors"
            >
              <div className="text-right">
                <p className="text-xs font-bold text-slate-900">
                  {user ? `${user.firstName} ${user.lastName}` : ''}
                </p>
                <p className="text-3xs text-slate-500 uppercase font-medium">
                  {user ? t(`role.${user.role}`) : ''}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center font-bold text-xs text-slate-600">
                {user ? `${user.firstName[0]}${user.lastName[0]}` : ''}
              </div>
            </button>
            <button
              onClick={handleLogout}
              title={t('nav.logout')}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {activeTab === 'dashboard' ? (
          /* Dashboard Tab View */
          <DashboardOverview
            trips={trips}
            selectedTrip={selectedTrip}
            onSelectTrip={(trip) => {
              setSelectedTrip(trip);
              setActiveTab('workflow');
            }}
            onCreateNewTrip={handleCreateNewTrip}
            onCreateNewTripFromDocument={handleCreateNewTripFromDocument}
            onUseDocumentForTrip={handleUseDocumentForTrip}
            onCancelTrip={handleCancelTrip}
            onReactivateTrip={handleReactivateTrip}
            onDeleteTrip={setDeletingTrip}
            onGoToRequestList={() => setActiveTab('requests')}
          />
        ) : activeTab === 'requests' ? (
          /* Request List Tab View */
          <RequestListPage
            trips={trips}
            selectedTrip={selectedTrip}
            onSelectTrip={(trip) => {
              setSelectedTrip(trip);
              setActiveTab('workflow');
            }}
            onCreateNewTrip={handleCreateNewTrip}
            onCancelTrip={handleCancelTrip}
            onReactivateTrip={handleReactivateTrip}
            onDeleteTrip={setDeletingTrip}
          />
        ) : activeTab === 'admin' ? (
          /* Admin — User Lock Management + System Settings Tab View */
          <AdminPage />
        ) : activeTab === 'workflow' ? (
          /* Workflow Workspace Tab View */
          <div className="space-y-8">
            {/* Selected Trip Details summary card */}
            {selectedTrip && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-150 pb-5">
                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1.5 text-3xs font-extrabold uppercase text-blue-600 tracking-widest">
                      <Briefcase size={12} /> {t('workflow.currentInfo')}
                    </span>
                    <h2 className="text-lg font-bold text-slate-950">
                      {selectedTrip.projectName || ` ${t('workflow.newDraftPlaceholder')} `}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      {t('workflow.destination')}: {selectedTrip.location || '-'}
                      {selectedTrip.tripType === 'DOMESTIC'
                        ? `, ${t('workflow.province')}${selectedTrip.destinationProvince || '-'}`
                        : `, ${t('workflow.country')}${selectedTrip.country || '-'}`}
                      {' '}
                      {t('workflow.travelersCount', { count: selectedTrip.travelers.length })}
                    </p>

                    {/* สถานะการยกเลิก + ปุ่มแก้ไขสถานะ (เดิมทำได้แค่จากหน้ารายการคำขอเท่านั้น) */}
                    <div className="flex items-center gap-2 pt-1.5 flex-wrap">
                      {selectedTrip.isCancelled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-red-50 text-red-800 border border-red-200">
                          <XCircle size={11} /> {t('workflow.cancelled')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle size={11} /> {t('workflow.active')}
                        </span>
                      )}
                      {!(selectedTrip.status === 'TRIP_CLEARED' && !selectedTrip.isCancelled) && (
                        <button
                          onClick={() => setStatusEditOpen((v) => !v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                        >
                          <Pencil size={11} /> {t('workflow.editStatus')}
                        </button>
                      )}
                    </div>

                    {statusEditOpen && (
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        {selectedTrip.isCancelled ? (
                          <button
                            onClick={() => handleTripStatusChange('ACTIVE')}
                            className="inline-flex items-center gap-1.5 text-2xs font-bold px-3 py-1.5 rounded-lg transition-all bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                          >
                            <RotateCcw size={12} /> {t('workflow.reactivate')}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleTripStatusChange('CANCELLED')}
                            className="inline-flex items-center gap-1.5 text-2xs font-bold px-3 py-1.5 rounded-lg transition-all bg-white hover:bg-red-50 text-red-600 border border-red-200"
                          >
                            <XCircle size={12} /> {t('workflow.cancelThis')}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setStatusEditOpen(false);
                            setDeletingTrip(selectedTrip);
                          }}
                          className="inline-flex items-center gap-1.5 text-2xs font-bold px-3 py-1.5 rounded-lg transition-all bg-white hover:bg-red-50 text-red-700 border border-red-300"
                        >
                          <Trash2 size={12} /> {t('workflow.deletePermanently')}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-3xs text-slate-400 block font-bold uppercase tracking-wider">{t('workflow.estimatedBudget')}</span>
                    <span className="text-2xl font-extrabold text-slate-900 font-mono">
                      ฿{selectedTrip.estimatedBudget.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Workflow Stepper Progress bar */}
                <div className="space-y-3">
                  <h3 className="text-3xs font-bold text-slate-400 uppercase tracking-wider">
                    {t('workflow.progressTitle')}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {steps.map((step, idx) => {
                      const state = getStepState(step.statusGroup);
                      return (
                        <div
                          key={idx}
                          onClick={() => handleStepCardClick(step)}
                          className={`p-3 rounded-xl border transition-all text-left cursor-pointer ${
                            state === 'completed'
                              ? 'border-emerald-200 bg-emerald-50/20 text-emerald-900 hover:border-emerald-300'
                              : state === 'active'
                              ? 'border-blue-600 bg-blue-50/45 text-slate-950 shadow-md ring-1 ring-blue-600/20'
                              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5 mb-1">
                            <span className="text-3xs font-bold uppercase tracking-wider">{t('steps.stepN', { n: idx + 1 })}</span>
                            {state === 'completed' ? (
                              <CheckCircle size={12} className="text-emerald-600 shrink-0" />
                            ) : state === 'active' ? (
                              <Clock size={12} className="text-blue-600 animate-spin shrink-0" />
                            ) : (
                              <Lock size={11} className="text-slate-300 shrink-0" />
                            )}
                          </div>
                          <div className="font-bold text-xs truncate">{step.label}</div>
                          <div className="text-3xs text-slate-500 mt-0.5 truncate">{step.agent.split(': ')[1]}</div>
                        </div>
                      );
                    })}
                  </div>
                  {stepBlockedMessage && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-semibold">
                      <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                      <span>{stepBlockedMessage}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Current Active Agent Workspace content */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 sm:p-8">
              {renderAgentWorkspace()}
            </div>
          </div>
        ) : null}

        {/* AI Agent Chat Tab View — คงสถานะ mount ไว้เสมอ (ซ่อนด้วย CSS เท่านั้น) เพื่อไม่ให้ chat/ผลลัพธ์หายไปทันทีที่สลับแท็บ
            การล้างข้อมูลจริงต้องเกิดจาก idle timeout 5 นาทีภายใน AgentChatPage เท่านั้น ไม่ใช่จากการ unmount ตอนสลับหน้า */}
        <div className={activeTab === 'agent' ? '' : 'hidden'}>
          <AgentChatPage
            onOpenTrip={handleOpenTripFromChat}
            onConfirmCreateTrip={handleConfirmCreateTripFromChat}
            onConfirmUpdateTrip={handleConfirmUpdateTripFromChat}
          />
        </div>
      </main>

      {/* Sticky footer detailing credit */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-xs text-slate-500 font-medium">
        <div className="flex items-center justify-center gap-1.5">
          <Award className="text-blue-600" size={15} />
          <span>{t('footer.credit')}</span>
        </div>
      </footer>

      {showProfile && <UserProfilePage onClose={() => setShowProfile(false)} />}

      {deletingTrip && (
        <DeleteTripModal
          trip={deletingTrip}
          onCancel={() => setDeletingTrip(null)}
          onConfirm={() => handleDeleteTrip(deletingTrip)}
        />
      )}

    </div>
  );
}
