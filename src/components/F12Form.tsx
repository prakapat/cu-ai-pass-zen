/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Save, Trash2, AlertTriangle } from 'lucide-react';
import { TripPlan, F12Request, F12Channel, F12ChannelType } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface F12FormProps {
  trip: TripPlan;
}

// เขียนเป็น component แยกไว้นอก F12Form เสมอ — ถ้าประกาศซ้อนในฟังก์ชัน component หลัก React จะมองว่าเป็น component คนละตัวทุก render แล้วทำให้ input เสียโฟกัสตอนพิมพ์
function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  textarea = false
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  textarea?: boolean;
}) {
  return (
    <label className="space-y-1 text-xs block">
      <span className="font-semibold text-slate-700">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-hidden"
        />
      )}
    </label>
  );
}

function computeFiscalYear(trip: TripPlan): string {
  const d = trip.startDate ? new Date(trip.startDate) : new Date();
  const year = isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  return String(year + 543);
}

function computeReturnDueDate(trip: TripPlan): string {
  const base = trip.endDate ? new Date(trip.endDate) : null;
  if (!base || isNaN(base.getTime())) return '';
  base.setDate(base.getDate() + 15);
  return base.toISOString().split('T')[0];
}

function buildDefaultDescription(trip: TripPlan): string {
  const countryPart = trip.country ? ` ประเทศ${trip.country}` : '';
  return `ยืมเงินสำรองจ่ายสำหรับการเดินทางเข้าร่วม ${trip.projectName || ''} ณ ${trip.location || ''}${countryPart} ระหว่างวันที่ ${trip.startDate || ''} - ${trip.endDate || ''}`;
}

function buildDefaultChannels(trip: TripPlan): F12Channel[] {
  const items = trip.customBudgetItems || [];
  return items.map((item) => ({
    channelType: (item.paymentMethod === 'บัตรเครดิต' ? 'CREDIT_CARD' : 'TRANSFER') as F12ChannelType,
    amount: item.amount,
    sourceLabel: item.label,
    recipientName: '',
    bankName: '',
    bankAccountNumber: '',
    bankBranch: '',
    cardNumber: '',
    cardHolderName: '',
    cardValidFrom: '',
    cardValidTo: '',
    cardType: ''
  }));
}

function buildDefaultRequest(trip: TripPlan): F12Request {
  const lead = trip.travelers && trip.travelers.length > 0 ? trip.travelers[0] : undefined;
  return {
    deptCode: '',
    deptName: trip.memo?.หน่วยงาน || '',
    subject: trip.memo?.subject || '',
    recipientTitle: trip.memo?.เรียนถึง || '',
    authorizedPerson: trip.memo?.ผ่าน || trip.memo?.เรียนถึง || '',
    description: trip.memo?.justificationText || buildDefaultDescription(trip),
    borrowerName: lead?.name || '',
    borrowerPosition: lead?.position || '',
    fiscalYear: computeFiscalYear(trip),
    loanPurpose: trip.projectName ? `ใช้เป็นค่าใช้จ่ายในการเข้าร่วม ${trip.projectName}` : '',
    fundCode: trip.memo?.รหัสกองทุน || '',
    fundName: '',
    unitName: trip.memo?.หน่วยงาน || '',
    returnDueDate: computeReturnDueDate(trip),
    totalLoanAmount: trip.estimatedBudget || 0,
    notes: '',
    refundOverpaymentConsent: false,
    channels: buildDefaultChannels(trip)
  };
}

function mapServerRequest(data: any): F12Request {
  return {
    id: data.id,
    tripId: data.tripId,
    deptCode: data.deptCode || '',
    deptName: data.deptName || '',
    subject: data.subject || '',
    recipientTitle: data.recipientTitle || '',
    authorizedPerson: data.authorizedPerson || '',
    description: data.description || '',
    borrowerName: data.borrowerName || '',
    borrowerPosition: data.borrowerPosition || '',
    fiscalYear: data.fiscalYear || '',
    loanPurpose: data.loanPurpose || '',
    fundCode: data.fundCode || '',
    fundName: data.fundName || '',
    unitName: data.unitName || '',
    returnDueDate: data.returnDueDate || '',
    totalLoanAmount: data.totalLoanAmount ?? 0,
    notes: data.notes || '',
    refundOverpaymentConsent: !!data.refundOverpaymentConsent,
    confirmedAt: data.confirmedAt,
    channels: (data.channels || []).map((c: any) => ({
      id: c.id,
      channelType: c.channelType,
      amount: c.amount ?? 0,
      sourceLabel: c.sourceLabel || '',
      recipientName: c.recipientName || '',
      bankName: c.bankName || '',
      bankAccountNumber: c.bankAccountNumber || '',
      bankBranch: c.bankBranch || '',
      cardNumber: c.cardNumber || '',
      cardHolderName: c.cardHolderName || '',
      cardValidFrom: c.cardValidFrom || '',
      cardValidTo: c.cardValidTo || '',
      cardType: c.cardType || ''
    }))
  };
}

