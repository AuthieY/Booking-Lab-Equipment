import React, { useState } from 'react';
import { X, Search, LayoutGrid, Wrench } from 'lucide-react';
import { getColorStyle } from '../../utils/helpers';

const InstrumentSelectionModal = ({ isOpen, onClose, instruments, onSelect, currentId }) => {
  const [search, setSearch] = useState('');
  if (!isOpen) return null;
  const sortedInstruments = [...instruments].filter(i => i.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="fixed inset-0 bg-slate-100 z-50 flex flex-col">
      <div className="bg-white px-4 py-4 shadow-sm flex items-center gap-3 sticky top-0 z-10"><button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><X className="w-6 h-6 text-slate-600"/></button><h2 className="text-lg font-bold text-slate-800">Switch View</h2></div>
      <div className="px-4 py-2 bg-white border-b border-slate-100"><div className="bg-slate-100 rounded-xl flex items-center px-3 py-2"><Search className="w-5 h-5 text-slate-400 mr-2"/><input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="bg-transparent outline-none w-full text-sm" autoFocus/></div></div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <button onClick={() => onSelect(null)} className={`w-full bg-indigo-600 p-4 rounded-2xl shadow-md flex items-center gap-4 text-white ${currentId === null ? 'ring-4 ring-offset-2 ring-indigo-300' : ''}`}><div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center"><LayoutGrid className="w-6 h-6 text-white"/></div><div className="text-left"><div className="font-bold">Show All (Overview)</div><div className="text-xs text-indigo-200">Matrix Scheduler View</div></div></button>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-4 mb-2">Individual Instruments</div>
        <div className="grid grid-cols-2 gap-3">{sortedInstruments.map(inst => { const styles = getColorStyle(inst.color); const isSelected = currentId === inst.id; return (<button key={inst.id} onClick={() => onSelect(inst.id)} className={`bg-white p-4 rounded-2xl border transition text-left flex flex-col items-start ${isSelected ? `border-blue-500 ring-2 ring-blue-200` : 'border-slate-100'}`}><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${styles.bg} relative`}><span className={`font-bold text-lg ${styles.text}`}>{inst.name[0]}</span>{inst.isUnderMaintenance && <div className="absolute -bottom-1 -right-1 bg-orange-500 p-1 rounded-full border border-white shadow-sm"><Wrench className="w-2.5 h-2.5 text-white"/></div>}</div><div className="font-bold text-slate-800 text-sm line-clamp-2">{inst.name}</div><div className="text-xs text-slate-400 mt-1 line-clamp-1">{inst.isUnderMaintenance ? 'Under Maintenance' : inst.location || 'No location'}</div></button>) })}</div>
      </div>
    </div>
  );
};

export default InstrumentSelectionModal;