/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plane, LogIn, AlertCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface AuthUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface LoginPageProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const { t, lang, toggleLang } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const result = await res.json();
      if (result.success) {
        onLoginSuccess(result.data);
      } else {
        setError(result.error || t('login.failed'));
      }
    } catch (err) {
      console.error('Login failed:', err);
      setError(t('login.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 relative">
      <button
        onClick={toggleLang}
        title={t('nav.langToggle')}
        className="absolute top-4 right-4 inline-flex items-center w-[50px] h-[22px] rounded-full bg-slate-900 px-1 shrink-0"
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
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-100 mx-auto">
            <Plane className="rotate-45" size={22} />
          </div>
          <h1 className="text-lg font-extrabold tracking-tight text-slate-900">CU-AI PASS</h1>
          <p className="text-xs text-slate-500">{t('login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">{t('login.username')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('login.usernamePlaceholder')}
              autoFocus
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">{t('login.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-md shadow-blue-950/20 transition-all"
          >
            <LogIn size={14} />
            {loading ? t('login.loggingIn') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
