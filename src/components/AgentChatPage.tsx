/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Bot, ArrowRight, PlusCircle, ClipboardCheck, Inbox, Clock, X } from 'lucide-react';
import { getStatusBadge } from './TripTable';
import { useLanguage } from '../i18n/LanguageContext';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export interface ChatTraveler {
  name: string;
  position?: string;
  positionLevel?: string;
}

interface ChatTripSummary {
  id: string;
  projectName: string;
  location: string;
  country?: string | null;
  destinationProvince?: string | null;
  status: any;
  startDate: string;
  endDate: string;
  estimatedBudget: number;
  travelers?: ChatTraveler[];
}

export interface ProposedTripDraft {
  projectName: string;
  tripType: 'DOMESTIC' | 'INTERNATIONAL';
  startDate: string;
  endDate: string;
  location: string;
  country: string;
  destinationProvince: string;
  hostOrganization: string;
  travelers: ChatTraveler[];
}

export interface ProposedTripUpdate {
  tripId: string;
  projectName: string;
  tripType: 'DOMESTIC' | 'INTERNATIONAL';
  startDate: string;
  endDate: string;
  location: string;
  country: string;
  destinationProvince: string;
  hostOrganization: string;
  travelers: ChatTraveler[];
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

type AgentResult =
  | { kind: 'trips'; trips: ChatTripSummary[] }
  | { kind: 'draft'; draft: ProposedTripDraft; confirmed: boolean }
  | { kind: 'update'; update: ProposedTripUpdate; confirmed: boolean };

interface AgentChatPageProps {
  onOpenTrip: (tripId: string) => void;
  onConfirmCreateTrip: (draft: ProposedTripDraft) => Promise<void>;
  onConfirmUpdateTrip: (update: ProposedTripUpdate) => Promise<void>;
}

// ค่า fallback เผื่อโหลดจาก DB ไม่สำเร็จ — ค่าจริงแก้ไขได้จากหน้า admin (GuideQuestion)
const FALLBACK_STARTER_QUESTIONS = [
  'เพดานที่พักกลุ่ม 2 ต่างประเทศเท่าไหร่',
  'ช่วยหาคำขอเดินทางไปประเทศญี่ปุ่นทั้งหมด',
  'ช่วยสร้างคำขอเดินทางใหม่'
];

const TravelersList: React.FC<{ travelers: ChatTraveler[] }> = ({ travelers }) => {
  const { t } = useLanguage();
  if (!travelers?.length) return null;
  return (
    <p>
      <span className="font-semibold">{t('chat.travelersLabel', { count: travelers.length })}</span>{' '}
      {travelers.map((tr) => tr.name).filter(Boolean).join(', ')}
    </p>
  );
};

const TripResultCard: React.FC<{ trip: ChatTripSummary; onOpen: (id: string) => void }> = ({ trip, onOpen }) => {
  const { t } = useLanguage();
  return (
    <button
      onClick={() => onOpen(trip.id)}
      className="w-full text-left p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-xs text-slate-900 truncate">{trip.projectName || t('chat.untitled')}</span>
        <ArrowRight size={12} className="text-slate-400 shrink-0" />
      </div>
      <div className="text-2xs text-slate-500 mt-0.5">
        {trip.location}
        {trip.country ? `, ${trip.country}` : trip.destinationProvince ? `, ${trip.destinationProvince}` : ''}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span>{getStatusBadge(trip.status, t)}</span>
        <span className="font-mono text-2xs font-bold text-slate-700">฿{trip.estimatedBudget.toLocaleString()}</span>
      </div>
    </button>
  );
};

export default function AgentChatPage({ onOpenTrip, onConfirmCreateTrip, onConfirmUpdateTrip }: AgentChatPageProps) {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [showIdleNotice, setShowIdleNotice] = useState(false);
  const [starterQuestions, setStarterQuestions] = useState<string[]>(FALLBACK_STARTER_QUESTIONS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // โหลดคำถามแนะนำจาก DB (แก้ไขได้จากหน้า admin) — ถ้าโหลดไม่สำเร็จหรือยังไม่มีข้อมูล ใช้ค่า fallback แทน
  useEffect(() => {
    fetch('/api/guide-questions')
      .then((res) => res.json())
      .then((result) => {
        if (result.success && Array.isArray(result.data) && result.data.length) {
          setStarterQuestions(result.data.map((q: { text: string }) => q.text));
        }
      })
      .catch((e) => console.error('Failed to load guide questions', e));
  }, []);

  // ปรับความสูงกล่องพิมพ์ตามจำนวนบรรทัด (สูงสุด ~6 บรรทัด แล้วเลื่อนในกล่องแทน)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [input]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeShownRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // idle timeout 5 นาที นับใหม่ทุกครั้งที่มีการ chat — ถ้าไม่มีการใช้งานครบ 5 นาทีถึงจะล้างแชท/ผลลัพธ์
  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setMessages([]);
      setResult(null);
    }, IDLE_TIMEOUT_MS);
  };

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const sendMessage = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;

    resetIdleTimer();
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setInput('');
    setError(null);
    setLoading(true);

    // ถ้าผลลัพธ์ที่แสดงอยู่ตอนนี้เป็นการแก้ไขคำขอเดิม ให้บอก tripId นั้นไปกับทุกเทิร์นถัดไปด้วย
    // กัน model สลับไปแก้คำขออื่นที่ชื่อคล้ายกันโดยไม่ได้ตั้งใจ (เจอบั๊กนี้จริงตอนทดสอบ — เทิร์นที่ 2 เลือก tripId ผิดตัว)
    const activeTripId = result?.kind === 'update' && !result.confirmed ? result.update.tripId : undefined;

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history, activeTripId })
      });
      const data = await res.json();
      if (data.success && data.data?.reply) {
        setMessages((prev) => [...prev, { role: 'model', text: data.data.reply }]);
        // แสดงผลลัพธ์ล่าสุด (รายการที่ค้นเจอ หรือร่างคำขอ) ในโซนแสดงผลด้านข้าง — ถ้าเทิร์นนี้ไม่มีผลลัพธ์ใหม่ ให้คงของเดิมไว้
        // เช็ค proposedTrip/proposedUpdate ก่อน trips เสมอ — บางเทิร์น model อาจเรียก search_trips ซ้ำเพื่อหา tripId ก่อนเสนอแก้ไข
        // ทำให้ trips ไม่ว่างพร้อมกับมี proposedUpdate ด้วย ต้องให้ผลลัพธ์ที่ actionable กว่า (ร่าง/แก้ไข) ชนะการแสดงผลเสมอ
        if (data.data.proposedTrip) {
          setResult({ kind: 'draft', draft: data.data.proposedTrip, confirmed: false });
        } else if (data.data.proposedUpdate) {
          setResult({ kind: 'update', update: data.data.proposedUpdate, confirmed: false });
        } else if (data.data.trips?.length) {
          setResult({ kind: 'trips', trips: data.data.trips });
        }

        // แจ้งเตือนครั้งเดียวหลังจาก AI ตอบครั้งแรก ว่าแชท/ผลลัพธ์จะถูกล้างถ้าไม่มีการใช้งาน
        if (!noticeShownRef.current) {
          noticeShownRef.current = true;
          setShowIdleNotice(true);
          noticeTimerRef.current = setTimeout(() => setShowIdleNotice(false), 6000);
        }
      } else {
        setError(data.error || t('chat.requestFailed'));
      }
    } catch (e) {
      console.error('Agent chat request failed', e);
      setError(t('common.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Enter = ส่งข้อความ, Shift+Enter = ขึ้นบรรทัดใหม่ (เหมือน Claude)
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleConfirmCreate = async () => {
    if (!result || result.kind !== 'draft' || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await onConfirmCreateTrip(result.draft);
      setResult((prev) => (prev && prev.kind === 'draft' ? { ...prev, confirmed: true } : prev));
    } catch (e) {
      console.error('Failed to confirm trip creation from agent chat', e);
      setConfirmError(t('chat.createFailed'));
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmUpdate = async () => {
    if (!result || result.kind !== 'update' || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await onConfirmUpdateTrip(result.update);
      setResult((prev) => (prev && prev.kind === 'update' ? { ...prev, confirmed: true } : prev));
    } catch (e) {
      console.error('Failed to confirm trip update from agent chat', e);
      setConfirmError(t('chat.updateFailed'));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[1fr_360px] gap-6 lg:h-[75vh] lg:min-h-[600px]">
      {showIdleNotice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-slate-900 text-white text-xs font-semibold pl-4 pr-3 py-3 rounded-full shadow-xl max-w-[calc(100vw-2rem)]">
          <Clock size={15} className="text-blue-300 shrink-0" />
          <span>{t('chat.idleNotice')}</span>
          <button
            onClick={() => setShowIdleNotice(false)}
            className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Zone แชท */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col overflow-hidden h-[560px] lg:h-full">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white shrink-0">
            <Bot size={17} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">{t('chat.title')}</h2>
            <p className="text-3xs text-slate-400 font-medium">{t('chat.subtitle')}</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                {t('chat.welcomeMessage')}
              </div>
              <div className="space-y-1.5">
                {starterQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="w-full text-left text-xs px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg border border-blue-100 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, idx) => (
            <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-xs whitespace-pre-line ${
                  m.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 text-slate-400 px-3.5 py-2.5 rounded-xl rounded-bl-sm text-xs flex items-center gap-1.5">
                <Sparkles size={12} className="animate-pulse" />
                {t('chat.typing')}
              </div>
            </div>
          )}

          {error && (
            <div className="text-2xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 font-semibold">{error}</div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={t('chat.inputPlaceholder')}
              disabled={loading}
              rows={1}
              className="flex-1 resize-none px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm leading-normal min-h-[42px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg transition-colors shrink-0"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-3xs text-slate-400 font-medium mt-1.5 px-0.5">{t('chat.enterHint')}</p>
        </form>
      </div>

      {/* Zone แสดงผล */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col overflow-hidden h-[420px] lg:h-full">
        <div className="px-5 py-4 border-b border-slate-200 shrink-0">
          <h3 className="text-xs font-bold text-slate-900">{t('chat.resultsTitle')}</h3>
          <p className="text-3xs text-slate-400 font-medium mt-0.5">{t('chat.resultsSubtitle')}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!result && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-10">
              <Inbox size={30} className="text-slate-300" />
              <p className="text-xs text-slate-400 font-medium">{t('chat.noResultsYet')}</p>
            </div>
          )}

          {result?.kind === 'trips' && (
            <div className="space-y-2">
              <p className="text-2xs font-bold text-slate-500 uppercase tracking-wider">{t('chat.foundCount', { count: result.trips.length })}</p>
              {result.trips.map((t) => (
                <TripResultCard key={t.id} trip={t} onOpen={onOpenTrip} />
              ))}
            </div>
          )}

          {result?.kind === 'draft' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-blue-800 text-xs font-bold">
                <ClipboardCheck size={14} />
                {t('chat.draftTitle')}
              </div>
              <div className="text-xs text-slate-700 space-y-1 bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p>
                  <span className="font-semibold">{t('chat.projectLabel')}</span> {result.draft.projectName}
                </p>
                <p>
                  <span className="font-semibold">{t('workflow.destination')}:</span>{' '}
                  {result.draft.location || '-'}
                  {result.draft.tripType === 'DOMESTIC'
                    ? result.draft.destinationProvince
                      ? `, ${result.draft.destinationProvince}`
                      : ''
                    : result.draft.country
                    ? `, ${result.draft.country}`
                    : ''}
                </p>
                {(result.draft.startDate || result.draft.endDate) && (
                  <p>
                    <span className="font-semibold">{t('chat.dateLabel')}</span> {result.draft.startDate || '?'} - {result.draft.endDate || '?'}
                  </p>
                )}
                <TravelersList travelers={result.draft.travelers} />
              </div>

              {result.confirmed ? (
                <div className="text-xs text-emerald-700 font-bold flex items-center gap-1.5">
                  <PlusCircle size={14} />
                  {t('chat.createSaved')}
                </div>
              ) : (
                <>
                  <button
                    onClick={handleConfirmCreate}
                    disabled={confirming}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    {confirming ? t('chat.saving') : t('chat.confirmCreate')}
                    {!confirming && <ArrowRight size={14} />}
                  </button>
                  {confirmError && <p className="text-2xs text-red-600 font-semibold">{confirmError}</p>}
                </>
              )}
            </div>
          )}

          {result?.kind === 'update' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-amber-800 text-xs font-bold">
                <ClipboardCheck size={14} />
                {t('chat.updateTitle')}
              </div>
              <div className="text-xs text-slate-700 space-y-1 bg-amber-50 rounded-lg p-3 border border-amber-200">
                <p>
                  <span className="font-semibold">{t('chat.projectLabel')}</span> {result.update.projectName}
                </p>
                <p>
                  <span className="font-semibold">{t('workflow.destination')}:</span>{' '}
                  {result.update.location || '-'}
                  {result.update.tripType === 'DOMESTIC'
                    ? result.update.destinationProvince
                      ? `, ${result.update.destinationProvince}`
                      : ''
                    : result.update.country
                    ? `, ${result.update.country}`
                    : ''}
                </p>
                {(result.update.startDate || result.update.endDate) && (
                  <p>
                    <span className="font-semibold">{t('chat.dateLabel')}</span> {result.update.startDate || '?'} - {result.update.endDate || '?'}
                  </p>
                )}
                <TravelersList travelers={result.update.travelers} />
              </div>

              {result.confirmed ? (
                <div className="text-xs text-emerald-700 font-bold flex items-center gap-1.5">
                  <PlusCircle size={14} />
                  {t('chat.updateSaved')}
                </div>
              ) : (
                <>
                  <button
                    onClick={handleConfirmUpdate}
                    disabled={confirming}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    {confirming ? t('chat.saving') : t('chat.confirmUpdate')}
                    {!confirming && <ArrowRight size={14} />}
                  </button>
                  {confirmError && <p className="text-2xs text-red-600 font-semibold">{confirmError}</p>}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
