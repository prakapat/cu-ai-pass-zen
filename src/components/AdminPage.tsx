/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldAlert, Settings } from 'lucide-react';
import AdminUsersPage from './AdminUsersPage';
import AdminSettingsPage from './AdminSettingsPage';
import { useLanguage } from '../i18n/LanguageContext';

type AdminTab = 'users' | 'settings';

export default function AdminPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<AdminTab>('users');

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
        <button
          onClick={() => setTab('users')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
            tab === 'users' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldAlert size={14} />
          {t('adminUsers.navTab')}
        </button>
        <button
          onClick={() => setTab('settings')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
            tab === 'settings' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Settings size={14} />
          {t('adminSettings.title')}
        </button>
      </div>

      {tab === 'users' ? <AdminUsersPage /> : <AdminSettingsPage />}
    </div>
  );
}
