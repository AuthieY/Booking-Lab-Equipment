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
        className={`ds-modal w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col ${launchSource === 'fab' ? 'ds-animate-overview-launch' : 'ds-animate-modal'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="instrument-selection-title"
      >
        <div className="px-3 md:px-4 py-2.5 border-b border-[var(--ds-rule-strong)] flex items-center gap-2">
          <button type="button" onClick={onClose} aria-label="Close instrument selection" className="ds-icon-btn-glass">
            <X className="w-5 h-5" />
          </button>
          <h2 id="instrument-selection-title" className="text-[15px] font-bold text-[color:var(--ds-text-strong)]">Select instruments</h2>
          <span className="ml-auto text-[11px] font-semibold text-[color:var(--ds-text-muted)] font-data tabular-nums">
            {isLoading ? 'Loading...' : `${selectedIds.length} selected`}
          </span>
        </div>

        <div className="px-3 md:px-4 py-2 border-b border-[var(--ds-rule)]">
          <label htmlFor="instrument-search" className="sr-only">Search instruments</label>
          <div className="ds-input flex items-center px-2.5 py-1.5">
            <Search className="w-4 h-4 text-[color:var(--ds-text-soft)] mr-2 shrink-0" />
            <input
              id="instrument-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search instruments..."
              inputMode="search"
              className="bg-transparent outline-none w-full text-base md:text-sm text-[color:var(--ds-text)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 md:px-4 py-3">
          <div className="sr-only" aria-live="polite">
            {isLoading ? 'Loading instruments' : `${sortedInstruments.length} instruments shown, ${selectedIds.length} selected`}
          </div>

          {isLoading && (
            <div className="ds-card overflow-hidden divide-y divide-[var(--ds-rule)]">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={`instrument-skeleton-${index}`} className="flex items-center gap-3 px-3 md:px-4 py-3 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-[var(--ds-rule-strong)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="h-3.5 bg-[var(--ds-surface-muted)] rounded-[2px] w-3/5 mb-1.5" />
                    <div className="h-3 bg-[var(--ds-surface-muted)] rounded-[2px] w-2/5" />
                  </div>
                  <div className="w-4 h-4 rounded-[2px] border border-[var(--ds-rule)] shrink-0" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && sortedInstruments.length > 0 && (
            <div className="ds-card overflow-hidden divide-y divide-[var(--ds-rule)]">
              {sortedInstruments.map((inst) => {
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
                    className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 text-left cursor-pointer ds-transition ${
                      isSelected ? 'ds-glass-choice-active' : 'ds-glass-choice'
                    }`}
                  >
                    <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0 ring-1 ring-[var(--ds-rule-strong)]" style={{ backgroundColor: styles.accent }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold leading-tight text-[color:var(--ds-text-strong)] truncate">
                        {inst.name}
                      </div>
                      <div className="text-[11px] text-[color:var(--ds-text-soft)] truncate">
                        {inst.location || 'No location'}
                      </div>
                      {inst.isUnderMaintenance && (
                        <div className="ds-microcaps text-[color:var(--ds-warning-text)] mt-0.5 inline-flex items-center gap-1">
                          <Wrench className="w-2.5 h-2.5" />
                          Under maintenance
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-data tabular-nums text-[color:var(--ds-text-soft)] shrink-0">
                      × {inst.maxCapacity || 1}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin?.(inst.id);
                      }}
                      aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${inst.name}`}
                      aria-pressed={isPinned}
                      className={`p-1 rounded-[4px] shrink-0 ${isPinned ? 'text-[color:var(--ds-brand-700)] bg-[var(--ds-brand-100)]' : 'text-[color:var(--ds-text-soft)] hover:text-[color:var(--ds-text-muted)]'}`}
                      title={isPinned ? 'Unpin' : 'Pin to top'}
                    >
                      <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
                    </button>
                    <div className={`w-4 h-4 rounded-[2px] border flex items-center justify-center shrink-0 ${isSelected ? 'bg-[var(--ds-brand-700)] border-[var(--ds-brand-700)]' : 'border-[var(--ds-rule-strong)]'}`}>
                      {isSelected && <Check className="w-3 h-3 text-[color:var(--ds-surface)]" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isLoading && sortedInstruments.length === 0 && (
            <div className="ds-card-muted p-4 text-center">
              <div className="text-[13px] font-semibold text-[color:var(--ds-text)]">No instruments found</div>
              <div className="text-[11px] text-[color:var(--ds-text-muted)] mt-1">Try another name or clear the search.</div>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--ds-rule)] p-3 md:p-4">
          <button
            type="button"
            onClick={handleApply}
            disabled={isLoading}
            className={`w-full py-2.5 ds-btn ${selectedIds.length === 0 ? 'ds-btn-secondary' : 'ds-btn-primary'}`}
          >
            {isLoading ? 'Loading instruments...' : selectedIds.length === 0 ? 'Clear selection' : selectedIds.length === 1 ? 'Open instrument calendar' : `Show ${selectedIds.length} in overview`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstrumentSelectionModal;
