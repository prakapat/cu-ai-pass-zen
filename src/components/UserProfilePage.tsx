/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { X, User, IdCard } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface Profile {
  username: string;
  titlePrefix?: string | null;
  firstName: string;
  lastName: string;
  fullNameEn?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  birthDate?: string | null;
  maritalStatus?: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | null;
  academicTitle1?: string | null;
  academicTitle2?: string | null;
  militaryRank?: string | null;
  otherPrefix?: string | null;
  royalTitle?: string | null;
  role: string;
}

function calcAge(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const notYetBirthday = now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (notYetBirthday) age -= 1;
  return age;
}

function formatLocalDate(dateStr: string | null | undefined, lang: 'th' | 'en'): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-3xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
    <p className="text-sm font-semibold text-slate-900 mt-0.5">{value || '-'}</p>
  </div>
);

export default function UserProfilePage({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/profile')
      .then((res) => res.json())
      .then((result) => {
        if (result.success) setProfile(result.data);
        else setError(result.error || t('profile.loadFailed'));
      })
      .catch(() => setError(t('common.connectionError')));
  }, [t]);

  const fullNameTh = profile
    ? [profile.titlePrefix, profile.firstName, profile.lastName].filter(Boolean).join(' ')
    : '';
  const age = calcAge(profile?.birthDate);

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full border border-slate-200 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
            <IdCard className="text-blue-600" size={18} />
            {t('profile.title')}
          </h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-semibold">{error}</div>}

          {!profile && !error && <div className="text-xs text-slate-400 text-center py-6">{t('common.loading')}</div>}

          {profile && (
            <>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-lg text-blue-600 shrink-0">
                  <User size={24} />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900">{fullNameTh}</p>
                  <p className="text-xs text-slate-500 font-medium">{t(`role.${profile.role}`)} &middot; @{profile.username}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <Field label={t('profile.fullNameEn')} value={profile.fullNameEn} />
                <Field label={t('profile.gender')} value={profile.gender ? t(`profile.gender.${profile.gender}`) : null} />
                <Field
                  label={t('profile.birthDate')}
                  value={profile.birthDate ? `${formatLocalDate(profile.birthDate, lang)} (${t('profile.age', { age: age ?? '' })})` : null}
                />
                <Field label={t('profile.maritalStatus')} value={profile.maritalStatus ? t(`profile.marital.${profile.maritalStatus}`) : null} />
                <Field label={t('profile.academicTitle1')} value={profile.academicTitle1} />
                <Field label={t('profile.academicTitle2')} value={profile.academicTitle2} />
                <Field label={t('profile.militaryRank')} value={profile.militaryRank} />
                <Field label={t('profile.otherPrefix')} value={profile.otherPrefix} />
                <Field label={t('profile.royalTitle')} value={profile.royalTitle} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
