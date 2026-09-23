/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Plus, Search, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { TripPlan, TripStatus } from '../types';
import TripTable from './TripTable';
import { useLanguage } from '../i18n/LanguageContext';

interface RequestListPageProps {
  trips: TripPlan[];
  selectedTrip: TripPlan | null;
  onSelectTrip: (trip: TripPlan) => void;
  onCreateNewTrip: () => void;
  onCancelTrip: (trip: TripPlan) => void;
  onReactivateTrip: (trip: TripPlan) => void;
  onDeleteTrip: (trip: TripPlan) => void;
}

type SortKey = 'projectName' | 'startDate' | 'estimatedBudget' | 'status';
type SortDirection = 'asc' | 'desc';

const STATUS_FILTER_VALUES: TripStatus[] = [
  'A1_DRAFT',
  'A2_SEARCHING',
  'A3_MEMO_DRAFTED',
  'A3_A4_WAITING_SIGNATURE',
  'A4_EPAYMENT_PREP',
  'A4_EXPORTED',
  'FIORI_PENDING',
  'WAITING_CASH_ADVANCE',
  'A5_UPLOADING_RECEIPTS',
  'TRIP_CLEARED'
];

export default function RequestListPage({
  trips,
  selectedTrip,
  onSelectTrip,
  onCreateNewTrip,
  onCancelTrip,
  onReactivateTrip,
  onDeleteTrip
}: RequestListPageProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TripStatus | 'ALL'>('ALL');
  const [tripTypeFilter, setTripTypeFilter] = useState<'ALL' | 'DOMESTIC' | 'INTERNATIONAL'>('ALL');
  const [cancelledFilter, setCancelledFilter] = useState<'ACTIVE' | 'CANCELLED' | 'ALL'>('ACTIVE');
  const [sortKey, setSortKey] = useState<SortKey>('startDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const filteredTrips = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = trips.filter((trip) => {
      if (cancelledFilter === 'ACTIVE' && trip.isCancelled) return false;
      if (cancelledFilter === 'CANCELLED' && !trip.isCancelled) return false;
      if (statusFilter !== 'ALL' && trip.status !== statusFilter) return false;
      if (tripTypeFilter !== 'ALL' && trip.tripType !== tripTypeFilter) return false;
      if (term) {
        const haystack = [
          trip.projectName,
          trip.location,
          trip.country,
          trip.destinationProvince,
          trip.budgetCode
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'projectName':
          cmp = a.projectName.localeCompare(b.projectName, 'th');
          break;
        case 'startDate':
          cmp = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
          break;
        case 'estimatedBudget':
          cmp = a.estimatedBudget - b.estimatedBudget;
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [trips, search, statusFilter, tripTypeFilter, cancelledFilter, sortKey, sortDirection]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown size={11} className="text-slate-300" />;
    return sortDirection === 'asc' ? (
      <ArrowUp size={11} className="text-blue-600" />
    ) : (
      <ArrowDown size={11} className="text-blue-600" />
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-6 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{t('requests.title')}</h2>
            <p className="text-xs text-slate-500">{t('requests.subtitle')}</p>
          </div>
          <button
            onClick={onCreateNewTrip}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Plus size={14} />
            {t('requests.addNew')}
          </button>
        </div>

        {/* Filters toolbar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('requests.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TripStatus | 'ALL')}
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="ALL">{t('requests.allStatuses')}</option>
            {STATUS_FILTER_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`status.${value}`)}
              </option>
            ))}
          </select>

          <select
            value={tripTypeFilter}
            onChange={(e) => setTripTypeFilter(e.target.value as 'ALL' | 'DOMESTIC' | 'INTERNATIONAL')}
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="ALL">{t('requests.tripTypeAll')}</option>
            <option value="DOMESTIC">{t('table.domestic')}</option>
            <option value="INTERNATIONAL">{t('requests.international')}</option>
          </select>

          <select
            value={cancelledFilter}
            onChange={(e) => setCancelledFilter(e.target.value as 'ACTIVE' | 'CANCELLED' | 'ALL')}
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="ACTIVE">{t('requests.excludeCancelled')}</option>
            <option value="CANCELLED">{t('requests.onlyCancelled')}</option>
            <option value="ALL">{t('requests.includeCancelled')}</option>
          </select>
        </div>

        {/* Sortable column shortcuts */}
        <div className="px-4 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2 text-2xs">
          <span className="font-bold text-slate-400 uppercase tracking-wider mr-1">{t('requests.sortBy')}</span>
          {([
            ['projectName', t('requests.sortTitle')],
            ['startDate', t('requests.sortDate')],
            ['estimatedBudget', t('requests.sortBudget')],
            ['status', t('requests.sortStatus')]
          ] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-colors ${
                sortKey === key ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {label}
              <SortIcon column={key} />
            </button>
          ))}
          <span className="text-slate-400 ml-auto">{t('requests.resultCount', { shown: filteredTrips.length, total: trips.length })}</span>
        </div>

        <TripTable
          trips={filteredTrips}
          selectedTrip={selectedTrip}
          onSelectTrip={onSelectTrip}
          onCancelTrip={onCancelTrip}
          onReactivateTrip={onReactivateTrip}
          onDeleteTrip={onDeleteTrip}
          emptyTitle={t('requests.noMatchTitle')}
          emptySubtitle={t('requests.noMatchSubtitle')}
        />
      </div>
    </div>
  );
}
