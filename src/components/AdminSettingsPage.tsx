/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Settings, Globe2, Wallet, MessageSquareText, Plus, Trash2, Save, Search, Sparkles, Info } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

type TFunc = (key: string, params?: Record<string, string | number>) => string;

interface SystemSettingRow {
  key: string;
  value: number;
  description: string;
}

interface CountryGroupRow {
  id: string;
  country: string;
  group: number;
  travelBufferDays: number;
  estimatedFlightCost: number | null;
  insuranceZone: number | null;
  visaRequirement: string | null;
  estimatedVisaFee: number | null;
}

interface PolicyRateRow {
  id: string;
  tier: 'TIER1' | 'TIER2';
  countryGroup: number;
  perDiemLumpSum: number;
  accommodationMax: number;
  perDiemItemized: number;
}

interface DomesticLumpSumRow {
  id: string;
  tier: string;
  ratePerDay: number;
}

interface DomesticAccommodationRow {
  id: string;
  tier: string;
  singleRoomMax: number;
  twinRoomMax: number;
}

interface DomesticPerDiemRow {
  id: string;
  tier: string;
  ratePerDay: number;
}

interface GuideQuestionRow {
  id: string;
  text: string;
  sortOrder: number;
}

function getSettingLabel(key: string, t: TFunc): string {
  const map: Record<string, string> = {
    pageLockThreshold: t('adminSettings.labelPageLockThreshold'),
    pageLockDurationMinutes: t('adminSettings.labelPageLockDurationMinutes'),
    accountLockThreshold: t('adminSettings.labelAccountLockThreshold'),
    monthlyChatLimit: t('adminSettings.labelMonthlyChatLimit')
  };
  return map[key] || key;
}

// จัดกลุ่มการตั้งค่าที่สัมพันธ์กัน (จำนวนครั้ง + ระยะเวลา) ให้อยู่ด้วยกันเป็นชุด พร้อมหัวข้ออธิบายเงื่อนไขการล็อคของกลุ่มนั้น
function getSettingGroups(t: TFunc): { heading: string; keys: string[] }[] {
  return [
    { heading: t('adminSettings.group1Heading'), keys: ['pageLockThreshold', 'pageLockDurationMinutes'] },
    { heading: t('adminSettings.group2Heading'), keys: ['accountLockThreshold'] },
    { heading: t('adminSettings.group3Heading'), keys: ['monthlyChatLimit'] }
  ];
}

function getDomesticTierLabel(tier: string, t: TFunc): string {
  const map: Record<string, string> = {
    TIER1: t('adminSettings.tierTIER1'),
    TIER2: t('adminSettings.tierTIER2'),
    TIER3: t('adminSettings.tierTIER3'),
    TIER4: t('adminSettings.tierTIER4'),
    TIER_A: t('adminSettings.tierA'),
    TIER_B: t('adminSettings.tierB')
  };
  return map[tier] || tier;
}

function getVisaLabel(req: string, t: TFunc): string {
  const map: Record<string, string> = {
    VISA_FREE: t('adminSettings.visaFree'),
    VISA_ON_ARRIVAL: t('adminSettings.visaOnArrival'),
    E_VISA: t('adminSettings.visaOnline'),
    EMBASSY_VISA: t('adminSettings.visaEmbassy')
  };
  return map[req] || req;
}

type Section = 'quota' | 'countries' | 'rates' | 'questions' | 'gemini';

function getSections(t: TFunc): { id: Section; label: string; icon: React.ReactNode }[] {
  return [
    { id: 'quota', label: t('adminSettings.tabQuota'), icon: <Settings size={14} /> },
    { id: 'countries', label: t('adminSettings.tabCountries'), icon: <Globe2 size={14} /> },
    { id: 'rates', label: t('adminSettings.tabRates'), icon: <Wallet size={14} /> },
    { id: 'questions', label: t('adminSettings.tabQuestions'), icon: <MessageSquareText size={14} /> },
    { id: 'gemini', label: t('adminSettings.tabGemini'), icon: <Sparkles size={14} /> }
  ];
}

function NumberField({ value, onChange, className = 'w-full' }: { value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`px-2.5 py-1.5 border border-slate-200 rounded-md text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 ${className}`}
    />
  );
}

