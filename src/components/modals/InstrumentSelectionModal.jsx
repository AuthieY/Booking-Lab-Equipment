import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Check, Wrench, Pin } from 'lucide-react';
import { getColorStyle } from '../../utils/helpers';

const InstrumentSelectionModal = ({
  isOpen,
  onClose,
  instruments,
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

  return (
    <div className="fixed inset-0 bg-slate-100 z-50 flex flex-col">
      <div className="bg-white px-4 py-4 shadow-sm flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100">
          <X className="w-6 h-6 text-slate-600"/>
        </button>
        <h2 className="text-lg font-bold text-slate-800">Switch View</h2>
      </div>
      <div className="px-4 py-2 bg-white border-b border-slate-100">
        <div className="bg-slate-100 rounded-xl flex items-center px-3 py-2">
          <Search className="w-5 h-5 text-slate-400 mr-2"/>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            inputMode="search"
            className="bg-transparent outline-none w-full text-base md:text-sm"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <button onClick={() => setSelectedIds(isAllSelected ? [] : allIds)} className={`w-full p-4 rounded-2xl shadow-sm border flex items-center justify-between text-left transition ${isAllSelected ? 'bg-[#00407a] text-white border-[#00407a]' : 'bg-white text-slate-700 border-slate-200'}`}>
          <div>
            <div className="font-bold">Select All Instruments</div>
            <div className={`text-xs ${isAllSelected ? 'text-[#cfeafb]' : 'text-slate-400'}`}>Use full overview matrix</div>
          </div>
          <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${isAllSelected ? 'bg-white border-white' : 'border-slate-300'}`}>
            {isAllSelected && <Check className="w-4 h-4 text-[#00407a]" />}
          </div>
        </button>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-4 mb-2">Instruments</div>
        <div className="grid grid-cols-2 gap-3">
          {sortedInstruments.map((inst) => {
            const styles = getColorStyle(inst.color);
            const isSelected = selectedIds.includes(inst.id);
            const isPinned = pinnedSet.has(inst.id);
            return (
              <div
                key={inst.id}
                onClick={() => toggleInstrument(inst.id)}
                className={`bg-white p-4 rounded-2xl border transition text-left flex flex-col items-start cursor-pointer ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-100'}`}
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
                <div className="text-xs text-slate-400 mt-1 line-clamp-1">{inst.isUnderMaintenance ? 'Under Maintenance' : inst.location || 'No location'}</div>
                {isPinned && <div className="text-[10px] mt-2 px-1.5 py-0.5 rounded bg-[#e6f3fb] text-[#00407a] font-bold">Pinned</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="bg-white border-t border-slate-200 p-4">
        <button onClick={handleApply} className={`w-full text-white font-bold py-3 rounded-xl ${selectedIds.length === 0 ? 'bg-slate-400' : 'bg-[#00407a]'}`}>
          {selectedIds.length === 0 ? 'Clear Selection' : selectedIds.length === 1 ? 'Open Instrument View' : `Show ${selectedIds.length} in Overview`}
        </button>
      </div>
    </div>
  );
};

export default InstrumentSelectionModal;
