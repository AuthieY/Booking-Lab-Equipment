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
  onApply,
  launchSource = 'default'
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
    <div className="ds-overlay z-[95]" role="presentation">
      <div
        className={`ds-modal ds-modal-liquid w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col ${launchSource === 'fab' ? 'ds-animate-overview-launch' : 'ds-animate-modal'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="instrument-selection-title"
      >
        <div className="px-3 md:px-4 py-2.5 border-b border-[var(--ds-border)] flex items-center gap-2 bg-white/50">
          <button type="button" onClick={onClose} aria-label="Close instrument selection" className="ds-icon-btn-glass text-slate-600 hover:text-slate-800">
            <X className="w-5 h-5" />
          </button>
          <h2 id="instrument-selection-title" className="text-base md:text-lg font-bold text-slate-800">Select instruments</h2>
          <span className="ml-auto text-[11px] font-semibold text-slate-500 font-data tabular-nums">
            {isLoading ? 'Loading...' : `${selectedIds.length} selected`}
          </span>
        </div>

        <div className="px-3 md:px-4 py-2 border-b border-slate-200/70 bg-white/40">
          <label htmlFor="instrument-search" className="sr-only">Search instruments</label>
          <div className="ds-input ds-glass-panel flex items-center px-2.5 py-1.5 rounded-xl">
            <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
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

        <div className="flex-1 overflow-y-auto px-3 md:px-4 py-2 space-y-2">
          <div className="sr-only" aria-live="polite">
            {isLoading ? 'Loading instruments' : `${sortedInstruments.length} instruments shown, ${selectedIds.length} selected`}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {isLoading && Array.from({ length: 6 }, (_, index) => (
              <div key={`instrument-skeleton-${index}`} className="p-2.5 rounded-xl border ds-glass-panel animate-pulse">
                <div className="w-full flex items-center justify-end mb-1.5">
                  <div className="w-4 h-4 rounded-full border border-slate-200" />
                </div>
                <div className="h-3.5 bg-slate-200 rounded w-4/5 mb-1" />
                <div className="h-3 bg-slate-100 rounded w-2/5" />
              </div>
            ))}
            {!isLoading && sortedInstruments.map((inst) => {
              const isSelected = selectedIds.includes(inst.id);
              const isPinned = pinnedSet.has(inst.id);
              const styles = getColorStyle(inst.color);
              return (
                <div
                  key={inst.id}
                  onClick={() => toggleInstrument(inst.id)}
                  onKeyDown={(event) => handleCardKeyDown(event, () => toggleInstrument(inst.id))}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? 'Deselect' : 'Select'} ${inst.name}${isPinned ? ', pinned' : ''}${inst.isUnderMaintenance ? ', under maintenance' : ''}`}
                  className={`p-2.5 rounded-xl border text-left flex flex-col items-start cursor-pointer ds-transition min-h-[7.15rem] ${isSelected ? 'border-[var(--ds-brand-300)] ring-2 ring-[#cdeefe] bg-white/80' : 'ds-glass-panel border-white/50'}`}
                >
                  <div className="w-full flex items-center justify-end mb-1">
                    <div className="flex items-center gap-1.5">
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
                        <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
                      </button>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  </div>
                  <div className="w-full">
                    <div className={`font-bold text-[13px] leading-tight line-clamp-2 ${styles.text}`}>
                      {inst.name}
                    </div>
                    <div className="text-[11px] font-data tabular-nums font-semibold text-slate-400 mt-0.5 line-clamp-1">
                      {inst.location || 'No location'}
                    </div>
                  </div>
                  {inst.isUnderMaintenance && (
                    <div className="text-[10px] text-orange-600 mt-0.5 inline-flex items-center gap-1">
                      <Wrench className="w-2.5 h-2.5" />
                      Under maintenance
                    </div>
                  )}
                </div>
              );
            })}
            {!isLoading && sortedInstruments.length === 0 && (
              <div className="col-span-2 md:col-span-3 ds-glass-panel p-4 rounded-xl text-center">
                <div className="text-sm font-bold text-slate-600">No instruments found</div>
                <div className="text-xs text-slate-400 mt-1">Try another name or clear the search.</div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200/70 p-3 md:p-4 bg-white/45">
          <button
            type="button"
            onClick={handleApply}
            disabled={isLoading}
            className={`w-full py-2.5 ds-btn disabled:opacity-50 ${selectedIds.length === 0 ? 'bg-slate-400 text-white' : 'ds-btn-primary text-white'}`}
          >
            {isLoading ? 'Loading instruments...' : selectedIds.length === 0 ? 'Clear selection' : selectedIds.length === 1 ? 'Open instrument calendar' : `Show ${selectedIds.length} in overview`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstrumentSelectionModal;