function SaveButton({ dirty, saving, onClick }: { dirty: boolean; saving: boolean; onClick: () => void }) {
  const { t } = useLanguage();
  return (
    <button
      onClick={onClick}
      disabled={!dirty || saving}
      className="inline-flex items-center gap-1 text-2xs font-bold px-2.5 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
    >
      <Save size={11} />
      {saving ? '...' : t('common.save')}
    </button>
  );
}

// ---------------- Section: ขีดจำกัด/โควต้า ----------------
function QuotaSection() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<SystemSettingRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((result) => {
        if (result.success) {
          setRows(result.data);
          setDrafts(Object.fromEntries(result.data.map((r: SystemSettingRow) => [r.key, r.value])));
        } else setError(result.error || t('adminSettings.loadFailed'));
      })
      .catch(() => setError(t('common.connectionError')));
  }, [t]);

  const handleSave = async (key: string) => {
    setSavingKey(key);
    try {
      const res = await fetch(`/api/admin/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: drafts[key] })
      });
      const result = await res.json();
      if (result.success) {
        setRows((prev) => prev?.map((r) => (r.key === key ? result.data : r)) || null);
      }
    } catch (e) {
      console.error('Failed to save setting', e);
    } finally {
      setSavingKey(null);
    }
  };

  if (error) return <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-semibold">{error}</div>;
  if (!rows) return <div className="p-8 text-center text-xs text-slate-400">{t('common.loading')}</div>;

  const byKey = new Map<string, SystemSettingRow>(rows.map((r) => [r.key, r]));
  const settingGroups = getSettingGroups(t);

  return (
    <div className="space-y-5">
      {settingGroups.map((group) => (
        <div key={group.heading} className="border border-slate-200 rounded-xl overflow-hidden">
          <p className="text-2xs font-bold text-slate-600 bg-slate-100 px-3.5 py-2 border-b border-slate-200">{group.heading}</p>
          <div className="divide-y divide-slate-100">
            {group.keys.map((key) => {
              const r = byKey.get(key);
              if (!r) return null;
              return (
                <div key={key} className="flex items-center gap-3 p-3.5 bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900">{getSettingLabel(key, t)}</p>
                    <p className="text-2xs text-slate-500 mt-0.5">{r.description}</p>
                  </div>
                  <NumberField value={drafts[key] ?? r.value} onChange={(v) => setDrafts((d) => ({ ...d, [key]: v }))} className="w-24" />
                  <SaveButton dirty={drafts[key] !== r.value} saving={savingKey === key} onClick={() => handleSave(key)} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- Section: กลุ่มประเทศ ----------------
function CountryGroupSection() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<CountryGroupRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState<number | 'all'>('all');
  const [newCountry, setNewCountry] = useState('');
  const [newGroup, setNewGroup] = useState(5);
  const [adding, setAdding] = useState(false);

  const load = () => {
    fetch('/api/country-groups')
      .then((r) => r.json())
      .then((result) => {
        if (result.success) setRows(result.data);
        else setError(result.error || t('adminSettings.loadFailed'));
      })
      .catch(() => setError(t('common.connectionError')));
  };

  useEffect(load, []);

  const handleAdd = async () => {
    if (!newCountry.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/admin/country-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: newCountry.trim(), group: newGroup, travelBufferDays: 1 })
      });
      const result = await res.json();
      if (result.success) {
        setRows((prev) => [...(prev || []), result.data].sort((a, b) => a.country.localeCompare(b.country)));
        setNewCountry('');
      }
    } catch (e) {
      console.error('Failed to add country', e);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/country-groups/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) setRows((prev) => prev?.filter((r) => r.id !== id) || null);
    } catch (e) {
      console.error('Failed to delete country', e);
    }
  };

  const handleUpdate = async (id: string, patch: Partial<CountryGroupRow>) => {
    try {
      const res = await fetch(`/api/admin/country-groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      const result = await res.json();
      if (result.success) setRows((prev) => prev?.map((r) => (r.id === id ? result.data : r)) || null);
    } catch (e) {
      console.error('Failed to update country', e);
    }
  };

  if (error) return <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-semibold">{error}</div>;
  if (!rows) return <div className="p-8 text-center text-xs text-slate-400">{t('common.loading')}</div>;

  const filtered = rows.filter(
    (r) => r.country.toLowerCase().includes(filter.toLowerCase()) && (groupFilter === 'all' || r.group === groupFilter)
  );

  return (
    <div className="space-y-3">
      <p className="text-2xs text-slate-500">
        {t('adminSettings.countryDefaultGroupNote', { count: rows.length })}
      </p>

      <div className="flex items-center gap-2 flex-wrap p-3 bg-blue-50/60 border border-blue-100 rounded-xl">
        <input
          value={newCountry}
          onChange={(e) => setNewCountry(e.target.value)}
          placeholder={t('adminSettings.addCountryPlaceholder')}
          className="flex-1 min-w-[160px] px-2.5 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <select
          value={newGroup}
          onChange={(e) => setNewGroup(Number(e.target.value))}
          className="px-2.5 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none"
        >
          {[1, 2, 3, 4, 5].map((g) => (
            <option key={g} value={g}>{t('table.group')} {g}</option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={!newCountry.trim() || adding}
          className="inline-flex items-center gap-1 text-2xs font-bold px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors"
        >
          <Plus size={12} /> {t('common.add')}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('adminSettings.searchCountryPlaceholder')}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="px-2.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none shrink-0"
        >
          <option value="all">{t('adminSettings.allGroups')}</option>
          {[1, 2, 3, 4, 5].map((g) => (
            <option key={g} value={g}>{t('adminSettings.onlyGroup', { group: g })}</option>
          ))}
        </select>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="text-slate-650 uppercase text-3xs font-bold tracking-wider border-b border-slate-200">
                <th className="py-2.5 px-3">{t('adminSettings.colCountry')}</th>
                <th className="py-2.5 px-3 w-28">{t('table.group')}</th>
                <th className="py-2.5 px-3 w-28">{t('adminSettings.colVisa')}</th>
                <th className="py-2.5 px-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80">
                  <td className="py-2 px-3 text-xs font-semibold text-slate-800">{r.country}</td>
                  <td className="py-2 px-3">
                    <select
                      value={r.group}
                      onChange={(e) => handleUpdate(r.id, { group: Number(e.target.value) })}
                      className="w-full px-2 py-1 border border-slate-200 rounded-md text-2xs focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5].map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-3 text-2xs text-slate-500">{r.visaRequirement ? getVisaLabel(r.visaRequirement, t) : '-'}</td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title={t('common.delete')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-2xs text-slate-400">{t('adminSettings.noCountryFound')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------- Section: เบี้ยเลี้ยงตามตำแหน่ง ----------------
function RatesSection() {
  const { t } = useLanguage();
  const [policyRates, setPolicyRates] = useState<PolicyRateRow[] | null>(null);
  const [lumpSum, setLumpSum] = useState<DomesticLumpSumRow[] | null>(null);
  const [accommodation, setAccommodation] = useState<DomesticAccommodationRow[] | null>(null);
  const [perDiem, setPerDiem] = useState<DomesticPerDiemRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [policyDrafts, setPolicyDrafts] = useState<Record<string, Partial<PolicyRateRow>>>({});
  const [lumpSumDrafts, setLumpSumDrafts] = useState<Record<string, number>>({});
  const [accDrafts, setAccDrafts] = useState<Record<string, { singleRoomMax: number; twinRoomMax: number }>>({});
  const [perDiemDrafts, setPerDiemDrafts] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/policy-rates').then((r) => r.json()),
      fetch('/api/domestic-lump-sum-rates').then((r) => r.json()),
      fetch('/api/domestic-accommodation-rates').then((r) => r.json()),
      fetch('/api/domestic-per-diem-rates').then((r) => r.json())
    ])
      .then(([pr, ls, ac, pd]) => {
        if (pr.success) setPolicyRates(pr.data);
        if (ls.success) setLumpSum(ls.data);
        if (ac.success) setAccommodation(ac.data);
        if (pd.success) setPerDiem(pd.data);
        if (!pr.success || !ls.success || !ac.success || !pd.success) setError(t('adminSettings.partialLoadFailed'));
      })
      .catch(() => setError(t('common.connectionError')));
  }, [t]);

  const savePolicyRate = async (id: string) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/policy-rates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policyDrafts[id])
      });
      const result = await res.json();
      if (result.success) setPolicyRates((prev) => prev?.map((r) => (r.id === id ? result.data : r)) || null);
    } finally {
      setSavingId(null);
    }
  };

  const saveLumpSum = async (id: string) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/domestic-lump-sum-rates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratePerDay: lumpSumDrafts[id] })
      });
      const result = await res.json();
      if (result.success) setLumpSum((prev) => prev?.map((r) => (r.id === id ? result.data : r)) || null);
    } finally {
      setSavingId(null);
    }
  };

  const saveAccommodation = async (id: string) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/domestic-accommodation-rates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accDrafts[id])
      });
      const result = await res.json();
      if (result.success) setAccommodation((prev) => prev?.map((r) => (r.id === id ? result.data : r)) || null);
    } finally {
      setSavingId(null);
    }
  };

  const savePerDiem = async (id: string) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/domestic-per-diem-rates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratePerDay: perDiemDrafts[id] })
      });
      const result = await res.json();
      if (result.success) setPerDiem((prev) => prev?.map((r) => (r.id === id ? result.data : r)) || null);
    } finally {
      setSavingId(null);
    }
  };

  if (error) return <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-semibold">{error}</div>;
  if (!policyRates || !lumpSum || !accommodation || !perDiem) {
    return <div className="p-8 text-center text-xs text-slate-400">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-xs font-bold text-slate-900 mb-2">{t('adminSettings.internationalRatesTitle')}</h4>
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-slate-50 text-slate-650 uppercase text-3xs font-bold tracking-wider border-b border-slate-200">
                <th className="py-2.5 px-3">{t('a1.position')}</th>
                <th className="py-2.5 px-3">{t('adminSettings.colCountryGroup')}</th>
                <th className="py-2.5 px-3">{t('adminSettings.colLumpSumPerDay')}</th>
                <th className="py-2.5 px-3">{t('adminSettings.colMaxAccommodationPerDay')}</th>
                <th className="py-2.5 px-3">{t('adminSettings.colItemizedPerDiemPerDay')}</th>
                <th className="py-2.5 px-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {policyRates.map((r) => {
                const draft = policyDrafts[r.id] || {};
                const dirty = Object.keys(draft).some((k) => (draft as any)[k] !== (r as any)[k]);
                return (
                  <tr key={r.id}>
                    <td className="py-2 px-3 text-2xs font-bold text-slate-700">{r.tier}</td>
                    <td className="py-2 px-3 text-2xs text-slate-600">{t('table.group')} {r.countryGroup}</td>
                    <td className="py-2 px-3">
                      <NumberField
                        value={draft.perDiemLumpSum ?? r.perDiemLumpSum}
                        onChange={(v) => setPolicyDrafts((d) => ({ ...d, [r.id]: { ...d[r.id], perDiemLumpSum: v } }))}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <NumberField
                        value={draft.accommodationMax ?? r.accommodationMax}
                        onChange={(v) => setPolicyDrafts((d) => ({ ...d, [r.id]: { ...d[r.id], accommodationMax: v } }))}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <NumberField
                        value={draft.perDiemItemized ?? r.perDiemItemized}
                        onChange={(v) => setPolicyDrafts((d) => ({ ...d, [r.id]: { ...d[r.id], perDiemItemized: v } }))}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <SaveButton dirty={dirty} saving={savingId === r.id} onClick={() => savePolicyRate(r.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-xs font-bold text-slate-900 mb-2">{t('adminSettings.domesticLumpSumTitle')}</h4>
          <div className="space-y-2">
            {lumpSum.map((r) => (
              <div key={r.id} className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="flex-1 text-2xs font-semibold text-slate-700">{getDomesticTierLabel(r.tier, t)}</span>
                <NumberField
                  value={lumpSumDrafts[r.id] ?? r.ratePerDay}
                  onChange={(v) => setLumpSumDrafts((d) => ({ ...d, [r.id]: v }))}
                  className="w-24"
                />
                <SaveButton dirty={(lumpSumDrafts[r.id] ?? r.ratePerDay) !== r.ratePerDay} saving={savingId === r.id} onClick={() => saveLumpSum(r.id)} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold text-slate-900 mb-2">{t('adminSettings.domesticPerDiemTitle')}</h4>
          <div className="space-y-2">
            {perDiem.map((r) => (
              <div key={r.id} className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="flex-1 text-2xs font-semibold text-slate-700">{getDomesticTierLabel(r.tier, t)}</span>
                <NumberField
                  value={perDiemDrafts[r.id] ?? r.ratePerDay}
                  onChange={(v) => setPerDiemDrafts((d) => ({ ...d, [r.id]: v }))}
                  className="w-24"
                />
                <SaveButton dirty={(perDiemDrafts[r.id] ?? r.ratePerDay) !== r.ratePerDay} saving={savingId === r.id} onClick={() => savePerDiem(r.id)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-bold text-slate-900 mb-2">{t('adminSettings.domesticAccommodationTitle')}</h4>
        <div className="space-y-2">
          {accommodation.map((r) => {
            const draft = accDrafts[r.id];
            const dirty = !!draft && (draft.singleRoomMax !== r.singleRoomMax || draft.twinRoomMax !== r.twinRoomMax);
            return (
              <div key={r.id} className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="flex-1 text-2xs font-semibold text-slate-700">{getDomesticTierLabel(r.tier, t)}</span>
                <span className="text-3xs text-slate-400">{t('adminSettings.singleRoom')}</span>
                <NumberField
                  value={draft?.singleRoomMax ?? r.singleRoomMax}
                  onChange={(v) =>
                    setAccDrafts((d) => ({ ...d, [r.id]: { singleRoomMax: v, twinRoomMax: d[r.id]?.twinRoomMax ?? r.twinRoomMax } }))
                  }
                  className="w-20"
                />
                <span className="text-3xs text-slate-400">{t('adminSettings.twinRoom')}</span>
                <NumberField
                  value={draft?.twinRoomMax ?? r.twinRoomMax}
                  onChange={(v) =>
                    setAccDrafts((d) => ({ ...d, [r.id]: { singleRoomMax: d[r.id]?.singleRoomMax ?? r.singleRoomMax, twinRoomMax: v } }))
                  }
                  className="w-20"
                />
                <SaveButton dirty={dirty} saving={savingId === r.id} onClick={() => saveAccommodation(r.id)} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------- Section: คำถามแนะนำ chatbot ----------------
function GuideQuestionsSection() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<GuideQuestionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newText, setNewText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = () => {
    fetch('/api/guide-questions')
      .then((r) => r.json())
      .then((result) => {
        if (result.success) {
          setRows(result.data);
          setDrafts(Object.fromEntries(result.data.map((r: GuideQuestionRow) => [r.id, r.text])));
        } else setError(result.error || t('adminSettings.loadFailed'));
      })
      .catch(() => setError(t('common.connectionError')));
  };

  useEffect(load, []);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/admin/guide-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText.trim() })
      });
      const result = await res.json();
      if (result.success) {
        setRows((prev) => [...(prev || []), result.data]);
        setDrafts((d) => ({ ...d, [result.data.id]: result.data.text }));
        setNewText('');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleSave = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/guide-questions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: drafts[id] })
      });
      const result = await res.json();
      if (result.success) setRows((prev) => prev?.map((r) => (r.id === id ? result.data : r)) || null);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/guide-questions/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) setRows((prev) => prev?.filter((r) => r.id !== id) || null);
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-semibold">{error}</div>;
  if (!rows) return <div className="p-8 text-center text-xs text-slate-400">{t('common.loading')}</div>;

  return (
    <div className="space-y-3">
      <p className="text-2xs text-slate-500">{t('adminSettings.guideQuestionsNote')}</p>

      <div className="flex items-center gap-2 p-3 bg-blue-50/60 border border-blue-100 rounded-xl">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder={t('adminSettings.addGuideQuestionPlaceholder')}
          className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <button
          onClick={handleAdd}
          disabled={!newText.trim() || adding}
          className="inline-flex items-center gap-1 text-2xs font-bold px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors shrink-0"
        >
          <Plus size={12} /> {t('common.add')}
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <input
              value={drafts[r.id] ?? r.text}
              onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
              className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <SaveButton dirty={(drafts[r.id] ?? r.text) !== r.text} saving={busyId === r.id} onClick={() => handleSave(r.id)} />
            <button
              onClick={() => handleDelete(r.id)}
              disabled={busyId === r.id}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors shrink-0"
              title={t('common.delete')}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-2xs text-slate-400 text-center py-4">{t('adminSettings.noGuideQuestions')}</p>}
      </div>
    </div>
  );
}

// สรุป prompt ปัจจุบันของแต่ละจุดที่เรียก Gemini ในระบบ — แสดงผลอย่างเดียว ไม่มีการแก้ไขผ่านหน้านี้
// ถ้าต้องแก้ไข prompt จริงในอนาคต ให้แก้ที่ server.ts โดยตรง (ดูจุดอ้างอิงในวงเล็บ)
const PROMPT_SUMMARIES: { title: string; modelGroup: 'agent' | 'intentClassifier'; ref: string; desc: string }[] = [
  {
    title: 'Agent 1: อ่านหนังสือเชิญ',
    modelGroup: 'agent',
    ref: 'server.ts — /api/agent/a1-parse-invitation',
    desc: 'จำแนกประเภทเอกสาร (หนังสือเชิญ / บันทึกอนุมัติ / ใบเสร็จ / ไม่เกี่ยวข้อง) แล้วถ้าเป็นหนังสือเชิญ ดึงชื่องาน วันที่ ปลายทาง หน่วยงานเจ้าภาพ รายชื่อผู้เดินทาง พร้อมสแกนหาค่าใช้จ่ายเพิ่มเติมนอกเหนือรายการมาตรฐาน (เช่นค่าลงทะเบียน) กำชับให้อ่านเอกสารทุกหน้าก่อนสรุป ไม่หยุดแค่หน้าแรก'
  },
  {
    title: 'Agent 2: ค้นหาตั๋ว/ประกัน',
    modelGroup: 'agent',
    ref: 'server.ts — /api/agent/a2-search-travel',
    desc: 'ให้ AI ประเมินตัวเลือกตั๋วเครื่องบิน 3-5 รายการ และประกันเดินทาง 2-3 รายการ จากความรู้ที่มี (ไม่ใช่ค้นเว็บจริง) พร้อมระบุเมืองปลายทางที่ใกล้สนามบินที่สุด'
  },
  {
    title: 'Agent 3: ร่างบันทึกข้อความ',
    modelGroup: 'agent',
    ref: 'server.ts — /api/agent/a3-draft-memo',
    desc: 'ร่างเฉพาะย่อหน้าเหตุผล/ความสำคัญ และอีเมลแจ้งเตือนภายใน ไม่ให้แตะโครงสร้างเอกสารหรือตัวเลขงบประมาณ (ฝั่ง client ประกอบเองแบบ deterministic เสมอ) ปรับข้อความอัตโนมัติตามประเภททริป (ในประเทศ/ต่างประเทศ)'
  },
  {
    title: 'Agent 4: อ่านบันทึกอนุมัติที่เซ็นแล้ว',
    modelGroup: 'agent',
    ref: 'server.ts — /api/agent/a4-parse-memo',
    desc: 'Vision extraction จากไฟล์/รูปบันทึกอนุมัติที่เซ็นแล้ว ดึงเลขที่เอกสาร หน่วยงาน ยอดอนุมัติ รหัสงบประมาณ รายชื่อผู้เดินทาง และรายการค่าใช้จ่าย เพื่อเตรียมข้อมูลกรอกระบบ e-Payment'
  },
  {
    title: 'Agent 5: อ่านใบเสร็จ',
    modelGroup: 'agent',
    ref: 'server.ts — /api/agent/a5-parse-receipt',
    desc: 'Vision OCR ใบเสร็จ/ใบกำกับภาษี ดึงชื่อร้าน วันที่ ยอดเงิน VAT และจับคู่แต่ละรายการกับ GL code มาตรฐานอัตโนมัติ พร้อมให้คะแนนความชัดของภาพ (ต่ำกว่า 80 จะเตือนในหน้าจอ)'
  },
  {
    title: 'Chatbot — ตัวกรองเบื้องต้น (Intent Classifier)',
    modelGroup: 'intentClassifier',
    ref: 'server.ts — classifyIsOnTopic()',
    desc: 'เช็คสั้นๆว่าข้อความล่าสุดเกี่ยวข้องกับงานเดินทางราชการ/ระเบียบเบิกจ่าย/ระบบ CU-AI PASS หรือไม่ ก่อนส่งต่อเข้า Agent หลักที่มีต้นทุนสูงกว่า ตั้ง temperature = 0, timeout 3 วินาที ถ้า error/timeout จะปล่อยผ่านเข้า Agent หลักเสมอ (fail-open)'
  },
  {
    title: 'Chatbot — Agent หลัก',
    modelGroup: 'agent',
    ref: 'server.ts — /api/agent/chat',
    desc: 'ผู้ช่วยหลักของ chatbot มี 5 หน้าที่: ตอบคำถามระเบียบ (ต้องเรียก get_regulation_data ก่อนเสมอ ห้ามเดาตัวเลข), ค้นหาคำขอเดินทางในระบบ, เตรียมร่างคำขอใหม่, เตรียมแก้ไขคำขอเดิม, ดึงข้อมูลระเบียบเพิ่มเติมจากเอกสารที่ ingest ไว้ (ค้นหาแบบ RAG) — วนเรียกซ้ำได้สูงสุด 4 รอบจนกว่าจะไม่มี function call เหลือ'
  }
];

function ModelSelectField({
  label,
  description,
  value,
  options,
  onSave,
  saving
}: {
  label: string;
  description: string;
  value: string;
  options: { name: string; displayName: string }[];
  onSave: (newValue: string) => void;
  saving: boolean;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  // ค่าที่บันทึกไว้ (ไม่ใช่ draft) ไม่มีอยู่ในรายชื่อ model สดจาก Gemini API แล้ว — เตือนไว้ก่อนจะพังตอนใช้งานจริง (เช่นกรณี model ถูกเลิกรองรับ)
  const isValueMissing = !!value && !options.some((o) => o.name === value);

  return (
    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
      <div>
        <p className="text-xs font-bold text-slate-900">{label}</p>
        <p className="text-2xs text-slate-500 mt-0.5">{description}</p>
        {isValueMissing && (
          <p className="text-2xs text-red-700 font-bold mt-1 flex items-center gap-1">
            <Info size={11} /> {t('adminSettings.modelMissingWarning', { model: value })}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {!options.some((o) => o.name === draft) && draft && <option value={draft}>{draft}</option>}
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.displayName} ({o.name})
            </option>
          ))}
        </select>
        <SaveButton dirty={draft !== value} saving={saving} onClick={() => onSave(draft)} />
      </div>
    </div>
  );
}

// ---------------- Section: Gemini API (เลือก model + สรุป prompt ปัจจุบัน) ----------------
function GeminiSection() {
  const { t } = useLanguage();
  const [modelOptions, setModelOptions] = useState<{
    generateContent: { name: string; displayName: string }[];
    embedContent: { name: string; displayName: string }[];
  } | null>(null);
  const [current, setCurrent] = useState<{ agent: string; intentClassifier: string; embeddingModel: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<'agent' | 'intentClassifier' | null>(null);

  useEffect(() => {
    Promise.all([fetch('/api/admin/gemini-models').then((r) => r.json()), fetch('/api/admin/ai-model-settings').then((r) => r.json())])
      .then(([modelsResult, settingsResult]) => {
        if (modelsResult.success) setModelOptions(modelsResult.data);
        else setError(modelsResult.error || t('adminSettings.loadFailed'));
        if (settingsResult.success) setCurrent(settingsResult.data);
      })
      .catch(() => setError(t('common.connectionError')));
  }, [t]);

  const handleSave = async (field: 'agent' | 'intentClassifier', newValue: string) => {
    setSavingField(field);
    try {
      const res = await fetch('/api/admin/ai-model-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: newValue })
      });
      const result = await res.json();
      if (result.success) setCurrent(result.data);
    } catch (e) {
      console.error('Failed to save AI model setting', e);
    } finally {
      setSavingField(null);
    }
  };

  if (error) return <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-semibold">{error}</div>;
  if (!modelOptions || !current) return <div className="p-8 text-center text-xs text-slate-400">{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <p className="text-2xs font-bold text-slate-600 bg-slate-100 px-3.5 py-2 border-b border-slate-200">{t('adminSettings.geminiModelHeading')}</p>
        <div className="p-3.5 space-y-3">
          <ModelSelectField
            label={t('adminSettings.labelAgentModel')}
            description={t('adminSettings.agentModelDesc')}
            value={current.agent}
            options={modelOptions.generateContent}
            saving={savingField === 'agent'}
            onSave={(v) => handleSave('agent', v)}
          />
          <ModelSelectField
            label={t('adminSettings.labelIntentClassifierModel')}
            description={t('adminSettings.intentClassifierModelDesc')}
            value={current.intentClassifier}
            options={modelOptions.generateContent}
            saving={savingField === 'intentClassifier'}
            onSave={(v) => handleSave('intentClassifier', v)}
          />
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <p className="text-2xs font-bold text-slate-600 bg-slate-100 px-3.5 py-2 border-b border-slate-200">{t('adminSettings.embeddingHealthHeading')}</p>
        <div className="p-3.5">
          {(() => {
            const embeddingOk = modelOptions.embedContent.some((o) => o.name === current.embeddingModel);
            return (
              <div className={`flex items-start gap-2.5 p-3 rounded-lg border ${embeddingOk ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <Info size={14} className={`shrink-0 mt-0.5 ${embeddingOk ? 'text-emerald-600' : 'text-red-600'}`} />
                <div className="text-2xs leading-relaxed">
                  <p className={`font-bold ${embeddingOk ? 'text-emerald-900' : 'text-red-900'}`}>
                    {current.embeddingModel} — {embeddingOk ? t('adminSettings.embeddingOk') : t('adminSettings.embeddingMissing')}
                  </p>
                  <p className={embeddingOk ? 'text-emerald-800' : 'text-red-800'}>{t('adminSettings.embeddingNote')}</p>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <p className="text-2xs font-bold text-slate-600 bg-slate-100 px-3.5 py-2 border-b border-slate-200">{t('adminSettings.promptSummaryHeading')}</p>
        <div className="divide-y divide-slate-100">
          {PROMPT_SUMMARIES.map((p) => (
            <div key={p.ref} className="p-3.5 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold text-slate-900">{p.title}</p>
                <span
                  className={`px-1.5 py-0.5 rounded text-3xs font-bold ${
                    p.modelGroup === 'agent' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-purple-50 text-purple-700 border border-purple-200'
                  }`}
                >
                  {p.modelGroup === 'agent' ? t('adminSettings.labelAgentModel') : t('adminSettings.labelIntentClassifierModel')}
                </span>
              </div>
              <p className="text-2xs text-slate-500 font-mono">{p.ref}</p>
              <p className="text-2xs text-slate-700 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="p-3.5 bg-amber-50/60 border-t border-amber-100 flex items-start gap-2">
          <Info size={13} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-2xs text-amber-900 leading-relaxed">{t('adminSettings.promptSummaryNote')}</p>
        </div>
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { t } = useLanguage();
  const [section, setSection] = useState<Section>('quota');
  const sections = getSections(t);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      <div className="p-6 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-950 flex items-center gap-2">
          <Settings className="text-blue-600" size={20} />
          {t('adminSettings.title')}
        </h2>
        <p className="text-xs text-slate-500 mt-1">{t('adminSettings.subtitle')}</p>
      </div>

      <div className="flex items-center gap-1.5 px-6 pt-4 border-b border-slate-200 overflow-x-auto">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-xs font-bold transition-colors whitespace-nowrap ${
              section === s.id ? 'text-blue-700 bg-blue-50 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {section === 'quota' && <QuotaSection />}
        {section === 'countries' && <CountryGroupSection />}
        {section === 'rates' && <RatesSection />}
        {section === 'questions' && <GuideQuestionsSection />}
        {section === 'gemini' && <GeminiSection />}
      </div>
    </div>
  );
}
