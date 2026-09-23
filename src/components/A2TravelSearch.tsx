/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Plane,
  Shield,
  Search,
  Sparkles,
  Check,
  Edit2,
  AlertCircle,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import { TripPlan, FlightOption, InsuranceOption } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface A2TravelSearchProps {
  trip: TripPlan | null;
  onUpdateTrip: (updated: TripPlan) => void;
  onNextStep: () => void;
  onPrevStep: () => void;
}

export default function A2TravelSearch({
  trip,
  onUpdateTrip,
  onNextStep,
  onPrevStep
}: A2TravelSearchProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flights, setFlights] = useState<FlightOption[]>(trip?.flightOptions || []);
  const [insurance, setInsurance] = useState<InsuranceOption[]>(trip?.insuranceOptions || []);
  const [selectedFlight, setSelectedFlight] = useState<FlightOption | null>(trip?.selectedFlight || null);
  const [selectedInsurance, setSelectedInsurance] = useState<InsuranceOption | null>(trip?.selectedInsurance || null);
  // เมืองต้นทาง/ปลายทางที่ AI ระบุจากสถานที่จัดงาน (แทนที่อยู่เต็มยาวๆ ของ trip.location) — cache ไว้ในทริปกันเรียก AI ซ้ำตอนกลับมาดู
  const [originCity, setOriginCity] = useState<string>(trip?.originCity || 'กรุงเทพฯ, ประเทศไทย');
  // เดิม fallback เป็น trip?.country เสมอ ซึ่งเป็น undefined สำหรับทริปในประเทศ (ทริปในประเทศเก็บปลายทางไว้ที่ destinationProvince แทน)
  const [destinationCity, setDestinationCity] = useState<string>(
    trip?.destinationCity || (trip?.tripType === 'DOMESTIC' ? trip?.destinationProvince : trip?.country) || ''
  );
  const isDomestic = trip?.tripType === 'DOMESTIC';

  // Manual inputs for overriding prices
  const [manualFlightMode, setManualFlightMode] = useState(false);
  const [manualFlightPrice, setManualFlightPrice] = useState(15000);
  const [manualFlightAirline, setManualFlightAirline] = useState('สายการบินที่จองเอง');

  const [manualInsuranceMode, setManualInsuranceMode] = useState(false);
  const [manualInsurancePrice, setManualInsurancePrice] = useState(850);
  const [manualInsuranceProvider, setManualInsuranceProvider] = useState('บริษัทประกันภัย');

  // ต้องกดค้นหาเองก่อนถึงจะยิง Gemini API — ไม่ยิงอัตโนมัติตอนเข้าหน้านี้ (ป้องกันยิง API โดยไม่จำเป็น)
  const [searched, setSearched] = useState(flights.length > 0 || insurance.length > 0);

  const searchTravelOptions = async () => {
    if (!trip) return;
    setLoading(true);
    try {
      const res = await fetch('/api/agent/a2-search-travel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: trip.tripType === 'DOMESTIC' ? trip.destinationProvince : trip.country,
          location: trip.location,
          startDate: trip.startDate,
          endDate: trip.endDate,
          travelersCount: trip.travelers.length,
          tripType: trip.tripType
        })
      });

      const result = await res.json();
      if (result.success && result.data) {
        setFlights(result.data.flights || []);
        setInsurance(result.data.insurance || []);
        if (result.data.originCity) setOriginCity(result.data.originCity);
        if (result.data.destinationCity) setDestinationCity(result.data.destinationCity);
        if (result.data.flights?.[0]) setSelectedFlight(result.data.flights[0]);
        if (result.data.insurance?.[0]) setSelectedInsurance(result.data.insurance[0]);
      }
    } catch (e) {
      console.error("Failed to query travel options", e);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  const handleConfirmChoices = () => {
    if (!trip) return;

    let finalFlight = selectedFlight;
    let finalInsurance = selectedInsurance;

    if (manualFlightMode) {
      finalFlight = {
        id: "flight-manual",
        airline: manualFlightAirline,
        pricePerPerson: manualFlightPrice,
        departureTime: "ตามตั๋วที่จอง",
        arrivalTime: "ตามตั๋วที่จอง",
        baggageAllowance: "ตามตั๋วที่จอง",
        totalPrice: manualFlightPrice * trip.travelers.length
      };
    }

    if (manualInsuranceMode) {
      finalInsurance = {
        id: "ins-manual",
        provider: manualInsuranceProvider,
        planName: "แผนประกันภัยระบุเอง",
        pricePerPerson: manualInsurancePrice,
        coverage: "คุ้มครองตามระเบียบ",
        totalPrice: manualInsurancePrice * trip.travelers.length
      };
    }

    // ค่าประกันภัยไม่อยู่ในสิทธิ์เบิกจ่ายการเดินทางในประเทศ (ข้อ 42-45) จึงไม่บังคับเลือกสำหรับทริปในประเทศ
    if (!finalFlight || (!isDomestic && !finalInsurance)) {
      setError(t('a2.selectRequiredError'));
      return;
    }
    setError(null);

    // Recalculate total budget with actual flight and insurance rates
    const tripDays = trip.travelers[0]?.days || 5;
    const travelerCount = trip.travelers.length;
    const totalPerDiem = trip.travelers.reduce((sum, t) => sum + (t.perDiemRate * tripDays), 0);
    const totalAccommodation = trip.travelers.reduce((sum, t) => sum + (t.maxAccommodationRate * (tripDays - 1)), 0);
    const actualFlightCost = finalFlight.totalPrice;
    const actualInsuranceCost = finalInsurance?.totalPrice || 0;
    const estimatedVisa = 1500 * travelerCount;
    const estimatedTransport = 2000 * travelerCount;

    let updatedBudgetItems = trip.customBudgetItems ? [...trip.customBudgetItems] : [];

    if (updatedBudgetItems.length === 0) {
      updatedBudgetItems = isDomestic
        ? [
            { id: 'flight', label: '1. ค่าเดินทาง (ตั๋วเครื่องบิน/รถโดยสาร) ประมาณการ', calc: `(฿${finalFlight.pricePerPerson.toLocaleString()} x ${travelerCount} คน)`, amount: actualFlightCost, paymentMethod: trip.itemPaymentMethods?.flight || 'บัตรเครดิต', isAuto: true },
            { id: 'accommodation', label: '2. ค่าที่พักควบคุมสูงสุด', calc: `(฿อัตราตำแหน่ง x ${tripDays - 1} คืน)`, amount: totalAccommodation, paymentMethod: trip.itemPaymentMethods?.accommodation || 'เงินสด', isAuto: true },
            { id: 'perDiem', label: '3. ค่าเบี้ยเลี้ยงราชการ', calc: `(฿อัตราตำแหน่ง x ${tripDays} วัน)`, amount: totalPerDiem, paymentMethod: trip.itemPaymentMethods?.perDiem || 'เงินสด', isAuto: true },
            { id: 'transport', label: '4. ค่าพาหนะไป-กลับสถานีขนส่ง (ข้อ 44)', calc: `(฿2,000 x ${travelerCount} คน)`, amount: estimatedTransport, paymentMethod: trip.itemPaymentMethods?.transport || 'เงินสด', isAuto: true },
          ]
        : [
            { id: 'flight', label: '1. ค่าตั๋วเครื่องบินประมาณการ', calc: `(฿${finalFlight.pricePerPerson.toLocaleString()} x ${travelerCount} คน)`, amount: actualFlightCost, paymentMethod: trip.itemPaymentMethods?.flight || 'บัตรเครดิต', isAuto: true },
            { id: 'accommodation', label: '2. ค่าที่พักควบคุมสูงสุด', calc: `(฿อัตราตำแหน่ง x ${tripDays - 1} คืน)`, amount: totalAccommodation, paymentMethod: trip.itemPaymentMethods?.accommodation || 'เงินสด', isAuto: true },
            { id: 'perDiem', label: '3. ค่าเบี้ยเลี้ยงราชการ', calc: `(฿อัตราตำแหน่ง x ${tripDays} วัน)`, amount: totalPerDiem, paymentMethod: trip.itemPaymentMethods?.perDiem || 'เงินสด', isAuto: true },
            { id: 'insurance', label: '4. ค่าประกันภัยประมาณการ', calc: `(฿${(finalInsurance?.pricePerPerson || 0).toLocaleString()} x ${travelerCount} คน)`, amount: actualInsuranceCost, paymentMethod: trip.itemPaymentMethods?.insurance || 'บัตรเครดิต', isAuto: true },
            { id: 'visa', label: '5. ค่าหนังสือเดินทางราชการ/วีซ่า', calc: `(฿1,500 x ${travelerCount} คน)`, amount: estimatedVisa, paymentMethod: trip.itemPaymentMethods?.visa || 'เงินสด', isAuto: true },
            { id: 'transport', label: '6. ค่าพาหนะ/อื่นๆ เหมาจ่าย', calc: `(฿2,000 x ${travelerCount} คน)`, amount: estimatedTransport, paymentMethod: trip.itemPaymentMethods?.transport || 'เงินสด', isAuto: true },
          ];
    } else {
      updatedBudgetItems = updatedBudgetItems.map(item => {
        if (item.id === 'flight' || item.label.includes('ตั๋ว')) {
          return {
            ...item,
            calc: `(฿${finalFlight.pricePerPerson.toLocaleString()} x ${travelerCount} คน)`,
            amount: actualFlightCost
          };
        }
        if (finalInsurance && (item.id === 'insurance' || item.label.includes('ประกัน'))) {
          return {
            ...item,
            calc: `(฿${finalInsurance.pricePerPerson.toLocaleString()} x ${travelerCount} คน)`,
            amount: actualInsuranceCost
          };
        }
        return item;
      });
    }

    const newGrandTotal = updatedBudgetItems.reduce((sum, item) => sum + item.amount, 0);

    const updatedTrip: TripPlan = {
      ...trip,
      originCity,
      destinationCity,
      flightOptions: flights,
      insuranceOptions: insurance,
      selectedFlight: finalFlight,
      selectedInsurance: finalInsurance,
      customBudgetItems: updatedBudgetItems,
      estimatedBudget: newGrandTotal,
      status: 'A3_MEMO_DRAFTED'
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
            <Plane className="text-blue-600" size={22} />
            {t('a2.heading')}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {t('a2.subheading')}
          </p>
        </div>
        <button
          onClick={searchTravelOptions}
          disabled={loading}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-45 ${
            searched
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-950/20'
          }`}
        >
          <Search size={13} />
          {searched ? t('a2.searchAgain') : t('a2.searchWithAi')}
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-900 animate-pulse">{t('a2.evaluatingPrices')}</p>
            <p className="text-xs text-slate-500 font-medium">{t('a2.evaluatingPricesSubtext')}</p>
          </div>
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-8 ${isDomestic ? 'lg:max-w-xl' : 'lg:grid-cols-2'}`}>
          {/* Flight Search Results */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5">
              <h3 className="text-sm font-bold text-slate-950 flex items-center gap-1.5">
                <Plane className="text-blue-600 shrink-0" size={16} />
                {t('a2.flightRoute', { origin: originCity, destination: destinationCity })}
              </h3>
              <button
                onClick={() => setManualFlightMode(!manualFlightMode)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 text-left sm:text-right shrink-0"
              >
                {manualFlightMode ? t('a2.useAiPrice') : t('a2.enterFlightPriceManually')}
              </button>
            </div>

            {manualFlightMode ? (
              <div className="p-5 border border-blue-100 bg-blue-50/20 rounded-xl space-y-4">
                <div className="flex gap-2 items-center text-xs font-bold text-blue-850">
                  <Edit2 size={14} />
                  {t('a2.enterApprovedFlightPrice')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-2xs font-semibold text-slate-600">{t('a2.airline')}</label>
                    <input
                      type="text"
                      value={manualFlightAirline}
                      onChange={(e) => setManualFlightAirline(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-2xs font-semibold text-slate-600">{t('a2.pricePerPerson')}</label>
                    <input
                      type="number"
                      value={manualFlightPrice}
                      onChange={(e) => setManualFlightPrice(Number(e.target.value))}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden"
                    />
                  </div>
                </div>
                <p className="text-2xs text-slate-500">
                  {t('a2.totalForTravelers', { count: trip?.travelers.length ?? 0 })}: <strong>฿{(manualFlightPrice * (trip?.travelers.length || 1)).toLocaleString()}</strong>
                </p>
              </div>
            ) : !searched ? (
              <div className="py-10 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
                <Plane className="mx-auto text-slate-300" size={26} />
                <p className="text-xs text-slate-500 font-medium">{t('a2.noFlightSearchYet')}</p>
                <button
                  type="button"
                  onClick={searchTravelOptions}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-md shadow-blue-950/20 transition-all inline-flex items-center gap-1.5"
                >
                  <Search size={12} />
                  {t('a2.searchWithAiShort')}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {flights.map((flight) => {
                  const isSel = selectedFlight?.id === flight.id;
                  return (
                    <div
                      key={flight.id}
                      onClick={() => setSelectedFlight(flight)}
                      className={`border p-4 rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                        isSel
                          ? 'border-blue-600 bg-blue-50/35 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-900">{flight.airline}</span>
                          <span className="text-2xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-md font-bold">
                            {t('a2.baggage')}: {flight.baggageAllowance}
                          </span>
                        </div>
                        <div className="text-2xs text-slate-500 font-medium">
                          {t('a2.departureReturn')}: {flight.departureTime} - {flight.arrivalTime}
                        </div>
                        <div className="flex items-center gap-1.5 text-2xs text-slate-400 font-medium">
                          <span>{t('a2.aiEstimatedPrice')}</span>
                          {flight.bookingUrl && (
                            <a
                              href={flight.bookingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-600 hover:text-blue-700 font-bold underline"
                            >
                              {t('a2.goToBooking')}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-900">
                          ฿{flight.pricePerPerson.toLocaleString()} <span className="text-2xs text-slate-500 font-normal">{t('a2.perPerson')}</span>
                        </div>
                        <div className="text-2xs text-slate-400 font-mono">
                          {t('a2.total')} ฿{flight.totalPrice.toLocaleString()}
                        </div>
                        {isSel && (
                          <span className="inline-flex items-center gap-0.5 mt-1 text-2xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                            <Check size={10} /> {t('a2.selected')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Insurance Search Results — ค่าประกันภัยไม่อยู่ในสิทธิ์เบิกจ่ายการเดินทางในประเทศ (ข้อ 42-45) จึงไม่แสดงส่วนนี้สำหรับทริปในประเทศ */}
          {!isDomestic && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5">
              <h3 className="text-sm font-bold text-slate-950 flex items-center gap-1.5">
                <Shield className="text-blue-600 shrink-0" size={16} />
                {t('a2.insuranceTitle')}
              </h3>
              <button
                onClick={() => setManualInsuranceMode(!manualInsuranceMode)}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 text-left sm:text-right shrink-0"
              >
                {manualInsuranceMode ? t('a2.useAiPrice') : t('a2.enterInsurancePriceManually')}
              </button>
            </div>

            {manualInsuranceMode ? (
              <div className="p-5 border border-blue-100 bg-blue-50/20 rounded-xl space-y-4">
                <div className="flex gap-2 items-center text-xs font-bold text-blue-850">
                  <Edit2 size={14} />
                  {t('a2.enterInsurancePrice')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-2xs font-semibold text-slate-600">{t('a2.insuranceProvider')}</label>
                    <input
                      type="text"
                      value={manualInsuranceProvider}
                      onChange={(e) => setManualInsuranceProvider(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-2xs font-semibold text-slate-600">{t('a2.pricePerPerson')}</label>
                    <input
                      type="number"
                      value={manualInsurancePrice}
                      onChange={(e) => setManualInsurancePrice(Number(e.target.value))}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-hidden"
                    />
                  </div>
                </div>
                <p className="text-2xs text-slate-500">
                  {t('a2.totalForTravelers', { count: trip?.travelers.length ?? 0 })}: <strong>฿{(manualInsurancePrice * (trip?.travelers.length || 1)).toLocaleString()}</strong>
                </p>
              </div>
            ) : !searched ? (
              <div className="py-10 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
                <Shield className="mx-auto text-slate-300" size={26} />
                <p className="text-xs text-slate-500 font-medium">{t('a2.noInsuranceSearchYet')}</p>
                <button
                  type="button"
                  onClick={searchTravelOptions}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-md shadow-blue-950/20 transition-all inline-flex items-center gap-1.5"
                >
                  <Search size={12} />
                  {t('a2.searchWithAiShort')}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {insurance.map((ins) => {
                  const isSel = selectedInsurance?.id === ins.id;
                  return (
                    <div
                      key={ins.id}
                      onClick={() => setSelectedInsurance(ins)}
                      className={`border p-4 rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                        isSel
                          ? 'border-blue-600 bg-blue-50/35'
                          : 'border-slate-200 hover:border-slate-350 bg-white shadow-2xs'
                      }`}
                    >
                      <div className="space-y-1.5 max-w-[70%]">
                        <div className="font-bold text-xs text-slate-900">{ins.provider}</div>
                        <div className="text-2xs text-slate-600 font-semibold bg-slate-50 px-2 py-0.5 rounded-md inline-block border border-slate-200">
                          {t('a2.plan')}: {ins.planName}
                        </div>
                        <div className="text-2xs text-slate-500 line-clamp-2">{ins.coverage}</div>
                        {ins.purchaseUrl && (
                          <a
                            href={ins.purchaseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-2xs text-blue-600 hover:text-blue-700 font-bold underline inline-block"
                          >
                            {t('a2.goToPurchase')}
                          </a>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-slate-900">
                          ฿{ins.pricePerPerson.toLocaleString()} <span className="text-2xs text-slate-500 font-normal">{t('a2.perPerson')}</span>
                        </div>
                        <div className="text-2xs text-slate-400 font-mono">
                          {t('a2.total')} ฿{ins.totalPrice.toLocaleString()}
                        </div>
                        {isSel && (
                          <span className="inline-flex items-center gap-0.5 mt-1 text-2xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                            <Check size={10} /> {t('a2.selected')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Warning text */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
        <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={16} />
        <p className="text-xs text-amber-800 leading-relaxed">
          <strong>{t('a2.importantNoteTitle')}</strong> {t('a2.importantNoteBody')}
        </p>
      </div>

      {/* On-screen custom error banner instead of alert */}
      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-850 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {/* Action footer */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={onPrevStep}
          className="w-full sm:w-auto px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all order-2 sm:order-1"
        >
          {t('common.back')}
        </button>

        <button
          id="btn-confirm-a2"
          type="button"
          onClick={handleConfirmChoices}
          disabled={loading}
          className="w-full sm:w-auto justify-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-md shadow-blue-950/20 transition-all flex items-center gap-1 order-1 sm:order-2"
        >
          {t('a2.confirmAndProceed')}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
