/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { TripPlan } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface DeleteTripModalProps {
  trip: TripPlan;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteTripModal({ trip, onCancel, onConfirm }: DeleteTripModalProps) {
  const { t } = useLanguage();
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = confirmText.trim().toLowerCase() === 'delete';

  const handleConfirm = async () => {
    if (!canDelete || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      console.error('Failed to delete trip', e);
      setError(t('deleteModal.failed'));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-red-700 flex items-center gap-2">
            <AlertTriangle size={18} />
            {t('deleteModal.title')}
          </h3>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            {t('deleteModal.willDelete')}<span className="font-bold text-red-600">{t('deleteModal.permanent')}</span>{' '}
            — {t('deleteModal.requestLabel')} "<span className="font-bold text-slate-900">{trip.projectName || t('chat.untitled')}</span>"
          </p>

          <div>
            <label className="text-3xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
              {t('deleteModal.typeToConfirm')} <span className="font-mono text-red-600">delete</span> {t('deleteModal.toConfirmSuffix')}
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="delete"
              autoFocus
              disabled={submitting}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 disabled:opacity-50"
            />
          </div>

          {error && <p className="text-2xs text-red-600 font-semibold">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onCancel}
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canDelete || submitting}
              className="flex-1 px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white transition-colors"
            >
              {submitting ? t('deleteModal.deleting') : t('deleteModal.deleteAction')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