export default function F12Form({ trip }: F12FormProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [form, setForm] = useState<F12Request>(() => buildDefaultRequest(trip));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/trips/${trip.id}/f12`);
        const result = await res.json();
        if (cancelled) return;
        if (result.success && result.data) {
          setForm(mapServerRequest(result.data));
        } else {
          setForm(buildDefaultRequest(trip));
        }
      } catch (e) {
        console.error('Failed to load F12 data', e);
        if (!cancelled) setForm(buildDefaultRequest(trip));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trip.id]);

  const updateField = <K extends keyof F12Request>(key: K, value: F12Request[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const updateChannel = (idx: number, patch: Partial<F12Channel>) => {
    setForm((f) => ({ ...f, channels: f.channels.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }));
  };

  const addChannel = () => {
    setForm((f) => ({
      ...f,
      channels: [...f.channels, { channelType: 'TRANSFER', amount: 0, sourceLabel: '' }]
    }));
  };

  const removeChannel = (idx: number) => {
    setForm((f) => ({ ...f, channels: f.channels.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const { id, tripId, confirmedAt, channels, ...scalarFields } = form;
      const res = await fetch(`/api/trips/${trip.id}/f12`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scalarFields, channels })
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to save F12 form');
      }
      setForm(mapServerRequest(result.data));
      setSavedAt(new Date());
    } catch (e) {
      console.error('Failed to save F12 form', e);
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const channelSum = form.channels.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const sumMatches = channelSum === Number(form.totalLoanAmount || 0);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
        <Loader2 size={16} className="animate-spin" />
        {t('f12.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-0.5">
        <h4 className="text-sm font-bold text-slate-950">{t('f12.formTitle')}</h4>
        <p className="text-2xs text-slate-500 font-medium">{t('f12.formSubtitle')}</p>
      </div>

      {/* Group A */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-700">
          {t('f12.groupATitle')}
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label={t('f12.deptCode')} value={form.deptCode} onChange={(v) => updateField('deptCode', v)} placeholder={t('f12.deptCodePlaceholder')} />
          <TextField label={t('f12.deptName')} value={form.deptName} onChange={(v) => updateField('deptName', v)} />
          <div className="sm:col-span-2">
            <TextField label={t('f12.subject')} value={form.subject} onChange={(v) => updateField('subject', v)} textarea />
          </div>
          <TextField label={t('f12.recipientTitle')} value={form.recipientTitle} onChange={(v) => updateField('recipientTitle', v)} />
          <TextField label={t('f12.authorizedPerson')} value={form.authorizedPerson} onChange={(v) => updateField('authorizedPerson', v)} />
          <div className="sm:col-span-2">
            <TextField label={t('f12.description')} value={form.description} onChange={(v) => updateField('description', v)} textarea />
          </div>
          <TextField label={t('f12.borrowerName')} value={form.borrowerName} onChange={(v) => updateField('borrowerName', v)} />
          <TextField label={t('f12.borrowerPosition')} value={form.borrowerPosition} onChange={(v) => updateField('borrowerPosition', v)} />
        </div>
      </div>

      {/* Group B */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-700">
          {t('f12.groupBTitle')}
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label={t('f12.fiscalYear')} value={form.fiscalYear} onChange={(v) => updateField('fiscalYear', v)} />
          <TextField label={t('f12.returnDueDate')} value={form.returnDueDate} onChange={(v) => updateField('returnDueDate', v)} type="date" />
          <div className="sm:col-span-2">
            <TextField label={t('f12.loanPurpose')} value={form.loanPurpose} onChange={(v) => updateField('loanPurpose', v)} textarea />
          </div>
          <TextField label={t('f12.fundCode')} value={form.fundCode} onChange={(v) => updateField('fundCode', v)} />
          <TextField label={t('f12.fundName')} value={form.fundName} onChange={(v) => updateField('fundName', v)} />
          <TextField label={t('f12.unitName')} value={form.unitName} onChange={(v) => updateField('unitName', v)} />
          <TextField
            label={t('f12.totalLoanAmount')}
            value={String(form.totalLoanAmount ?? 0)}
            onChange={(v) => updateField('totalLoanAmount', Number(v) || 0)}
            type="number"
          />
          <div className="sm:col-span-2">
            <TextField label={t('f12.notes')} value={form.notes} onChange={(v) => updateField('notes', v)} textarea />
          </div>
        </div>
      </div>

      {/* Group C */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 space-y-0.5">
          <div className="text-xs font-bold text-slate-700">{t('f12.groupCTitle')}</div>
          <div className="text-3xs text-slate-500 font-medium">{t('f12.groupCSubtitle')}</div>
        </div>
        <div className="p-4 space-y-3">
          {form.channels.length === 0 && (
            <p className="text-2xs text-slate-400 font-medium text-center py-3">{t('f12.noChannels')}</p>
          )}
          {form.channels.map((channel, idx) => (
            <div key={idx} className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50/50">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateChannel(idx, { channelType: 'TRANSFER' })}
                    className={`px-2.5 py-1 rounded-md text-2xs font-bold border transition-all cursor-pointer ${
                      channel.channelType === 'TRANSFER'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {t('f12.transfer')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateChannel(idx, { channelType: 'CREDIT_CARD' })}
                    className={`px-2.5 py-1 rounded-md text-2xs font-bold border transition-all cursor-pointer ${
                      channel.channelType === 'CREDIT_CARD'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {t('f12.creditCard')}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeChannel(idx)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                  title={t('f12.removeChannel')}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField label={t('f12.sourceLabel')} value={channel.sourceLabel || ''} onChange={(v) => updateChannel(idx, { sourceLabel: v })} />
                <TextField
                  label={t('f12.amount')}
                  value={String(channel.amount ?? 0)}
                  onChange={(v) => updateChannel(idx, { amount: Number(v) || 0 })}
                  type="number"
                />

                {channel.channelType === 'TRANSFER' ? (
                  <>
                    <TextField label={t('f12.recipientName')} value={channel.recipientName || ''} onChange={(v) => updateChannel(idx, { recipientName: v })} />
                    <TextField label={t('f12.bankName')} value={channel.bankName || ''} onChange={(v) => updateChannel(idx, { bankName: v })} />
                    <TextField label={t('f12.bankAccountNumber')} value={channel.bankAccountNumber || ''} onChange={(v) => updateChannel(idx, { bankAccountNumber: v })} />
                    <TextField label={t('f12.bankBranch')} value={channel.bankBranch || ''} onChange={(v) => updateChannel(idx, { bankBranch: v })} />
                  </>
                ) : (
                  <>
                    <TextField label={t('f12.cardNumber')} value={channel.cardNumber || ''} onChange={(v) => updateChannel(idx, { cardNumber: v })} />
                    <TextField label={t('f12.cardHolderName')} value={channel.cardHolderName || ''} onChange={(v) => updateChannel(idx, { cardHolderName: v })} />
                    <TextField label={t('f12.cardValidFrom')} value={channel.cardValidFrom || ''} onChange={(v) => updateChannel(idx, { cardValidFrom: v })} type="date" />
                    <TextField label={t('f12.cardValidTo')} value={channel.cardValidTo || ''} onChange={(v) => updateChannel(idx, { cardValidTo: v })} type="date" />
                    <TextField label={t('f12.cardType')} value={channel.cardType || ''} onChange={(v) => updateChannel(idx, { cardType: v })} />
                  </>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addChannel}
            className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-2xs font-bold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus size={12} />
            {t('f12.addChannel')}
          </button>

          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-2xs font-bold ${
              sumMatches ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}
          >
            {sumMatches ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {sumMatches
              ? t('f12.channelSumMatch')
              : t('f12.channelSumMismatch', { sum: channelSum.toLocaleString(), total: Number(form.totalLoanAmount || 0).toLocaleString() })}
          </div>
        </div>
      </div>

      {/* Group D */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-700">
          {t('f12.groupDTitle')}
        </div>
        <div className="p-4">
          <label className="flex items-start gap-2.5 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.refundOverpaymentConsent}
              onChange={(e) => updateField('refundOverpaymentConsent', e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 cursor-pointer"
            />
            {t('f12.consentLabel')}
          </label>
        </div>
      </div>

      {/* Save Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold text-xs rounded-lg shadow-xs transition-all cursor-pointer"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? t('f12.saving') : t('f12.saveButton')}
        </button>
        {savedAt && !saveError && (
          <span className="text-2xs font-bold text-emerald-700 flex items-center gap-1">
            <CheckCircle2 size={12} />
            {t('f12.savedAt', { time: savedAt.toLocaleTimeString() })}
          </span>
        )}
        {saveError && (
          <span className="text-2xs font-bold text-red-700 flex items-center gap-1">
            <AlertTriangle size={12} />
            {t('f12.saveError', { error: saveError })}
          </span>
        )}
      </div>
    </div>
  );
}
