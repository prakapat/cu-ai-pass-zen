/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ShieldAlert, Lock, LockOpen, RotateCcw } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface AdminUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  irrelevantUploadStreak: number;
  irrelevantUploadTotal: number;
  pageLockedUntil: string | null;
  accountAiLocked: boolean;
}

function getRemainingMinutes(pageLockedUntil: string): number {
  return Math.max(1, Math.ceil((new Date(pageLockedUntil).getTime() - Date.now()) / 60000));
}

export default function AdminUsersPage() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);

  const loadUsers = () => {
    fetch('/api/admin/users')
      .then((res) => res.json())
      .then((result) => {
        if (result.success) setUsers(result.data);
        else setError(result.error || t('adminUsers.loadFailed'));
      })
      .catch(() => setError(t('common.connectionError')));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleUnlock = async (id: string) => {
    setUnlockingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/unlock`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setUsers((prev) => prev?.map((u) => (u.id === id ? result.data : u)) || null);
      }
    } catch (e) {
      console.error('Failed to unlock user', e);
    } finally {
      setUnlockingId(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      <div className="p-6 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-950 flex items-center gap-2">
          <ShieldAlert className="text-blue-600" size={20} />
          {t('adminUsers.title')}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {t('adminUsers.subtitle')}
        </p>
      </div>

      {error && (
        <div className="p-4 text-xs text-red-700 bg-red-50 border-b border-red-200 font-semibold">{error}</div>
      )}

      {!users && !error && <div className="p-8 text-center text-xs text-slate-400">{t('common.loading')}</div>}

      {users && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-650 uppercase text-2xs font-bold tracking-wider border-b border-slate-200">
                <th className="py-3 px-6">{t('adminUsers.colUser')}</th>
                <th className="py-3 px-6">{t('adminUsers.colRole')}</th>
                <th className="py-3 px-6">{t('adminUsers.colIrrelevantTotal')}</th>
                <th className="py-3 px-6">{t('adminUsers.colStatus')}</th>
                <th className="py-3 px-6 text-right">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map((u) => {
                const pageLocked = !!u.pageLockedUntil && new Date(u.pageLockedUntil) > new Date();
                const needsUnlock = u.accountAiLocked || pageLocked;
                return (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-6 border-b border-slate-100">
                      <div className="font-bold text-sm text-slate-950">{u.firstName} {u.lastName}</div>
                      <div className="text-2xs text-slate-400 font-medium">@{u.username}</div>
                    </td>
                    <td className="py-4 px-6 text-xs text-slate-700 border-b border-slate-100">
                      {t(`role.${u.role}`)}
                    </td>
                    <td className="py-4 px-6 text-xs font-mono text-slate-700 border-b border-slate-100">
                      {t('adminUsers.timesCount', { count: u.irrelevantUploadTotal })}
                    </td>
                    <td className="py-4 px-6 text-sm border-b border-slate-100">
                      {u.accountAiLocked ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-red-50 text-red-800 border border-red-200">
                          <Lock size={11} /> {t('adminUsers.aiLocked')}
                        </span>
                      ) : pageLocked ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <Lock size={11} /> {t('adminUsers.pageLocked', { minutes: getRemainingMinutes(u.pageLockedUntil!) })}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <LockOpen size={11} /> {t('adminUsers.normal')}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right border-b border-slate-100">
                      <button
                        onClick={() => handleUnlock(u.id)}
                        disabled={!needsUnlock || unlockingId === u.id}
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <RotateCcw size={12} />
                        {unlockingId === u.id ? t('adminUsers.unlocking') : t('adminUsers.unlock')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
