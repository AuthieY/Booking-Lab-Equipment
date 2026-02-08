import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Check, Wrench, Pin } from 'lucide-react';
import { getColorStyle } from '../../utils/helpers';

const InstrumentSelectionModal = ({
  isOpen,
  onClose,
  instruments,
  isLoading = false,
  selectedOverviewIds,
  pinnedInstrumentIds = [],
  onTogglePin,
  onApply
}) => {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(selectedOverviewIds || []);
  }, [isOpen, selectedOverviewIds]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const pinnedSet = useMemo(() => new Set(pinnedInstrumentIds), [pinnedInstrumentIds]);

  if (!isOpen) return null;

  const sortedInstruments = [...instruments]
    .filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const ap = pinnedSet.has(a.id) ? 0 : 1;
      const bp = pinnedSet.has(b.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name);
    });

  const allIds = instruments.map((i) => i.id);
  const isAllSelected = selectedIds.length > 0 && selectedIds.length === allIds.length;

  const toggleInstrument = (id) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    ));
  };

  const handleApply = () => {
    onApply(selectedIds);
  };

  const handleCardKeyDown = (event, callback) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      callback();
    }
  };

  return (
    <div className="fixed inset-0 ds-page z-[80] flex flex-col ds-animate-enter-fast" role="dialog" aria-modal="true" aria-labelledby="instrument-selection-title">
      <div className="bg-white px-4 py-4 flex items-center gap-3 sticky top-0 z-10 border-b border-[var(--ds-border)]">
        <button type="button" onClick={onClose} aria-label="Close switch view" className="p-2 rounded-full hover:bg-slate-100">
          <X className="w-6 h-6 text-slate-600"/>
        </button>
        <h2 id="instrument-selection-title" className="text-lg font-bold text-slate-800">Select instruments</h2>
      </div>
      <div className="px-4 py-2 bg-white border-b border-slate-100">
        <label htmlFor="instrument-search" className="sr-only">Search instruments</label>
        <div className="ds-input flex items-center px-3 py-2">
          <Search className="w-5 h-5 text-slate-400 mr-2"/>
          <input
            id="instrument-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search instruments..."
            inputMode="search"
            className="bg-transparent outline-none w-full text-base md:text-sm"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <button
          type="button"
          onClick={() => setSelectedIds(isAllSelected ? [] : allIds)}
          disabled={isLoading || allIds.length === 0}
          aria-pressed={isAllSelected}
          aria-label={isAllSelected ? 'Clear all selected instruments' : 'Select all instruments'}
          className={`w-full p-4 rounded-2xl border flex items-center justify-between text-left ds-transition disabled:opacity-50 disabled:cursor-not-allowed ${isAllSelected ? 'bg-[var(--ds-brand-700)] text-white border-[var(--ds-brand-700)]' : 'ds-card text-slate-700 border-slate-200'}`}
        >
          <div>
            <div className="font-bold">Select all instruments</div>
            <div className={`text-xs ${isAllSelected ? 'text-[#cfeafb]' : 'text-slate-500'}`}>
              {isLoading ? 'Loading instruments...' : 'Use full overview matrix'}
            </div>
          </div>
          <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${isAllSelected ? 'bg-white border-white' : 'border-slate-300'}`}>
            {isAllSelected && <Check className="w-4 h-4 text-[#00407a]" />}
          </div>
        </button>
        <div className="sr-only" aria-live="polite">
          {isLoading ? 'Loading instruments' : `${sortedInstruments.length} instruments shown, ${selectedIds.length} selected`}
        </div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-4 mb-2">Instruments</div>
        <div className="grid grid-cols-2 gap-3">
          {isLoading && Array.from({ length: 6 }, (_, index) => (
            <div key={`instrument-skeleton-${index}`} className="p-4 rounded-2xl border ds-card animate-pulse">
              <div className="w-full flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-slate-200 mb-3" />
                <div className="w-5 h-5 rounded-full border border-slate-200" />
              </div>
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
          {!isLoading && sortedInstruments.map((inst) => {
            const styles = getColorStyle(inst.color);
            const isSelected = selectedIds.includes(inst.id);
            const isPinned = pinnedSet.has(inst.id);
            return (
              <div
                key={inst.id}
                onClick={() => toggleInstrument(inst.id)}
                onKeyDown={(event) => handleCardKeyDown(event, () => toggleInstrument(inst.id))}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`${isSelected ? 'Deselect' : 'Select'} ${inst.name}${isPinned ? ', pinned' : ''}${inst.isUnderMaintenance ? ', under maintenance' : ''}`}
                className={`p-4 rounded-2xl border text-left flex flex-col items-start cursor-pointer ds-transition ${isSelected ? 'border-[var(--ds-brand-300)] ring-2 ring-[#cdeefe] bg-white' : 'ds-card'}`}
              >
                <div className="w-full flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${styles.bg} relative`}>
                    <span className={`font-bold text-lg ${styles.text}`}>{inst.name[0]}</span>
                    {inst.isUnderMaintenance && (
                      <div className="absolute -bottom-1 -right-1 bg-orange-500 p-1 rounded-full border border-white shadow-sm">
                        <Wrench className="w-2.5 h-2.5 text-white"/>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin?.(inst.id);
                      }}
                      aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${inst.name}`}
                      aria-pressed={isPinned}
                      className={`p-1 rounded-md ${isPinned ? 'text-[#00407a] bg-[#e6f3fb]' : 'text-slate-300 hover:text-slate-500'}`}
                      title={isPinned ? 'Unpin' : 'Pin to top'}
                    >
                      <Pin className={`w-4 h-4 ${isPinned ? 'fill-current' : ''}`}/>
                    </button>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center mt-0.5 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                </div>
                <div className="font-bold text-slate-800 text-sm line-clamp-2">{inst.name}</div>
                <div className="text-xs text-slate-400 mt-1 line-clamp-1">{inst.isUnderMaintenance ? 'Under maintenance' : inst.location || 'No location'}</div>
                {isPinned && <div className="text-[10px] mt-2 px-1.5 py-0.5 rounded bg-[#e6f3fb] text-[#00407a] font-bold">Pinned</div>}
              </div>
            );
          })}
          {!isLoading && sortedInstruments.length === 0 && (
            <div className="col-span-2 ds-card p-4 text-center">
              <div className="text-sm font-bold text-slate-600">No instruments found</div>
              <div className="text-xs text-slate-400 mt-1">Try another name or clear the search.</div>
            </div>
          )}
        </div>
      </div>
      <div className="bg-white border-t border-slate-200 p-4">
        <button
          type="button"
          onClick={handleApply}
          disabled={isLoading}
          className={`w-full py-3 ds-btn disabled:opacity-50 ${selectedIds.length === 0 ? 'bg-slate-400 text-white' : 'ds-btn-primary text-white'}`}
        >
          {isLoading ? 'Loading instruments...' : selectedIds.length === 0 ? 'Clear selection' : selectedIds.length === 1 ? 'Open instrument calendar' : `Show ${selectedIds.length} in overview`}
        </button>
      </div>
    </div>
  );
};

export default InstrumentSelectionModal;
