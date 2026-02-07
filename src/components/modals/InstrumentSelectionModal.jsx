import React, { useEffect, useState } from 'react';
import { X, Search, Check, Wrench } from 'lucide-react';
import { getColorStyle } from '../../utils/helpers';

const InstrumentSelectionModal = ({ isOpen, onClose, instruments, selectedOverviewIds, onApply }) => {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(selectedOverviewIds || []);
  }, [isOpen, selectedOverviewIds]);

  if (!isOpen) return null;
  const sortedInstruments = [...instruments].filter(i => i.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const allIds = instruments.map((i) => i.id);
  const isAllSelected = selectedIds.length > 0 && selectedIds.length === allIds.length;

  const toggleInstrument = (id) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    ));
  };

  const handleApply = () => {
    if (selectedIds.length === 0) return;
    onApply(selectedIds);
  };

  return (
    <div className="fixed inset-0 bg-slate-100 z-50 flex flex-col">
      <div className="bg-white px-4 py-4 shadow-sm flex items-center gap-3 sticky top-0 z-10"><button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><X className="w-6 h-6 text-slate-600"/></button><h2 className="text-lg font-bold text-slate-800">Switch View</h2></div>
      <div className="px-4 py-2 bg-white border-b border-slate-100"><div className="bg-slate-100 rounded-xl flex items-center px-3 py-2"><Search className="w-5 h-5 text-slate-400 mr-2"/><input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="bg-transparent outline-none w-full text-sm" autoFocus/></div></div>
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
        <div className="grid grid-cols-2 gap-3">{sortedInstruments.map(inst => { const styles = getColorStyle(inst.color); const isSelected = selectedIds.includes(inst.id); return (<button key={inst.id} onClick={() => toggleInstrument(inst.id)} className={`bg-white p-4 rounded-2xl border transition text-left flex flex-col items-start ${isSelected ? `border-blue-500 ring-2 ring-blue-200` : 'border-slate-100'}`}><div className="w-full flex items-start justify-between"><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${styles.bg} relative`}><span className={`font-bold text-lg ${styles.text}`}>{inst.name[0]}</span>{inst.isUnderMaintenance && <div className="absolute -bottom-1 -right-1 bg-orange-500 p-1 rounded-full border border-white shadow-sm"><Wrench className="w-2.5 h-2.5 text-white"/></div>}</div><div className={`w-5 h-5 rounded-full border flex items-center justify-center mt-0.5 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>{isSelected && <Check className="w-3 h-3 text-white" />}</div></div><div className="font-bold text-slate-800 text-sm line-clamp-2">{inst.name}</div><div className="text-xs text-slate-400 mt-1 line-clamp-1">{inst.isUnderMaintenance ? 'Under Maintenance' : inst.location || 'No location'}</div></button>) })}</div>
      </div>
      <div className="bg-white border-t border-slate-200 p-4">
        <button onClick={handleApply} disabled={selectedIds.length === 0} className="w-full bg-[#00407a] text-white font-bold py-3 rounded-xl disabled:opacity-40">
          {selectedIds.length === 1 ? 'Open Instrument View' : `Show ${selectedIds.length} in Overview`}
        </button>
      </div>
    </div>
  );
};

export default InstrumentSelectionModal;
