import React, { useState, useEffect } from 'react';
import { Wrench, CheckCircle2, Link2 } from 'lucide-react';
import { COLOR_PALETTE } from '../../utils/helpers';

const InstrumentModal = ({ isOpen, onClose, onSave, initialData, existingInstruments = [] }) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState(1);
  const [subOptionsStr, setSubOptionsStr] = useState('');
  const [color, setColor] = useState('blue');
  const [themeFilter, setThemeFilter] = useState('all');
  const [selectedConflicts, setSelectedConflicts] = useState([]);
  const [isUnderMaintenance, setIsUnderMaintenance] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setLocation(initialData.location || '');
      setCapacity(initialData.maxCapacity || 1);
      setSubOptionsStr(initialData.subOptions ? initialData.subOptions.join(', ') : '');
      setColor(initialData.color || 'blue');
      setSelectedConflicts(initialData.conflicts || []);
      setIsUnderMaintenance(initialData.isUnderMaintenance || false);
    } else {
      setName(''); setLocation(''); setCapacity(1); setSubOptionsStr(''); setColor('blue'); setSelectedConflicts([]);
      setIsUnderMaintenance(false);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const selectedTheme = COLOR_PALETTE.find((c) => c.id === color) || COLOR_PALETTE[0];
  const visibleThemes = themeFilter === 'all' ? COLOR_PALETTE : COLOR_PALETTE.filter((c) => c.type === themeFilter);

  const toggleConflict = (id) => {
    setSelectedConflicts(prev => prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]);
  };

  const handleSubmit = (e) => { 
    e.preventDefault(); 
    if (!name.trim()) return; 
    const subOptions = subOptionsStr.split(/[,，\n]/).map(s => s.trim()).filter(s => s);
    onSave({ name, location, maxCapacity: Number(capacity), color, subOptions, conflicts: selectedConflicts, isUnderMaintenance }); 
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <h3 className="text-lg font-bold mb-4 text-slate-800">{initialData ? 'Edit Device' : 'Add New Device'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div onClick={() => setIsUnderMaintenance(!isUnderMaintenance)} className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${isUnderMaintenance ? 'border-orange-500 bg-orange-50' : 'border-slate-100 bg-slate-50'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${isUnderMaintenance ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500'}`}><Wrench className="w-5 h-5"/></div>
              <div><div className="font-bold text-sm">Maintenance</div><div className="text-[10px] uppercase">Blocks Bookings</div></div>
            </div>
            <div className={`w-10 h-5 rounded-full relative ${isUnderMaintenance ? 'bg-orange-500' : 'bg-slate-300'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isUnderMaintenance ? 'left-6' : 'left-1'}`} /></div>
          </div>

          <div><label className="text-xs font-bold text-slate-400 uppercase">Device Name</label><input autoFocus type="text" value={name} onChange={e=>setName(e.target.value)} className="w-full border-2 border-slate-100 p-3 rounded-xl focus:border-slate-800 outline-none"/></div>
          
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-bold text-slate-400 uppercase">Location</label><input type="text" value={location} onChange={e=>setLocation(e.target.value)} className="w-full border-2 border-slate-100 p-3 rounded-xl outline-none"/></div>
            <div><label className="text-xs font-bold text-slate-400 uppercase">Capacity</label><input type="number" min="1" value={capacity} onChange={e=>setCapacity(e.target.value)} className="w-full border-2 border-slate-100 p-3 rounded-xl outline-none"/></div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1 mb-2"><Link2 className="w-3 h-3"/> Conflict Devices</label>
            <div className="bg-slate-50 border-2 border-slate-100 rounded-xl p-3 max-h-32 overflow-y-auto space-y-1">
              {existingInstruments.filter(i => i.id !== (initialData?.id)).map(inst => (
                <div key={inst.id} onClick={() => toggleConflict(inst.id)} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition ${selectedConflicts.includes(inst.id) ? 'bg-red-50 text-red-700 font-bold' : 'hover:bg-white text-slate-600'}`}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedConflicts.includes(inst.id) ? 'border-red-500 bg-red-500' : 'border-slate-300'}`}>{selectedConflicts.includes(inst.id) && <CheckCircle2 className="w-3 h-3 text-white"/>}</div>
                  <span className="text-xs">{inst.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Color Theme</label>
            <div className="flex gap-2 mt-2">
              {[
                { id: 'all', label: 'All' },
                { id: 'solid', label: 'Solid' },
                { id: 'gradient', label: 'Gradient' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setThemeFilter(opt.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${themeFilter === opt.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="mt-2 p-2 rounded-xl border border-slate-200 bg-slate-50">
              <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Preview</div>
              <div className={`h-10 rounded-lg px-3 flex items-center text-white font-bold text-sm ${selectedTheme.darkBg}`}>
                {selectedTheme.label}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2 max-h-48 overflow-y-auto pr-1">
              {visibleThemes.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  className={`p-1.5 rounded-xl cursor-pointer border transition ${color === c.id ? 'border-slate-500 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-300'}`}
                  title={c.label || c.id}
                >
                  <div className="w-full">
                    <div className={`h-8 rounded-md flex items-center justify-center ${c.darkBg}`}>
                      {color === c.id && <CheckCircle2 className="w-4 h-4 text-white"/>}
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1 truncate">{c.label}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">Selected: {selectedTheme.label || color}</div>
          </div>
          <div className="flex gap-3 mt-4"><button type="button" onClick={onClose} className="flex-1 py-3 text-slate-500 font-bold bg-slate-50 rounded-xl">Cancel</button><button type="submit" className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-xl">Save</button></div>
        </form>
      </div>
    </div>
  );
};
export default InstrumentModal;
