/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { translations } from './translations';

export type Lang = 'th' | 'en';

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = 'cuaipass_lang';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'en' ? 'en' : 'th';
    } catch {
      return 'th';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore — localStorage อาจถูกปิดใน private mode บางเบราว์เซอร์ ไม่กระทบการทำงานหลัก
    }
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const toggleLang = useCallback(() => setLangState((prev) => (prev === 'th' ? 'en' : 'th')), []);

  // คืนค่าคีย์เดิมกลับไปถ้าไม่พบคำแปล (แทนที่จะพัง) เพื่อให้เห็นคีย์ที่ตกหล่นได้ง่ายตอน dev
  // รองรับ interpolation ง่ายๆด้วย {{name}} เช่น t('workflow.step', { n: 2 })
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const entry = translations[key];
      if (!entry) {
        console.warn(`[i18n] Missing translation key: ${key}`);
        return key;
      }
      let str = entry[lang] ?? entry.th;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.split(`{{${k}}}`).join(String(v));
        }
      }
      return str;
    },
    [lang]
  );

  return <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
