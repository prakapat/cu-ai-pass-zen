/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Upload,
  User,
  Plus,
  Trash2,
  Sparkles,
  BookOpen,
  Calendar,
  AlertCircle,
  FileCheck,
  RotateCcw,
  Eye
} from 'lucide-react';
import {
  TripPlan,
  TripType,
  ReimbursementMode,
  InsurancePlanTierKey,
  Traveler,
  BudgetItemPaymentMethods,
  CustomBudgetItem,
  POSITION_OPTIONS,
  POSITION_LEVEL_OPTIONS,
  getRankFromPositionAndLevel,
  getRegulationTier,
  getDomesticLumpSumTier,
  getDomesticPerDiemTier,
  AIRPORT_TRANSFER_MAX_RATE,
  AIRPORT_TRANSFERS_PER_TRIP
} from '../types';
import { addDaysToDateString, calculateDaysBetween } from '../utils/dateUtils';
import { useLanguage } from '../i18n/LanguageContext';

interface A1RegulationReaderProps {
  trip: TripPlan | null;
  onUpdateTrip: (updated: TripPlan) => void;
  onNextStep: () => void;
}

export default function A1RegulationReader({
  trip,
  onUpdateTrip,
  onNextStep
}: A1RegulationReaderProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);

  // ไฟล์ที่แนบแล้วแต่ยังไม่ยืนยัน (เพิ่ม/ลบได้ก่อนกด "ยืนยันข้อมูลโครงการ") vs ไฟล์ที่บันทึกลง DB แล้ว (ลบได้จริง กรณีต้องการเปลี่ยนเอกสาร)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [savedAttachments, setSavedAttachments] = useState<{ id: string; fileName: string }[]>([]);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [projectConfirmed, setProjectConfirmed] = useState(
    !!(trip?.projectName && trip.projectName.trim())
  );
  const [confirmLoading, setConfirmLoading] = useState(false);

  // โหลดรายชื่อไฟล์แนบที่บันทึกไว้แล้ว กรณีเปิดร่างทริปที่เคยยืนยันข้อมูลโครงการมาก่อน
  useEffect(() => {
    if (!trip?.id) return;
    fetch(`/api/trips/${trip.id}/attachments`)
      .then((res) => res.json())
      .then((result) => {
        if (result.success) setSavedAttachments((result.data || []).map((a: any) => ({ id: a.id, fileName: a.fileName })));
      })
      .catch((err) => console.error('Failed to load trip attachments:', err));
  }, [trip?.id]);

  // ลบไฟล์แนบที่บันทึกลง DB แล้วออกจริง (กรณี user ต้องการเปลี่ยนเอกสารที่แนบไว้)
  const removeSavedAttachment = async (attachmentId: string) => {
    if (!trip?.id) return;
    setDeletingAttachmentId(attachmentId);
    try {
      const res = await fetch(`/api/trips/${trip.id}/attachments/${attachmentId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        setSavedAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      } else {
        setError(result.error || t('a1.removeAttachmentFailed'));
      }
    } catch (e) {
      console.error('Failed to delete attachment', e);
      setError(t('a1.removeAttachmentError'));
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  // ประเภทการเดินทาง: ในประเทศ (ข้อ 42-45) หรือต่างประเทศ (ข้อ 46-51) — กำหนดชุด field/อัตราที่ใช้ทั้งหมดด้านล่าง
  const [tripType, setTripType] = useState<TripType>(trip?.tripType || 'INTERNATIONAL');
  const [destinationProvince, setDestinationProvince] = useState(trip?.destinationProvince || '');

  // รูปแบบการเบิก: เหมาจ่ายรวมที่พัก+เบี้ยเลี้ยง (ข้อ 42/46) vs แยกเบิกที่พักตามจริง+เบี้ยเลี้ยงเหมาจ่าย (ข้อ 43/47, ค่าเริ่มต้นเดิมของระบบ)
  const [reimbursementMode, setReimbursementMode] = useState<ReimbursementMode>(trip?.reimbursementMode || 'ITEMIZED');

  // อัตราจริงตามข้อ 46-47 และกลุ่มประเทศจากตาราง PolicyRate/CountryGroup ใน DB (แทน constant hardcode เดิม)
  const [policyRates, setPolicyRates] = useState<any[]>([]);
  const [countryGroupMap, setCountryGroupMap] = useState<Record<string, number>>({});
  const [countryBufferMap, setCountryBufferMap] = useState<Record<string, number>>({});
  // ค่าตั๋วเครื่องบินไป-กลับประมาณการต่อคนตามประเทศปลายทาง จากตาราง CountryGroup.estimatedFlightCost (แทนค่า hardcode ฿20,000 เดิม)
  const [countryFlightCostMap, setCountryFlightCostMap] = useState<Record<string, number>>({});
  const DEFAULT_ESTIMATED_FLIGHT_COST = 25000; // ประเทศที่ไม่มีค่าประมาณการในตาราง (เช่น กลุ่ม 5 ที่ไม่มีแถวใน CountryGroup)

  // ประมาณการเบี้ยประกันเดินทาง = ราคาฐานตามช่วงวัน (InsuranceDurationTier) x ตัวคูณโซนประเทศ (InsuranceZoneRate) x ตัวคูณแผน (InsurancePlanTier)
  // ไม่ใช่อัตราตามระเบียบ เป็น rule ประมาณการที่ผู้ใช้ออกแบบ — แทนค่า hardcode ฿950/คน เดิม
  const [countryInsuranceZoneMap, setCountryInsuranceZoneMap] = useState<Record<string, number>>({});
  const [insuranceZoneRates, setInsuranceZoneRates] = useState<any[]>([]);
  const [insuranceDurationTiers, setInsuranceDurationTiers] = useState<any[]>([]);
  const [insurancePlanTiers, setInsurancePlanTiers] = useState<any[]>([]);
  // แผนประกันเดินทางประมาณการ — ตัดตัวเลือกออกจากหน้าจอ A1 แล้ว ใช้ Premium เสมอ (ไม่ใช่อัตราตามระเบียบ เป็น rule ประมาณการ)
  const insurancePlanTier = 'PREMIUM';
  const DEFAULT_INSURANCE_ZONE = 4; // ประเทศที่ไม่มีโซนในตาราง — ใช้โซนความเสี่ยงสูงสุดเป็นค่าปลอดภัยไว้ก่อน

  // ค่าธรรมเนียมวีซ่าประมาณการต่อคนตามประเทศ (CountryGroup.estimatedVisaFee, สิทธิ์หนังสือเดินทางราชการ) — แทนค่า hardcode ฿1,500/คน เดิม
  // (รวมกับ PASSPORT_FEE คงที่จาก RegulationConstant เป็นยอดรวมต่อคน — วีซ่ากับพาสปอร์ตเป็นคนละองค์ประกอบ ไม่ได้คูณกันแบบประกัน)
  const [countryVisaFeeMap, setCountryVisaFeeMap] = useState<Record<string, number>>({});
  const [countryVisaRequirementMap, setCountryVisaRequirementMap] = useState<Record<string, string>>({});
  const DEFAULT_VISA_FEE = 4000; // ประเทศที่ไม่มีข้อมูลในตาราง — ใช้ค่าประเภทแพงสุด (EMBASSY_VISA) เป็นค่าปลอดภัยไว้ก่อน

  // อัตราการเดินทางในประเทศ (ข้อ 42-44) + สิทธิ์ชั้นโดยสาร (ข้อ 44(4)/48(2)) + ค่าคงที่ระเบียบ (ข้อ 50, ข้อ 44(3))
  const [domesticLumpSumRates, setDomesticLumpSumRates] = useState<any[]>([]);
  const [domesticAccommodationRates, setDomesticAccommodationRates] = useState<any[]>([]);
  const [domesticPerDiemRates, setDomesticPerDiemRates] = useState<any[]>([]);
  const [flightClassRules, setFlightClassRules] = useState<any[]>([]);
  const [regulationConstants, setRegulationConstants] = useState<any[]>([]);
  // วันหยุดราชการไทย (วันตายตัว ไม่รวมวันหยุดจันทรคติ/ชดเชย) — ใช้เช็คว่าวันที่เกินสิทธิ์ข้อ 49 วันไหนเป็นวันทำการที่ต้องยื่นลาเพิ่มเติม
  const [publicHolidaySet, setPublicHolidaySet] = useState<Set<string>>(new Set());
  // แจ้งเตือนกรณีต้องลาเพิ่มทั้งก่อนและหลังช่วงประชุม — ระบบเก็บช่วงลาได้แค่ช่วงเดียว ต้องให้ user ยื่นอีกช่วงแยกเอง
  const [leaveAdvisory, setLeaveAdvisory] = useState<string | null>(null);

  const getRegulationConstant = (key: string, fallback: number) => {
    const row = regulationConstants.find((r) => r.key === key);
    return row ? row.value : fallback;
  };

  useEffect(() => {
    fetch('/api/policy-rates')
      .then((res) => res.json())
      .then((result) => setPolicyRates(result.data || []))
      .catch((err) => console.error('Failed to load policy rates:', err));

    fetch('/api/country-groups')
      .then((res) => res.json())
      .then((result) => {
        const groupMap: Record<string, number> = {};
        const bufferMap: Record<string, number> = {};
        const flightCostMap: Record<string, number> = {};
        const insuranceZoneMap: Record<string, number> = {};
        const visaFeeMap: Record<string, number> = {};
        const visaRequirementMap: Record<string, string> = {};
        for (const row of result.data || []) {
          groupMap[row.country] = row.group;
          bufferMap[row.country] = row.travelBufferDays;
          if (row.estimatedFlightCost != null) flightCostMap[row.country] = row.estimatedFlightCost;
          if (row.insuranceZone != null) insuranceZoneMap[row.country] = row.insuranceZone;
          if (row.estimatedVisaFee != null) visaFeeMap[row.country] = row.estimatedVisaFee;
          if (row.visaRequirement != null) visaRequirementMap[row.country] = row.visaRequirement;
        }
        setCountryGroupMap(groupMap);
        setCountryBufferMap(bufferMap);
        setCountryFlightCostMap(flightCostMap);
        setCountryInsuranceZoneMap(insuranceZoneMap);
        setCountryVisaFeeMap(visaFeeMap);
        setCountryVisaRequirementMap(visaRequirementMap);
      })
      .catch((err) => console.error('Failed to load country groups:', err));

    fetch('/api/insurance-zone-rates')
      .then((res) => res.json())
      .then((result) => setInsuranceZoneRates(result.data || []))
      .catch((err) => console.error('Failed to load insurance zone rates:', err));

    fetch('/api/insurance-duration-tiers')
      .then((res) => res.json())
      .then((result) => setInsuranceDurationTiers(result.data || []))
      .catch((err) => console.error('Failed to load insurance duration tiers:', err));

    fetch('/api/insurance-plan-tiers')
      .then((res) => res.json())
      .then((result) => setInsurancePlanTiers(result.data || []))
      .catch((err) => console.error('Failed to load insurance plan tiers:', err));

    fetch('/api/domestic-lump-sum-rates')
      .then((res) => res.json())
      .then((result) => setDomesticLumpSumRates(result.data || []))
      .catch((err) => console.error('Failed to load domestic lump-sum rates:', err));

    fetch('/api/domestic-accommodation-rates')
      .then((res) => res.json())
      .then((result) => setDomesticAccommodationRates(result.data || []))
      .catch((err) => console.error('Failed to load domestic accommodation rates:', err));

    fetch('/api/domestic-per-diem-rates')
      .then((res) => res.json())
      .then((result) => setDomesticPerDiemRates(result.data || []))
      .catch((err) => console.error('Failed to load domestic per-diem rates:', err));

    fetch('/api/flight-class-rules')
      .then((res) => res.json())
      .then((result) => setFlightClassRules(result.data || []))
      .catch((err) => console.error('Failed to load flight class rules:', err));

    fetch('/api/regulation-constants')
      .then((res) => res.json())
      .then((result) => setRegulationConstants(result.data || []))
      .catch((err) => console.error('Failed to load regulation constants:', err));

    fetch('/api/public-holidays')
      .then((res) => res.json())
      .then((result) => setPublicHolidaySet(new Set((result.data || []).map((h: any) => h.date))))
      .catch((err) => console.error('Failed to load public holidays:', err));
  }, []);

  // คำนวณเบี้ยเลี้ยง/ที่พัก จากอัตราจริงใน DB ตามประเภทการเดินทาง:
  // - ต่างประเทศ: ข้อ 47 (แยกรายการ) จาก tier ของตำแหน่ง x กลุ่มประเทศ — ประเทศที่ไม่พบถือเป็นกลุ่ม 5 ตามระเบียบ
  // - ในประเทศ: ข้อ 43(1) ที่พักห้องเดี่ยว + ข้อ 43(2) เบี้ยเลี้ยง — คนละ tier กัน (ดู getDomesticLumpSumTier/getDomesticPerDiemTier)
  // forType เป็น optional override สำหรับตอนสลับ tripType เอง (เลี่ยง stale closure ของ state tripType ระหว่างเรียกครั้งเดียวกัน)
  const getRateFor = (position?: string, positionLevel?: string, group?: number, forType: TripType = tripType) => {
    if (forType === 'DOMESTIC') {
      const lumpTier = getDomesticLumpSumTier(position, positionLevel);
      const perDiemTier = getDomesticPerDiemTier(position, positionLevel);
      const accRow = domesticAccommodationRates.find((r) => r.tier === lumpTier);
      const perDiemRow = domesticPerDiemRates.find((r) => r.tier === perDiemTier);
      return {
        perDiem: perDiemRow ? perDiemRow.ratePerDay : 600,
        accommodationMax: accRow ? accRow.singleRoomMax : 1500
      };
    }
    const tier = getRegulationTier(position, positionLevel);
    const row = policyRates.find((r) => r.tier === tier && r.countryGroup === group);
    if (row) return { perDiem: row.perDiemItemized, accommodationMax: row.accommodationMax };
    return { perDiem: 1500, accommodationMax: 5000 };
  };

  // อัตราเหมาจ่ายรวมที่พัก+เบี้ยเลี้ยงต่อวัน (ข้อ 42 ในประเทศ / ข้อ 46 ต่างประเทศ) — ใช้เมื่อ reimbursementMode = LUMP_SUM แทนการแยกคำนวณที่พัก+เบี้ยเลี้ยง
  const getLumpSumRateFor = (position?: string, positionLevel?: string, group?: number, forType: TripType = tripType) => {
    if (forType === 'DOMESTIC') {
      const tier = getDomesticLumpSumTier(position, positionLevel);
      const row = domesticLumpSumRates.find((r) => r.tier === tier);
      return row ? row.ratePerDay : 1700;
    }
    const tier = getRegulationTier(position, positionLevel);
    const row = policyRates.find((r) => r.tier === tier && r.countryGroup === group);
    return row ? row.perDiemLumpSum : 5100;
  };

  // เบี้ยประกันเดินทางประมาณการต่อคน = ราคาฐานตามช่วงวัน x ตัวคูณโซนประเทศ x ตัวคูณระดับแผน (rule ประมาณการ ไม่ใช่อัตราตามระเบียบ)
  // planTierKey เป็น optional override เช่นเดียวกับ forType ใน getRateFor — เลี่ยง stale closure ตอนสลับแผนกลางฟังก์ชันเดียวกัน
  const getInsuranceEstimatePerPerson = (forCountry: string, days: number, planTierKey: string = insurancePlanTier) => {
    const durationTier = insuranceDurationTiers.find((t) =>
      t.maxDays == null ? days >= t.minDays : days >= t.minDays && days <= t.maxDays
    );
    if (!durationTier) return 950; // fallback ถ้ายังโหลดตารางไม่เสร็จ

    let basePrice = durationTier.basePrice;
    if (durationTier.maxDays == null && durationTier.extensionIncrementDays && durationTier.extensionIncrementAmount) {
      const extraDays = days - durationTier.minDays + 1;
      basePrice += Math.ceil(extraDays / durationTier.extensionIncrementDays) * durationTier.extensionIncrementAmount;
    }

    const zone = countryInsuranceZoneMap[forCountry] || DEFAULT_INSURANCE_ZONE;
    const zoneMultiplier = insuranceZoneRates.find((z) => z.zone === zone)?.multiplier ?? 2.2;
    const planMultiplier = insurancePlanTiers.find((p) => p.tier === planTierKey)?.multiplier ?? 1.0;

    return Math.round((basePrice * zoneMultiplier * planMultiplier) / 10) * 10; // ปัดเศษให้ลงตัวหลักสิบบาท
  };

  // Form states matching TripPlan properties
  const [projectName, setProjectName] = useState(trip?.projectName || '');
  
  // Conference dates from invitation
  const [conferenceStartDate, setConferenceStartDate] = useState(
    trip?.conferenceStartDate || ''
  );
  const [conferenceEndDate, setConferenceEndDate] = useState(
    trip?.conferenceEndDate || ''
  );

  // Actual Travel dates (default: confStart - 1 day, confEnd + 1 day)
  const [startDate, setStartDate] = useState(
    trip?.startDate || (trip?.conferenceStartDate ? addDaysToDateString(trip.conferenceStartDate, -1) : '')
  );
  const [endDate, setEndDate] = useState(
    trip?.endDate || (trip?.conferenceEndDate ? addDaysToDateString(trip.conferenceEndDate, 1) : '')
  );

  // Personal leave request states
  const [hasPersonalLeave, setHasPersonalLeave] = useState(
    trip?.hasPersonalLeave ?? false
  );
  const [leaveStartDate, setLeaveStartDate] = useState(
    trip?.leaveStartDate || ''
  );
  const [leaveEndDate, setLeaveEndDate] = useState(
    trip?.leaveEndDate || ''
  );

  const [location, setLocation] = useState(trip?.location || '');
  const [country, setCountry] = useState(trip?.country || '');
  const [hostOrganization, setHostOrganization] = useState(trip?.hostOrganization || '');
  const [travelers, setTravelers] = useState<Traveler[]>(
    trip?.travelers || [
      {
        name: '',
        position: 'อาจารย์',
        positionLevel: '-',
        rank: getRankFromPositionAndLevel('อาจารย์', '-'),
        perDiemRate: 1500,
        maxAccommodationRate: 5000,
        days: 5
      }
    ]
  );
  const [budgetCode, setBudgetCode] = useState(trip?.budgetCode || '');
  const [paymentMethod, setPaymentMethod] = useState<'credit' | 'cash' | 'advance'>(
    trip?.paymentMethod || 'advance'
  );
  const [itemPaymentMethods, setItemPaymentMethods] = useState<BudgetItemPaymentMethods>(
    trip?.itemPaymentMethods || {
      flight: 'บัตรเครดิต',
      accommodation: 'เงินสด',
      perDiem: 'เงินสด',
      insurance: 'บัตรเครดิต',
      visa: 'เงินสด',
      transport: 'เงินสด'
    }
  );

  // สร้างรายการงบประมาณเริ่มต้นตามประเภทการเดินทาง — ต่างประเทศ 6 รายการ (ตั๋ว/ที่พัก/เบี้ยเลี้ยง/ประกัน/วีซ่า/พาหนะสนามบิน ข้อ 48)
  // ในประเทศ 4 รายการ (ไม่มีประกัน/วีซ่า เพราะไม่เกี่ยวกับการเดินทางในประเทศ — ที่พัก/เบี้ยเลี้ยง/พาหนะอ้างอิงข้อ 43/44)
  function buildDefaultBudgetItems(
    travelersList: Traveler[],
    days: number,
    paymentMethods: BudgetItemPaymentMethods,
    forType: TripType = tripType,
    mode: ReimbursementMode = reimbursementMode,
    planTier: string = insurancePlanTier
  ): CustomBudgetItem[] {
    const n = travelersList.length;
    const totalPerDiem = travelersList.reduce((sum, t) => sum + (t.perDiemRate * days), 0);
    const totalAccommodation = travelersList.reduce((sum, t) => sum + (t.maxAccommodationRate * (days - 1)), 0);
    const group = forType === 'INTERNATIONAL' ? countryGroupMap[country] || 5 : undefined;
    const totalLumpSum = travelersList.reduce(
      (sum, t) => sum + getLumpSumRateFor(t.position, t.positionLevel, group, forType) * days,
      0
    );

    if (forType === 'DOMESTIC') {
      const domesticTransportRate = getRegulationConstant('DOMESTIC_AIRPORT_TRANSFER_MAX', 500);
      const domesticTransportTotal = domesticTransportRate * AIRPORT_TRANSFERS_PER_TRIP * n;
      if (mode === 'LUMP_SUM') {
        return [
          { id: 'transport-main', label: '1. ค่าเดินทาง (ตั๋วเครื่องบิน/รถโดยสาร) ประมาณการ', calc: `(฿3,000 x ${n} คน)`, amount: 3000 * n, paymentMethod: paymentMethods.flight || 'บัตรเครดิต', isAuto: true },
          { id: 'lumpSum', label: '2. ค่าที่พักเหมาจ่ายรวมกับเบี้ยเลี้ยง (ข้อ 42)', calc: `(฿อัตราตำแหน่ง x ${days} วัน)`, amount: totalLumpSum, paymentMethod: paymentMethods.accommodation || 'เงินสด', isAuto: true },
          { id: 'transport', label: '3. ค่าพาหนะไป-กลับสถานีขนส่ง (ข้อ 44)', calc: `(฿${domesticTransportRate} x ${AIRPORT_TRANSFERS_PER_TRIP} เที่ยว x ${n} คน)`, amount: domesticTransportTotal, paymentMethod: paymentMethods.transport || 'เงินสด', isAuto: true },
        ];
      }
      return [
        { id: 'transport-main', label: '1. ค่าเดินทาง (ตั๋วเครื่องบิน/รถโดยสาร) ประมาณการ', calc: `(฿3,000 x ${n} คน)`, amount: 3000 * n, paymentMethod: paymentMethods.flight || 'บัตรเครดิต', isAuto: true },
        { id: 'accommodation', label: '2. ค่าที่พักควบคุมสูงสุด (ห้องเดี่ยว)', calc: `(฿อัตราตำแหน่ง x ${days - 1} คืน)`, amount: totalAccommodation, paymentMethod: paymentMethods.accommodation || 'เงินสด', isAuto: true },
        { id: 'perDiem', label: '3. ค่าเบี้ยเลี้ยงราชการ', calc: `(฿อัตราตำแหน่ง x ${days} วัน)`, amount: totalPerDiem, paymentMethod: paymentMethods.perDiem || 'เงินสด', isAuto: true },
        { id: 'transport', label: '4. ค่าพาหนะไป-กลับสถานีขนส่ง (ข้อ 44)', calc: `(฿${domesticTransportRate} x ${AIRPORT_TRANSFERS_PER_TRIP} เที่ยว x ${n} คน)`, amount: domesticTransportTotal, paymentMethod: paymentMethods.transport || 'เงินสด', isAuto: true },
      ];
    }

    const internationalTransportTotal = AIRPORT_TRANSFER_MAX_RATE * AIRPORT_TRANSFERS_PER_TRIP * n;
    const flightCostPerPerson = countryFlightCostMap[country] || DEFAULT_ESTIMATED_FLIGHT_COST;
    const flightTotal = flightCostPerPerson * n;
    const insuranceCostPerPerson = getInsuranceEstimatePerPerson(country, days, planTier);
    const insuranceTotal = insuranceCostPerPerson * n;
    const passportFee = getRegulationConstant('PASSPORT_FEE', 1000);
    const visaFeePerPerson = countryVisaFeeMap[country] ?? DEFAULT_VISA_FEE;
    const visaCostPerPerson = passportFee + visaFeePerPerson;
    const visaTotal = visaCostPerPerson * n;
    const visaCalc = visaFeePerPerson === 0
      ? `(พาสปอร์ต ฿${passportFee.toLocaleString()} — ประเทศนี้ไม่ต้องขอวีซ่า x ${n} คน)`
      : `(พาสปอร์ต ฿${passportFee.toLocaleString()} + วีซ่า ฿${visaFeePerPerson.toLocaleString()} x ${n} คน)`;
    if (mode === 'LUMP_SUM') {
      return [
        { id: 'flight', label: '1. ค่าตั๋วเครื่องบินประมาณการ', calc: `(฿${flightCostPerPerson.toLocaleString()} x ${n} คน)`, amount: flightTotal, paymentMethod: paymentMethods.flight || 'บัตรเครดิต', isAuto: true },
        { id: 'lumpSum', label: '2. ค่าที่พักเหมาจ่ายรวมกับเบี้ยเลี้ยง (ข้อ 46)', calc: `(฿อัตราตำแหน่ง x ${days} วัน)`, amount: totalLumpSum, paymentMethod: paymentMethods.accommodation || 'เงินสด', isAuto: true },
        { id: 'insurance', label: '3. ค่าประกันภัยประมาณการ', calc: `(฿${insuranceCostPerPerson.toLocaleString()} x ${n} คน)`, amount: insuranceTotal, paymentMethod: paymentMethods.insurance || 'บัตรเครดิต', isAuto: true },
        { id: 'visa', label: '4. ค่าหนังสือเดินทางราชการ/วีซ่า', calc: visaCalc, amount: visaTotal, paymentMethod: paymentMethods.visa || 'เงินสด', isAuto: true },
        { id: 'transport', label: '5. ค่าพาหนะไป-กลับสนามบิน (ข้อ 48)', calc: `(฿${AIRPORT_TRANSFER_MAX_RATE} x ${AIRPORT_TRANSFERS_PER_TRIP} เที่ยว x ${n} คน)`, amount: internationalTransportTotal, paymentMethod: paymentMethods.transport || 'เงินสด', isAuto: true },
      ];
    }
    return [
      { id: 'flight', label: '1. ค่าตั๋วเครื่องบินประมาณการ', calc: `(฿${flightCostPerPerson.toLocaleString()} x ${n} คน)`, amount: flightTotal, paymentMethod: paymentMethods.flight || 'บัตรเครดิต', isAuto: true },
      { id: 'accommodation', label: '2. ค่าที่พักควบคุมสูงสุด', calc: `(฿อัตราตำแหน่ง x ${days - 1} คืน)`, amount: totalAccommodation, paymentMethod: paymentMethods.accommodation || 'เงินสด', isAuto: true },
      { id: 'perDiem', label: '3. ค่าเบี้ยเลี้ยงราชการ', calc: `(฿อัตราตำแหน่ง x ${days} วัน)`, amount: totalPerDiem, paymentMethod: paymentMethods.perDiem || 'เงินสด', isAuto: true },
      { id: 'insurance', label: '4. ค่าประกันภัยประมาณการ', calc: `(฿${insuranceCostPerPerson.toLocaleString()} x ${n} คน)`, amount: insuranceTotal, paymentMethod: paymentMethods.insurance || 'บัตรเครดิต', isAuto: true },
      { id: 'visa', label: '5. ค่าหนังสือเดินทางราชการ/วีซ่า', calc: visaCalc, amount: visaTotal, paymentMethod: paymentMethods.visa || 'เงินสด', isAuto: true },
      { id: 'transport', label: '6. ค่าพาหนะไป-กลับสนามบิน (ข้อ 48)', calc: `(฿${AIRPORT_TRANSFER_MAX_RATE} x ${AIRPORT_TRANSFERS_PER_TRIP} เที่ยว x ${n} คน)`, amount: internationalTransportTotal, paymentMethod: paymentMethods.transport || 'เงินสด', isAuto: true },
    ];
  }

  const [budgetItems, setBudgetItems] = useState<CustomBudgetItem[]>(() => {
    if (trip?.customBudgetItems && trip.customBudgetItems.length > 0) {
      return trip.customBudgetItems;
    }
    const days = 5;
    const initialTravelers = trip?.travelers || [
      {
        name: '',
        position: 'อาจารย์',
        positionLevel: '-',
        rank: getRankFromPositionAndLevel('อาจารย์', '-'),
        perDiemRate: 1500,
        maxAccommodationRate: 5000,
        days: 5
      }
    ];
    const defaults = buildDefaultBudgetItems(initialTravelers, days, itemPaymentMethods);
    if (trip?.aiDetectedExpenses && trip.aiDetectedExpenses.length > 0) {
      const detected: CustomBudgetItem[] = trip.aiDetectedExpenses.map((exp, idx) => ({
        id: `ai-detected-${idx}-${Date.now()}`,
        label: `${defaults.length + idx + 1}. ${exp.name}`,
        calc: 'ตรวจพบจากเอกสารที่แนบ — ตรวจสอบยอดก่อนยืนยัน',
        amount: exp.amount,
        paymentMethod: 'เงินสด',
        isAuto: false
      }));
      return [...defaults, ...detected];
    }
    return defaults;
  });

  const handleBudgetItemChange = (index: number, key: keyof CustomBudgetItem, value: any) => {
    const updated = [...budgetItems];
    updated[index] = { ...updated[index], [key]: value };
    setBudgetItems(updated);
  };

  // แคตตาล็อกรายการที่เบิกได้เพิ่มเติมนอกเหนือจากรายการอัตโนมัติ — เลือกจาก dropdown เดียว แทนปุ่มเดิมที่มีจำกัด
  // แต่ละรายการเติมยอด/คำอธิบายเริ่มต้นให้ตามระเบียบ ผู้ใช้ปรับแก้ไขต่อได้เอง (isAuto: false เสมอ ไม่ถูกคำนวณทับตอนยืนยัน)
  const budgetItemCatalog: { key: string; label: string; visible: boolean; build: () => CustomBudgetItem }[] = [
    {
      key: 'privateVehicle',
      label: 'ค่าพาหนะส่วนตัว (ตามระยะทาง, ข้อ 44(3))',
      visible: true,
      build: () => ({
        id: `private-vehicle-${Date.now()}`,
        label: `${budgetItems.length + 1}. ค่าพาหนะส่วนตัว (ตามระยะทาง)`,
        calc: `รถยนต์ ฿${getRegulationConstant('DOMESTIC_CAR_RATE_PER_KM', 5)}/กม. หรือรถจักรยานยนต์ ฿${getRegulationConstant('DOMESTIC_MOTORCYCLE_RATE_PER_KM', 2)}/กม. — ระบุระยะทางจริงแล้วปรับยอด`,
        amount: 0,
        paymentMethod: 'เงินสด',
        isAuto: false
      })
    },
    {
      key: 'baggage',
      label: 'ค่าขนส่งสัมภาระใต้เครื่อง (ตามจริง)',
      visible: true,
      build: () => ({
        id: `baggage-${Date.now()}`,
        label: `${budgetItems.length + 1}. ค่าขนส่งสัมภาระใต้เครื่อง`,
        calc: 'ตามที่จ่ายจริง ต้องแสดงหลักฐานการจ่ายเมื่อขอเบิก',
        amount: 0,
        paymentMethod: 'เงินสด',
        isAuto: false
      })
    },
    {
      key: 'representation',
      label: 'ค่ารับรองและของที่ระลึก (ข้อ 50, เฉพาะผู้บริหาร)',
      visible: tripType === 'INTERNATIONAL',
      build: () => {
        const maxAmount = getRegulationConstant('REPRESENTATION_ALLOWANCE_MAX', 100000);
        return {
          id: `representation-${Date.now()}`,
          label: `${budgetItems.length + 1}. ค่ารับรองและของที่ระลึก (ข้อ 50)`,
          calc: `เฉพาะนายกสภาฯ/อธิการบดี/รองอธิการบดี/หัวหน้าส่วนงาน สูงสุดไม่เกิน ฿${maxAmount.toLocaleString()} ต่อการเดินทางหนึ่งครั้ง`,
          amount: maxAmount,
          paymentMethod: 'เงินสด',
          isAuto: false
        };
      }
    },
    {
      key: 'custom',
      label: 'รายการอื่นๆ (กำหนดเอง)',
      visible: true,
      build: () => ({
        id: `custom-${Date.now()}`,
        label: `${budgetItems.length + 1}. รายการงบประมาณเพิ่มเติม`,
        calc: 'ประมาณการเพิ่มเติม',
        amount: 1000,
        paymentMethod: 'เงินสด',
        isAuto: false
      })
    }
  ];

  const handleAddCatalogItem = (key: string) => {
    const entry = budgetItemCatalog.find((e) => e.key === key);
    if (!entry) return;
    setBudgetItems([...budgetItems, entry.build()]);
  };

  const removeBudgetItem = (index: number) => {
    setBudgetItems(budgetItems.filter((_, idx) => idx !== index));
  };

  // ปุ่ม "คำนวณตามระเบียบอัตโนมัติ" — คำนวณใหม่เฉพาะรายการที่เป็น default (isAuto:true) เท่านั้น
  // คงรายการที่ user เพิ่มเองจากแคตตาล็อก/กำหนดเอง (isAuto:false) ไว้ตามเดิม ไม่ล้างทิ้ง
  const resetToDefaultBudget = () => {
    const days = calculateReimbursableDays();
    setBudgetItems(recalculateAutoBudgetItems(budgetItems, travelers, days));
  };

  const handlePaymentMethodChange = (itemKey: keyof BudgetItemPaymentMethods, value: 'เงินสด' | 'บัตรเครดิต') => {
    setItemPaymentMethods(prev => ({
      ...prev,
      [itemKey]: value
    }));
  };

  // Find country group from country selection (ประเทศที่ไม่พบใน DB = กลุ่ม 5 ตามระเบียบ)
  const countryGroup = countryGroupMap[country] || 5;

  // File drag handlers
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

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await addFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const MAX_FILES = 5;

  // เพิ่มไฟล์เข้ารายการที่รอยืนยัน (สูงสุดรวม 5 ไฟล์) แล้วให้ AI อ่านตัวอย่างเพื่อช่วยกรอกฟอร์ม
  // ไฟล์เหล่านี้จะยังไม่ถูกบันทึกลง DB จนกว่าจะกด "ยืนยันข้อมูลโครงการ"
  const addFiles = async (newFiles: File[]) => {
    const room = MAX_FILES - pendingFiles.length - savedAttachments.length;
    if (room <= 0) {
      setError(t('a1.maxFilesError', { max: MAX_FILES }));
      return;
    }
    const selected = newFiles.slice(0, room);
    if (newFiles.length > room) {
      setError(t('a1.maxFilesRoomError', { max: MAX_FILES, room }));
    } else {
      setError(null);
    }

    const updatedPending = [...pendingFiles, ...selected];
    setPendingFiles(updatedPending);
    await previewParseFiles(updatedPending);
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ให้ AI ช่วยอ่านหนังสือเชิญเพื่อกรอกฟอร์มล่วงหน้า (preview เท่านั้น ไม่ส่ง tripId จึงยังไม่บันทึกไฟล์ลง DB)
  const previewParseFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setLoading(true);
    try {
      const encoded = await Promise.all(
        files.map(async (file) => {
          const base64 = await toBase64(file);
          return {
            fileName: file.name,
            mimeType: file.type,
            fileData: base64.split(',')[1]
          };
        })
      );

      const res = await fetch('/api/agent/a1-parse-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: encoded })
      });

      const result = await res.json();
      setIsSimulated(!!result.simulated);
      if (result.success && result.data) {
        if (result.data.documentType === 'IRRELEVANT') {
          setError(t('a1.irrelevantDocument'));
        } else {
          setError(null);
          applyParsedData(result.data);
        }
      } else {
        setError(result.error || t('a1.parseFailedError'));
      }
    } catch (e) {
      console.error("Failed to extract invitation", e);
      setError(t('a1.parseFailedError'));
    } finally {
      setLoading(false);
    }
  };

  // ข้อ 49: จำนวนวันเดินทางล่วงหน้า/กลับหลังตามทวีปปลายทาง (ต่างประเทศเท่านั้น) — ในประเทศไม่มีกำหนดไว้ในระเบียบ จึงไม่ auto วันเดินทางเกินวันประชุม (0 วัน)
  const getTravelBufferDays = (forType: TripType = tripType) => (forType === 'INTERNATIONAL' ? countryBufferMap[country] || 1 : 0);

  const handleConferenceStartDateChange = (val: string) => {
    setConferenceStartDate(val);
    if (val) {
      setStartDate(addDaysToDateString(val, -getTravelBufferDays()));
    }
  };

  const handleConferenceEndDateChange = (val: string) => {
    setConferenceEndDate(val);
    if (val) {
      setEndDate(addDaysToDateString(val, getTravelBufferDays()));
    }
  };

  // ให้ AI เป็นผู้ระบุประเภทการเดินทาง (ในประเทศ/ต่างประเทศ) จากเอกสารหนังสือเชิญเอง แทนที่จะให้ user ต้องเลือกเอง
  // ใช้ detectedType เป็นค่าที่ชัดเจนตลอดฟังก์ชันนี้ (ไม่ใช้ tripType จาก state โดยตรง เพราะ setTripType ยังไม่มีผลจนกว่าจะ re-render รอบถัดไป)
  const applyParsedData = (data: any) => {
    const detectedType: TripType = data.tripType === 'DOMESTIC' ? 'DOMESTIC' : 'INTERNATIONAL';
    setTripType(detectedType);
    setProjectName(data.projectName || '');

    // Conference dates from invitation
    const confStart = data.conferenceStartDate || data.startDate || '2026-08-10';
    const confEnd = data.conferenceEndDate || data.endDate || '2026-08-14';
    setConferenceStartDate(confStart);
    setConferenceEndDate(confEnd);

    // ข้อ 49: วันเดินทางล่วงหน้า/กลับหลัง ตามทวีปปลายทางที่ AI อ่านได้ (ต่างประเทศเท่านั้น — ในประเทศไม่มีสิทธิ์นี้ตามระเบียบ)
    const buffer = detectedType === 'INTERNATIONAL' ? countryBufferMap[data.country || country] || 1 : 0;
    const newStartDate = addDaysToDateString(confStart, -buffer);
    const newEndDate = addDaysToDateString(confEnd, buffer);
    setStartDate(newStartDate);
    setEndDate(newEndDate);

    setLocation(data.location || '');
    setHostOrganization(data.hostOrganization || '');
    if (detectedType === 'DOMESTIC') {
      setDestinationProvince(data.destinationProvince || '');
    } else if (data.country) {
      setCountry(data.country);
    }

    const days = calculateDaysBetween(newStartDate, newEndDate) || 5;
    let formattedTravelers = travelers;
    if (data.travelers && data.travelers.length > 0) {
      const activeGroup = detectedType === 'INTERNATIONAL' ? countryGroupMap[data.country || 'ญี่ปุ่น'] || 5 : undefined;
      formattedTravelers = data.travelers.map((t: any) => {
        const pos = t.position || (t.rank === 'Executive' ? 'ศาสตราจารย์' : t.rank === 'Senior Staff' ? 'ผู้ช่วยศาสตราจารย์' : 'อาจารย์');
        const level = pos === 'พนักงานมหาวิทยาลัย' ? (t.positionLevel || 'P7') : '-';
        const rankTier = getRankFromPositionAndLevel(pos, level);
        const rates = getRateFor(pos, level, activeGroup, detectedType);
        return {
          name: t.name,
          position: pos,
          positionLevel: level,
          rank: rankTier,
          perDiemRate: rates.perDiem,
          maxAccommodationRate: rates.accommodationMax,
          days: 5
        };
      });
      setTravelers(formattedTravelers);
    }
    setBudgetItems(buildDefaultBudgetItems(formattedTravelers, days, itemPaymentMethods, detectedType));
  };

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });

  // Handle traveler edits
  const handleTravelerChange = (index: number, key: keyof Traveler, value: any) => {
    const updated = [...travelers];
    const item = { ...updated[index], [key]: value };

    if (key === 'position' || key === 'positionLevel') {
      const pos = key === 'position' ? value : item.position || 'อาจารย์';
      let level = key === 'positionLevel' ? value : item.positionLevel || '-';
      if (pos !== 'พนักงานมหาวิทยาลัย') {
        level = '-';
      } else if (key === 'position') {
        // เลือกพนักงานมหาวิทยาลัยใหม่ ให้เริ่มที่ P7 เสมอ
        level = 'P7';
      }
      const rankTier = getRankFromPositionAndLevel(pos, level);
      const rates = getRateFor(pos, level, countryGroup);

      item.position = pos;
      item.positionLevel = level;
      item.rank = rankTier;
      item.perDiemRate = rates.perDiem;
      item.maxAccommodationRate = rates.accommodationMax;
    }

    updated[index] = item;
    setTravelers(updated);
  };

  const addTraveler = () => {
    const defaultPos = 'อาจารย์';
    const defaultLevel = '-';
    const rankTier = getRankFromPositionAndLevel(defaultPos, defaultLevel);
    const defaultRates = getRateFor(defaultPos, defaultLevel, countryGroup);
    setTravelers([
      ...travelers,
      {
        name: 'ชื่อผู้เข้าร่วมใหม่',
        position: defaultPos,
        positionLevel: defaultLevel,
        rank: rankTier,
        perDiemRate: defaultRates.perDiem,
        maxAccommodationRate: defaultRates.accommodationMax,
        days: 5
      }
    ]);
  };

  const removeTraveler = (index: number) => {
    if (travelers.length > 1) {
      setTravelers(travelers.filter((_, idx) => idx !== index));
    }
  };

  // สลับประเภทการเดินทาง — คำนวณอัตราเบี้ยเลี้ยง/ที่พักของผู้เดินทางทุกคนใหม่ตามชุดกฎของประเภทที่เลือก
  const handleTripTypeChange = (newType: TripType) => {
    setTripType(newType);
    const newGroup = newType === 'INTERNATIONAL' ? countryGroupMap[country] || 5 : undefined;
    const updatedTravelers = travelers.map((t) => {
      const rates = getRateFor(t.position, t.positionLevel, newGroup, newType);
      return { ...t, perDiemRate: rates.perDiem, maxAccommodationRate: rates.accommodationMax };
    });
    setTravelers(updatedTravelers);
    setBudgetItems(buildDefaultBudgetItems(updatedTravelers, calculateReimbursableDays(newType), itemPaymentMethods, newType, reimbursementMode));
  };

  // สลับรูปแบบการเบิก (เหมาจ่ายรวม/แยกเบิก) — คำนวณรายการงบประมาณอัตโนมัติใหม่ทั้งชุดตามรูปแบบที่เลือก
  const handleReimbursementModeChange = (newMode: ReimbursementMode) => {
    setReimbursementMode(newMode);
    setBudgetItems(buildDefaultBudgetItems(travelers, calculateReimbursableDays(), itemPaymentMethods, tripType, newMode));
  };

  // Calculate duration of event in days
  const calculateDays = () => {
    if (!startDate || !endDate) return 5;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = end.getTime() - start.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1; // inclusive
    return days > 0 ? days : 5;
  };

  const tripDays = calculateDays();

  // ข้อ 49: ผู้เดินทางเลือกวันไปราชการเกินสิทธิ์ที่ระเบียบอนุญาต (ก่อน/หลังงานประชุม ± จำนวนวันตามทวีปปลายทาง) ได้
  // แต่ถ้าเกินสิทธิ์ จะเบิกเบี้ยเลี้ยง/ที่พัก/ค่าใช้จ่ายรายวันอื่นๆ ได้แค่ถึงขอบเขตสูงสุดที่ระเบียบอนุญาต ตัดเฉพาะวันที่เกินสิทธิ์ออก
  // (ไม่ตัดสิทธิ์บัฟเฟอร์ทั้งฝั่ง — ยังได้เครดิตวันพิเศษเต็มตามสิทธิ์ปกติ) เฉพาะต่างประเทศ ในประเทศไม่มีข้อ 49 กำหนดไว้ ใช้ tripDays ตามปกติ
  // ใช้เฉพาะกับรายการที่คิดตามจำนวนวัน (เบี้ยเลี้ยง/ที่พัก/เหมาจ่าย/ประกัน) — ไม่กระทบ traveler.days ซึ่งยังคงบันทึกวันเดินทางจริงไว้เพื่อใช้ในเอกสาร/บันทึกอนุมัติ
  const calculateReimbursableDays = (forType: TripType = tripType) => {
    if (forType !== 'INTERNATIONAL' || !conferenceStartDate || !conferenceEndDate || !startDate || !endDate) {
      return tripDays;
    }
    const buffer = getTravelBufferDays(forType);
    const allowedStart = addDaysToDateString(conferenceStartDate, -buffer);
    const allowedEnd = addDaysToDateString(conferenceEndDate, buffer);
    const effectiveStart = startDate < allowedStart ? allowedStart : startDate;
    const effectiveEnd = endDate > allowedEnd ? allowedEnd : endDate;
    return calculateDaysBetween(effectiveStart, effectiveEnd) || tripDays;
  };

  const reimbursableDays = calculateReimbursableDays();

  // วันที่ dateStr เป็น "วันทำการ" หรือไม่ (ไม่ใช่เสาร์-อาทิตย์ และไม่อยู่ในตาราง PublicHoliday)
  const isWorkingDay = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return dow !== 0 && dow !== 6 && !publicHolidaySet.has(dateStr);
  };

  // ไล่วันที่ทั้งหมดตั้งแต่ from ถึง to (รวมปลายทั้ง 2 ข้าง) แล้วคัดเฉพาะวันทำการ
  const getWorkingDaysInRange = (from: string, to: string): string[] => {
    const days: string[] = [];
    let cur = from;
    let guard = 0;
    while (cur <= to && guard < 60) {
      if (isWorkingDay(cur)) days.push(cur);
      cur = addDaysToDateString(cur, 1);
      guard++;
    }
    return days;
  };

  // ข้อ 49: ถ้าผู้ใช้เลือกวันเดินทางเกินสิทธิ์บัฟเฟอร์ (ก่อน/หลังช่วงประชุม) วันทำการส่วนที่เกินต้องยื่นลากิจ/ลาพักผ่อนเพิ่มเติม
  // (วันเสาร์-อาทิตย์/วันหยุดราชการที่ตกอยู่ในส่วนที่เกินไม่ต้องลา เพราะเป็นวันหยุดอยู่แล้ว) — auto-check ให้เมื่อพบว่าต้องลา
  // แต่จะไม่ auto-uncheck ให้ ถ้า user เคยติ๊กเองไว้ก่อนด้วยเหตุผลอื่น เพื่อไม่ไปเขียนทับข้อมูลที่ user กรอกเอง
  useEffect(() => {
    if (tripType !== 'INTERNATIONAL' || !conferenceStartDate || !conferenceEndDate || !startDate || !endDate) return;
    const buffer = getTravelBufferDays();
    const allowedStart = addDaysToDateString(conferenceStartDate, -buffer);
    const allowedEnd = addDaysToDateString(conferenceEndDate, buffer);

    const beforeDays = startDate < allowedStart ? getWorkingDaysInRange(startDate, addDaysToDateString(allowedStart, -1)) : [];
    const afterDays = endDate > allowedEnd ? getWorkingDaysInRange(addDaysToDateString(allowedEnd, 1), endDate) : [];

    if (beforeDays.length === 0 && afterDays.length === 0) {
      setLeaveAdvisory(null);
      return;
    }

    const chosen = beforeDays.length >= afterDays.length ? beforeDays : afterDays;
    setHasPersonalLeave(true);
    setLeaveStartDate(chosen[0]);
    setLeaveEndDate(chosen[chosen.length - 1]);
    setLeaveAdvisory(
      beforeDays.length > 0 && afterDays.length > 0
        ? t('a1.leaveAdvisoryBoth')
        : null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripType, conferenceStartDate, conferenceEndDate, startDate, endDate, country, publicHolidaySet]);

  // Dynamic calculations for total estimated budget from editable items
  const grandTotal = budgetItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const REQUIRED_FIELD_ERROR = t('a1.requiredFieldError');

  const isProjectInfoComplete = () => {
    const common =
      !!projectName.trim() &&
      !!location.trim() &&
      !!conferenceStartDate &&
      !!conferenceEndDate &&
      !!startDate &&
      !!endDate &&
      !!hostOrganization.trim();
    const hasNamedTravelers = travelers.length > 0 && travelers.every((t) => !!t.name.trim());
    if (tripType === 'DOMESTIC') return common && !!destinationProvince.trim() && hasNamedTravelers;
    return common && !!country && hasNamedTravelers;
  };

  const hasAnyAttachedFile = () => pendingFiles.length > 0 || savedAttachments.length > 0;

  // คำนวณ amount/calc ของรายการอัตโนมัติ (isAuto: true) ใหม่จากอัตราปัจจุบันของผู้เดินทางเสมอ (ตาม RULE ใน getRateFor/buildDefaultBudgetItems)
  // เพื่อไม่ให้ยอดเงินค้างจากตอนที่ traveler ยังไม่ได้แก้ตำแหน่ง/จำนวนคนล่าสุด — คงรายการที่ user เพิ่มเอง (isAuto:false) และ paymentMethod ที่แก้ไว้เป็นรายรายการไว้ตามเดิม
  const recalculateAutoBudgetItems = (items: CustomBudgetItem[], travelersList: Traveler[], days: number): CustomBudgetItem[] => {
    const fresh = buildDefaultBudgetItems(travelersList, days, itemPaymentMethods);
    const freshById = new Map(fresh.map((f) => [f.id, f]));
    return items.map((item) => {
      if (!item.isAuto) return item;
      const freshItem = freshById.get(item.id);
      if (!freshItem) return item;
      return { ...item, amount: freshItem.amount, calc: freshItem.calc };
    });
  };

  const buildTripPayload = (status: TripPlan['status'], budgetItemsOverride?: CustomBudgetItem[]): TripPlan => {
    const items = budgetItemsOverride || budgetItems;
    const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    return {
      id: trip?.id || `trip-${Date.now()}`,
      tripType,
      reimbursementMode,
      insurancePlanTier: insurancePlanTier as InsurancePlanTierKey,
      projectName,
      conferenceStartDate,
      conferenceEndDate,
      startDate,
      endDate,
      hasPersonalLeave,
      leaveStartDate: hasPersonalLeave ? leaveStartDate : undefined,
      leaveEndDate: hasPersonalLeave ? leaveEndDate : undefined,
      location,
      country: tripType === 'INTERNATIONAL' ? country : undefined,
      countryGroup: tripType === 'INTERNATIONAL' ? countryGroup : undefined,
      destinationProvince: tripType === 'DOMESTIC' ? destinationProvince : undefined,
      hostOrganization,
      travelers: travelers.map(t => ({ ...t, days: tripDays })),
      budgetCode,
      paymentMethod,
      itemPaymentMethods,
      customBudgetItems: items,
      estimatedBudget: total,
      status,
      createdAt: trip?.createdAt || new Date().toISOString()
    };
  };

  // ยืนยันข้อมูลโครงการ: คำนวณเบี้ยเลี้ยง/รายการค่าใช้จ่ายอัตโนมัติใหม่ทุกครั้งจากตำแหน่งผู้เดินทางปัจจุบัน (ตาม RULE ใน getRateFor/buildDefaultBudgetItems)
  // แล้วบันทึกทริปนี้ + ไฟล์ที่แนบไว้ลง database ทันที
  const handleConfirmProjectInfo = async () => {
    if (!trip?.id) return;
    if (!isProjectInfoComplete() || !hasAnyAttachedFile()) {
      setError(REQUIRED_FIELD_ERROR);
      return;
    }
    setError(null);
    setConfirmLoading(true);
    try {
      const recalculatedItems = recalculateAutoBudgetItems(budgetItems, travelers, reimbursableDays);
      setBudgetItems(recalculatedItems);
      onUpdateTrip(buildTripPayload('A1_DRAFT', recalculatedItems));

      if (pendingFiles.length > 0) {
        const encoded = await Promise.all(
          pendingFiles.map(async (file) => {
            const base64 = await toBase64(file);
            return {
              fileName: file.name,
              mimeType: file.type,
              fileData: base64.split(',')[1]
            };
          })
        );
        const res = await fetch(`/api/trips/${trip.id}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'INVITATION_LETTER', files: encoded })
        });
        const result = await res.json();
        if (!result.success) {
          setError(result.error || t('a1.saveAttachmentFailed'));
          return;
        }
        const created: { id: string; fileName: string }[] = result.data || [];
        setSavedAttachments((prev) => [...prev, ...created.map((a) => ({ id: a.id, fileName: a.fileName }))]);
        setPendingFiles([]);
      }
      setProjectConfirmed(true);
    } catch (e) {
      console.error('Failed to confirm project info', e);
      setError(t('a1.saveError'));
    } finally {
      setConfirmLoading(false);
    }
  };

  // Save changes to trip and proceed to Agent 2
  const handleSaveAndNext = () => {
    if (!isProjectInfoComplete() || !hasAnyAttachedFile()) {
      setError(REQUIRED_FIELD_ERROR);
      return;
    }
    if (!projectConfirmed) {
      setError(t('a1.confirmBeforeProceed'));
      return;
    }
    setError(null);
    const recalculatedItems = recalculateAutoBudgetItems(budgetItems, travelers, reimbursableDays);
    setBudgetItems(recalculatedItems);
    onUpdateTrip(buildTripPayload('A2_SEARCHING', recalculatedItems));
    onNextStep();
  };

  return (
    <div className="space-y-8">
      {/* Introduction Banner */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-950 flex items-center gap-2">
            <BookOpen className="text-blue-600" size={22} />
            {t('a1.heading')}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {t('a1.subheading')}
          </p>
        </div>
        <div className="bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 flex items-center gap-1.5 text-xs text-blue-700 font-semibold">
          <Sparkles size={14} className="animate-spin text-blue-600" />
          AI Reader Active
        </div>
      </div>

      {/* Trip Type: AI ตรวจจับอัตโนมัติจากเอกสารที่แนบ (ข้อ 42-45 ในประเทศ / ข้อ 46-51 ต่างประเทศ) — ไม่บังคับให้ user ต้องเลือกเอง แก้ไขได้หากตรวจผิด */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-slate-500">{t('a1.tripType')}</span>
        <div className="inline-flex gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => handleTripTypeChange('DOMESTIC')}
            className={`px-4 py-1.5 rounded-lg transition-all ${
              tripType === 'DOMESTIC' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t('a1.domestic')}
          </button>
          <button
            type="button"
            onClick={() => handleTripTypeChange('INTERNATIONAL')}
            className={`px-4 py-1.5 rounded-lg transition-all ${
              tripType === 'INTERNATIONAL' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t('a1.international')}
          </button>
        </div>
        <span className="inline-flex items-center gap-1 text-2xs text-slate-400">
          <Sparkles size={11} />
          {t('a1.autoDetected')}
        </span>
      </div>

      {/* รูปแบบการเบิก: เหมาจ่ายรวม (ข้อ 42/46) vs แยกเบิกที่พักตามจริง+เบี้ยเลี้ยงเหมาจ่าย (ข้อ 43/47) */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-slate-500">{t('a1.reimbursementMode')}</span>
        <div className="inline-flex gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => handleReimbursementModeChange('ITEMIZED')}
            className={`px-4 py-1.5 rounded-lg transition-all ${
              reimbursementMode === 'ITEMIZED' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t('a1.itemized')}
          </button>
          <button
            type="button"
            onClick={() => handleReimbursementModeChange('LUMP_SUM')}
            className={`px-4 py-1.5 rounded-lg transition-all ${
              reimbursementMode === 'LUMP_SUM' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t('a1.lumpSum')}
          </button>
        </div>
        <span className="text-2xs text-slate-400">
          {reimbursementMode === 'ITEMIZED'
            ? (tripType === 'DOMESTIC' ? 'ข้อ 43: ที่พักเบิกตามจริง (ไม่เกินเพดาน) + เบี้ยเลี้ยงเหมาจ่ายแยกรายการ' : 'ข้อ 47: ที่พักเบิกตามจริง (ไม่เกินเพดาน) + เบี้ยเลี้ยงเหมาจ่ายแยกรายการ')
            : (tripType === 'DOMESTIC' ? 'ข้อ 42: เหมาจ่ายที่พัก+เบี้ยเลี้ยงรวมเป็นอัตราเดียวต่อวัน' : 'ข้อ 46: เหมาจ่ายที่พัก+เบี้ยเลี้ยงรวมเป็นอัตราเดียวต่อวัน')}
        </span>
      </div>

      {/* File Upload Zone */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">{t('a1.uploadStepTitle')}</h3>
          
          <div
            className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all ${
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
              id="invitation-upload"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileInput}
              accept=".pdf,image/*"
              multiple
            />
            <div className="space-y-2">
              <div className="mx-auto w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center border border-blue-200">
                <Upload size={20} />
              </div>
              <p className="text-xs font-bold text-slate-800">{t('dashboard.dropOrClick')}</p>
              <p className="text-2xs text-slate-500">
                <span className="text-red-500 font-bold">{t('a1.required')}</span> {t('a1.uploadFormats', { max: MAX_FILES })}
              </p>
            </div>
          </div>

          {(savedAttachments.length > 0 || pendingFiles.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {savedAttachments.map((att) => (
                <span
                  key={`saved-${att.id}`}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-1 bg-emerald-50 border border-emerald-100 rounded-md text-2xs font-semibold text-emerald-800 max-w-full"
                  title={t('a1.savedFileTitle', { name: att.fileName })}
                >
                  <FileCheck size={11} className="shrink-0" />
                  <span className="truncate">{att.fileName}</span>
                  <a
                    href={`/api/trips/${trip.id}/attachments/${att.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('a1.viewOriginal')}
                    className="p-0.5 text-emerald-500 hover:text-emerald-700 rounded shrink-0"
                  >
                    <Eye size={11} />
                  </a>
                  <button
                    type="button"
                    onClick={() => removeSavedAttachment(att.id)}
                    disabled={deletingAttachmentId === att.id}
                    title={t('a1.removeFromSystem')}
                    className="p-0.5 text-emerald-500 hover:text-red-500 rounded shrink-0 disabled:opacity-50"
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              ))}
              {pendingFiles.map((file, idx) => (
                <span
                  key={`pending-${file.name}-${idx}`}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-1 bg-blue-50 border border-blue-100 rounded-md text-2xs font-semibold text-blue-800 max-w-full"
                  title={file.name}
                >
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    title={t('a1.removeThisFile')}
                    className="p-0.5 text-blue-400 hover:text-red-500 rounded shrink-0"
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {!loading && isSimulated && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-2xs text-amber-900 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>{t('dashboard.simulatedModeTitle')}</strong> {t('a1.simulatedModeBody')}
              </span>
            </div>
          )}

          {/* Quick Info Box — สลับเนื้อหาตามประเภทการเดินทาง x รูปแบบการเบิก (4 ชุด) */}
          {tripType === 'DOMESTIC' && reimbursementMode === 'ITEMIZED' && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-600 space-y-2">
              <h4 className="font-bold text-slate-900 flex items-center gap-1">
                <AlertCircle size={14} className="text-slate-500" />
                ข้อกำหนดระเบียบ พ.ศ. 2563 (ข้อ 43 การเดินทางในประเทศ แยกรายการ)
              </h4>
              {(['TIER1', 'TIER2', 'TIER3', 'TIER4'] as const).map((t) => {
                const accRow = domesticAccommodationRates.find((r) => r.tier === t);
                if (!accRow) return null;
                return (
                  <p key={t} className="leading-relaxed">
                    <strong>{t}</strong>: ที่พักเดี่ยวสูงสุด {accRow.singleRoomMax.toLocaleString()} บาท/วัน, ห้องคู่สูงสุด {accRow.twinRoomMax.toLocaleString()} บาท/วัน/คน
                  </p>
                );
              })}
              {(['TIER_A', 'TIER_B'] as const).map((t) => {
                const row = domesticPerDiemRates.find((r) => r.tier === t);
                if (!row) return null;
                return (
                  <p key={t} className="leading-relaxed">
                    <strong>เบี้ยเลี้ยง {t === 'TIER_A' ? 'กลุ่ม A' : 'กลุ่ม B'}</strong>: {row.ratePerDay.toLocaleString()} บาท/วัน
                  </p>
                );
              })}
            </div>
          )}
          {tripType === 'DOMESTIC' && reimbursementMode === 'LUMP_SUM' && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-600 space-y-2">
              <h4 className="font-bold text-slate-900 flex items-center gap-1">
                <AlertCircle size={14} className="text-slate-500" />
                ข้อกำหนดระเบียบ พ.ศ. 2563 (ข้อ 42 การเดินทางในประเทศ เหมาจ่ายรวม)
              </h4>
              {(['TIER1', 'TIER2', 'TIER3', 'TIER4'] as const).map((t) => {
                const row = domesticLumpSumRates.find((r) => r.tier === t);
                if (!row) return null;
                return (
                  <p key={t} className="leading-relaxed">
                    <strong>{t}</strong>: เหมาจ่ายรวมที่พัก+เบี้ยเลี้ยง {row.ratePerDay.toLocaleString()} บาท/วัน/คน
                  </p>
                );
              })}
            </div>
          )}
          {tripType === 'INTERNATIONAL' && reimbursementMode === 'ITEMIZED' && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-600 space-y-2">
              <h4 className="font-bold text-slate-900 flex items-center gap-1">
                <AlertCircle size={14} className="text-slate-500" />
                ข้อกำหนดระเบียบ พ.ศ. 2563 (ข้อ 47 แยกรายการ, ตำแหน่ง TIER1)
              </h4>
              {[1, 2, 3, 4, 5].map((g) => {
                const row = policyRates.find((r) => r.tier === 'TIER1' && r.countryGroup === g);
                if (!row) return null;
                return (
                  <p key={g} className="leading-relaxed">
                    <strong>กลุ่ม {g}</strong>: เบี้ยเลี้ยง สูงสุด {row.perDiemItemized.toLocaleString()} บาท/วัน, ที่พักสูงสุด {row.accommodationMax.toLocaleString()} บาท/คืน
                  </p>
                );
              })}
            </div>
          )}
          {tripType === 'INTERNATIONAL' && reimbursementMode === 'LUMP_SUM' && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs text-slate-600 space-y-2">
              <h4 className="font-bold text-slate-900 flex items-center gap-1">
                <AlertCircle size={14} className="text-slate-500" />
                ข้อกำหนดระเบียบ พ.ศ. 2563 (ข้อ 46 เหมาจ่ายรวม, ตำแหน่ง TIER1)
              </h4>
              {[1, 2, 3, 4, 5].map((g) => {
                const row = policyRates.find((r) => r.tier === 'TIER1' && r.countryGroup === g);
                if (!row) return null;
                return (
                  <p key={g} className="leading-relaxed">
                    <strong>กลุ่ม {g}</strong>: เหมาจ่ายรวมที่พัก+เบี้ยเลี้ยง {row.perDiemLumpSum.toLocaleString()} บาท/วัน/คน
                  </p>
                );
              })}
            </div>
          )}

          {/* Flight Class Advisory: ข้อ 44(4) [ในประเทศ] / ข้อ 48(2) [ต่างประเทศ] — คำแนะนำเท่านั้น ไม่มีผลต่อยอดเงิน */}
          {flightClassRules.filter((r) => r.scope === tripType).length > 0 && (
            <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 text-xs text-sky-900 space-y-1.5">
              <h4 className="font-bold text-sky-950 flex items-center gap-1">
                <AlertCircle size={14} className="text-sky-600" />
                สิทธิ์ชั้นโดยสารเครื่องบินตามตำแหน่ง ({tripType === 'DOMESTIC' ? 'ข้อ 44(4)' : 'ข้อ 48(2)'})
              </h4>
              {flightClassRules
                .filter((r) => r.scope === tripType)
                .map((r) => (
                  <p key={r.id} className="leading-relaxed">
                    <strong>{r.positionLabel}</strong>: {r.maxClass}
                    {r.exceptionMaxClass && r.exceptionThresholdHours && (
                      <> (บินเกิน {r.exceptionThresholdHours} ชม. ได้ไม่เกิน {r.exceptionMaxClass})</>
                    )}
                  </p>
                ))}
            </div>
          )}
        </div>

        {/* Edit and confirm Form */}
        <div className="lg:col-span-2 bg-white border border-slate-100 rounded-xl p-6 shadow-xs space-y-6">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            {t('a1.step2Title')}
          </h3>

          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-500 font-medium">{t('a1.aiReading')}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Main Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">{t('a1.projectName')} <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder={t('a1.projectNamePlaceholder')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                {tripType === 'DOMESTIC' ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">{t('a1.destinationProvince')} <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={destinationProvince}
                      onChange={(e) => setDestinationProvince(e.target.value)}
                      placeholder={t('a1.destinationProvincePlaceholder')}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">{t('a1.destinationCountry')} <span className="text-red-500">*</span></label>
                    <select
                      value={country}
                      onChange={(e) => {
                        const newCountry = e.target.value;
                        setCountry(newCountry);
                        const newGroup = countryGroupMap[newCountry] || 5;
                        setTravelers(prev => prev.map(t => {
                          const rates = getRateFor(t.position, t.positionLevel, newGroup);
                          return {
                            ...t,
                            perDiemRate: rates.perDiem,
                            maxAccommodationRate: rates.accommodationMax
                          };
                        }));
                        // ข้อ 49: ปรับวันเดินทางล่วงหน้า/กลับหลังตามทวีปของประเทศใหม่ ถ้ากรอกวันประชุมไว้แล้ว
                        const newBuffer = countryBufferMap[newCountry] || 1;
                        if (conferenceStartDate) setStartDate(addDaysToDateString(conferenceStartDate, -newBuffer));
                        if (conferenceEndDate) setEndDate(addDaysToDateString(conferenceEndDate, newBuffer));
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden bg-white"
                    >
                      <option value="">{t('a1.selectCountry')}</option>
                      {[1, 2, 3, 4, 5].map((g) => (
                        <optgroup key={g} label={`${t('table.group')} ${g}`}>
                          {Object.keys(countryGroupMap)
                            .filter((c) => countryGroupMap[c] === g)
                            .map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">{t('a1.venue')} <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t('a1.venuePlaceholder')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                {/* 1. Conference Dates according to Invitation */}
                <div className="space-y-1.5 bg-blue-50/60 p-3 rounded-lg border border-blue-100">
                  <label className="text-xs font-bold text-blue-900 block flex flex-col lg:flex-row lg:items-center lg:justify-between gap-0.5">
                    <span>{t('a1.conferenceStartDate')} <span className="text-red-500">*</span></span>
                    <span className="text-3xs font-normal text-blue-700">{getTravelBufferDays() === 0 ? t('a1.travelDateOffsetNone') : t('a1.travelDateOffsetMinus', { n: getTravelBufferDays() })}</span>
                  </label>
                  <input
                    type="date"
                    value={conferenceStartDate}
                    onChange={(e) => handleConferenceStartDateChange(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white focus:border-blue-500 focus:outline-hidden font-semibold text-blue-950"
                  />
                </div>

                <div className="space-y-1.5 bg-blue-50/60 p-3 rounded-lg border border-blue-100">
                  <label className="text-xs font-bold text-blue-900 block flex flex-col lg:flex-row lg:items-center lg:justify-between gap-0.5">
                    <span>{t('a1.conferenceEndDate')} <span className="text-red-500">*</span></span>
                    <span className="text-3xs font-normal text-blue-700">{getTravelBufferDays() === 0 ? t('a1.travelDateOffsetNone') : t('a1.travelDateOffsetPlus', { n: getTravelBufferDays() })}</span>
                  </label>
                  <input
                    type="date"
                    value={conferenceEndDate}
                    onChange={(e) => handleConferenceEndDateChange(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white focus:border-blue-500 focus:outline-hidden font-semibold text-blue-950"
                  />
                </div>

                {/* Official Travel Dates */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('a1.officialStartDate')} <span className="text-red-500">*</span> <span className="text-3xs text-slate-500 font-normal">{getTravelBufferDays() === 0 ? t('a1.officialDateDefaultNone') : t('a1.officialStartDateDefault', { n: getTravelBufferDays(), suffix: tripType === 'INTERNATIONAL' ? t('a1.perContinentSuffix') : '' })}</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('a1.officialEndDate')} <span className="text-red-500">*</span> <span className="text-3xs text-slate-500 font-normal">{getTravelBufferDays() === 0 ? t('a1.officialDateDefaultNone') : t('a1.officialEndDateDefault', { n: getTravelBufferDays(), suffix: tripType === 'INTERNATIONAL' ? t('a1.perContinentSuffix') : '' })}</span>
                  </label>

                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">{t('a1.hostOrganization')} <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={hostOrganization}
                    onChange={(e) => setHostOrganization(e.target.value)}
                    placeholder={t('a1.hostOrganizationPlaceholder')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">{t('a1.paymentMethod')}</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden bg-white"
                  >
                    <option value="advance">{t('a1.paymentAdvance')}</option>
                    <option value="credit">{t('a1.paymentCredit')}</option>
                    <option value="cash">{t('a1.paymentCash')}</option>
                  </select>
                </div>
              </div>

              {/* Travelers Section — ต้องกรอกก่อนยืนยัน เพราะตำแหน่งมีผลโดยตรงต่อเบี้ยเลี้ยง/ที่พัก/งบประมาณด้านล่าง */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900 flex items-start gap-1.5">
                    <User size={14} className="text-slate-500 shrink-0 mt-0.5" />
                    <span>
                      {t('a1.travelersTitle')} <span className="text-red-500">*</span>
                      {tripType === 'INTERNATIONAL' ? ` ${t('a1.rateByCountryGroup', { group: countryGroup })}` : ` ${t('a1.rateByPositionLevel')}`}
                    </span>
                  </h4>
                  <button
                    type="button"
                    onClick={addTraveler}
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-500 font-semibold shrink-0"
                  >
                    <Plus size={14} />
                    {t('a1.addTraveler')}
                  </button>
                </div>

                <div className="space-y-3">
                  {travelers.map((traveler, index) => (
                    <div
                      key={index}
                      className="flex flex-col gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      <div className="w-full">
                        <label className="text-3xs font-semibold text-slate-500 block mb-0.5">{t('a1.travelerName')} <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={traveler.name}
                          onChange={(e) => handleTravelerChange(index, 'name', e.target.value)}
                          placeholder={t('a1.travelerNamePlaceholder')}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden"
                        />
                      </div>

                      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2.5">
                        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2 w-full lg:w-auto">
                          <div className="flex flex-col space-y-0.5 w-full lg:w-auto">
                            <label className="text-3xs font-semibold text-slate-500">{t('a1.position')} <span className="text-red-500">*</span></label>
                            <select
                              value={traveler.position || 'อาจารย์'}
                              onChange={(e) => handleTravelerChange(index, 'position', e.target.value)}
                              className="w-full lg:w-auto px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden font-medium text-slate-800"
                            >
                              {POSITION_OPTIONS.map((pos) => (
                                <option key={pos} value={pos}>
                                  {pos}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-col space-y-0.5 w-full lg:w-auto">
                            <label className="text-3xs font-semibold text-slate-500">{t('a1.positionLevel')}</label>
                            {traveler.position === 'พนักงานมหาวิทยาลัย' ? (
                              <select
                                value={traveler.positionLevel || 'P1'}
                                onChange={(e) => handleTravelerChange(index, 'positionLevel', e.target.value)}
                                className="w-full lg:w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden font-medium text-slate-800"
                              >
                                {POSITION_LEVEL_OPTIONS.filter((lvl) => lvl !== '-').map((lvl) => (
                                  <option key={lvl} value={lvl}>
                                    {lvl}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="w-full lg:w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-100 text-slate-400 font-medium">
                                -
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-2xs text-slate-500 space-y-0.5 min-w-[125px]">
                          {reimbursementMode === 'LUMP_SUM' ? (
                            <div>
                              {t('a1.lumpSumRateLabel')}:{' '}
                              <span className="font-bold text-slate-800">
                                ฿{getLumpSumRateFor(traveler.position, traveler.positionLevel, tripType === 'INTERNATIONAL' ? countryGroup : undefined).toLocaleString()}{t('a1.perDay')}
                              </span>
                            </div>
                          ) : (
                            <>
                              <div>
                                {t('a1.perDiemLabel')}:{' '}
                                <span className="font-bold text-slate-800">
                                  ฿{traveler.perDiemRate.toLocaleString()}{t('a1.perDay')}
                                </span>
                              </div>
                              <div>
                                {t('a1.maxAccommodationLabel')}:{' '}
                                <span className="font-bold text-slate-800">
                                  ฿{traveler.maxAccommodationRate.toLocaleString()}{t('a1.perNight')}
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeTraveler(index)}
                          disabled={travelers.length <= 1}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-md hover:bg-slate-100 disabled:opacity-40 ml-auto"
                          title={t('a1.removeTraveler')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Confirm project info: บันทึกทริป + ไฟล์แนบลง DB, ปลดล็อกการคำนวณเบี้ยเลี้ยง/รายการค่าใช้จ่ายด้านล่าง */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="text-2xs text-slate-600">
                  {projectConfirmed ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold">
                      <FileCheck size={14} />
                      {t('a1.savedConfirmed')}
                    </span>
                  ) : (
                    <span>{t('a1.fillRequiredFields')}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleConfirmProjectInfo}
                  disabled={confirmLoading}
                  className="shrink-0 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg shadow-md shadow-emerald-950/10 transition-all flex items-center justify-center gap-1.5"
                >
                  <FileCheck size={14} />
                  {confirmLoading ? t('a1.saving') : projectConfirmed ? t('a1.confirmAgain') : t('a1.confirmProjectInfo')}
                </button>
              </div>

              {/* 2. Checkbox: ลาเพิ่มเติม */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasPersonalLeave}
                    onChange={(e) => {
                      setHasPersonalLeave(e.target.checked);
                      if (e.target.checked && !leaveStartDate) {
                        setLeaveStartDate(addDaysToDateString(endDate, 1));
                        setLeaveEndDate(addDaysToDateString(endDate, 3));
                      }
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      {t('a1.leaveTitle')}
                    </span>
                    <span className="text-3xs text-slate-500">
                      {t('a1.leaveDescription')}
                      {tripType === 'INTERNATIONAL' && ` ${t('a1.leaveAutoNote')}`}
                    </span>
                  </div>
                </label>

                {leaveAdvisory && (
                  <div className="text-3xs text-amber-900 bg-amber-100/80 p-2 rounded border border-amber-200 flex items-start gap-1.5 font-medium">
                    <AlertCircle size={14} className="text-amber-700 shrink-0 mt-0.5" />
                    <span>{leaveAdvisory}</span>
                  </div>
                )}

                {hasPersonalLeave && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/80">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">{t('a1.leaveStartDate')}</label>
                      <input
                        type="date"
                        value={leaveStartDate}
                        onChange={(e) => setLeaveStartDate(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:border-indigo-500 focus:outline-hidden font-medium"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">{t('a1.leaveEndDate')}</label>
                      <input
                        type="date"
                        value={leaveEndDate}
                        onChange={(e) => setLeaveEndDate(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:border-indigo-500 focus:outline-hidden font-medium"
                      />
                    </div>
                    <div className="col-span-full text-3xs text-amber-800 bg-amber-50/80 p-2 rounded border border-amber-200">
                      {t('a1.leaveNote')}
                    </div>
                  </div>
                )}
              </div>

              {/* Preliminary Budget Calculation Preview */}
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Calendar size={14} className="text-blue-600" />
                    {t('a1.budgetSummaryTitle', { days: tripDays, nights: tripDays - 1 })}
                  </div>
                  <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-2">
                    <button
                      type="button"
                      onClick={resetToDefaultBudget}
                      className="w-full xl:w-auto inline-flex items-center justify-center gap-1 text-2xs text-slate-600 hover:text-slate-900 font-semibold bg-white hover:bg-slate-100 px-2 py-1 rounded border border-slate-200 transition-colors"
                      title={t('a1.resetBudgetTitle')}
                    >
                      <RotateCcw size={12} />
                      {t('a1.autoCalculate')}
                    </button>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handleAddCatalogItem(e.target.value);
                        e.target.value = '';
                      }}
                      className="w-full xl:w-auto text-2xs text-indigo-700 font-bold bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded border border-indigo-200 transition-colors cursor-pointer focus:outline-hidden"
                    >
                      <option value="">{t('a1.addBudgetItem')}</option>
                      {budgetItemCatalog
                        .filter((entry) => entry.visible)
                        .map((entry) => (
                          <option key={entry.key} value={entry.key}>
                            {entry.label}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {budgetItems.map((item, index) => (
                    <div
                      key={item.id || index}
                      className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs flex flex-col xl:flex-row xl:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 space-y-1.5 min-w-0 xl:min-w-[200px]">
                        <input
                          type="text"
                          value={item.label}
                          onChange={(e) => handleBudgetItemChange(index, 'label', e.target.value)}
                          className="w-full font-bold text-slate-900 px-2 py-1 border border-slate-200 rounded focus:border-indigo-500 focus:outline-hidden bg-slate-50/50"
                          placeholder={t('a1.budgetItemNamePlaceholder')}
                        />
                        <input
                          type="text"
                          value={item.calc}
                          onChange={(e) => handleBudgetItemChange(index, 'calc', e.target.value)}
                          className="w-full text-2xs text-slate-500 font-medium px-2 py-0.5 border border-slate-200/60 rounded focus:border-indigo-500 focus:outline-hidden bg-slate-50/30"
                          placeholder={t('a1.budgetItemCalcPlaceholder')}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between xl:justify-end gap-2.5 shrink-0 pt-2 xl:pt-0 border-t xl:border-t-0 border-slate-100">
                        <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-200">
                          <label className="text-2xs font-bold text-slate-600 shrink-0">{t('a1.paidBy')}</label>
                          <select
                            value={item.paymentMethod}
                            onChange={(e) => handleBudgetItemChange(index, 'paymentMethod', e.target.value as 'เงินสด' | 'บัตรเครดิต')}
                            className="bg-transparent text-xs font-bold text-blue-700 focus:outline-hidden cursor-pointer"
                          >
                            <option value="เงินสด">{t('a1.cash')}</option>
                            <option value="บัตรเครดิต">{t('a1.credit')}</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-slate-600">฿</span>
                          <input
                            type="number"
                            value={item.amount}
                            onChange={(e) => handleBudgetItemChange(index, 'amount', Number(e.target.value) || 0)}
                            className="w-28 text-right font-bold text-slate-900 font-mono px-2 py-1 border border-slate-200 rounded focus:border-indigo-500 focus:outline-hidden bg-slate-50/50"
                            placeholder="0"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeBudgetItem(index)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-md hover:bg-slate-100 transition-colors"
                          title={t('a1.removeItem')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="border-t border-slate-200 pt-3 flex justify-between items-center text-sm font-bold text-slate-950">
                    <span>{t('a1.grandTotal')}</span>
                    <span className="font-mono text-base text-blue-700">฿{grandTotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* On-screen custom warning instead of alert */}
              {error && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-850 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-600 shrink-0" />
                  <span className="font-semibold">{error}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end pt-3">
                <button
                  id="btn-save-a1"
                  type="button"
                  onClick={handleSaveAndNext}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-md shadow-blue-950/20 transition-all flex items-center gap-1.5"
                >
                  <Sparkles size={14} />
                  {t('a1.confirmAndProceed')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
