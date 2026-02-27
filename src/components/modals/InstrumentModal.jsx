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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectedTheme = COLOR_PALETTE.find((c) => c.id === color) || COLOR_PALETTE[0];
  const visibleThemes = themeFilter === 'all' ? COLOR_PALETTE : COLOR_PALETTE.filter((c) => c.type === themeFilter);

  const toggleConflict = (id) => {
    setSelectedConflicts(prev => prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]);
  };

  const handleSubmit = (e) => { 
    e.preventDefault(); 
    if (!name.trim()) return; 
    const subOptions = Array.from(new Set(subOptionsStr.split(/[,，\n]/).map(s => s.trim()).filter(s => s)));
    onSave({ name, location, maxCapacity: Number(capacity), color, subOptions, conflicts: selectedConflicts, isUnderMaintenance }); 
  };

  return (
    <div className="ds-overlay" role="presentation">
      <div className="ds-modal ds-modal-md ds-modal-liquid ds-section ds-animate-modal overflow-y-auto max-h-[90vh]" role="dialog" aria-modal="true" aria-labelledby="instrument-modal-title">
        <h3 id="instrument-modal-title" className="text-lg font-bold mb-4 text-slate-800">{initialData ? 'Edit instrument' : 'Add instrument'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <button
            type="button"
            role="switch"
            aria-checked={isUnderMaintenance}
            aria-label="Toggle maintenance mode"
            onClick={() => setIsUnderMaintenance(!isUnderMaintenance)}
            className={`w-full p-4 rounded-xl border cursor-pointer ds-transition flex items-center justify-between ds-glass-panel ${isUnderMaintenance ? 'border-orange-300/80 bg-orange-50/50' : 'border-white/50'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${isUnderMaintenance ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500'}`}><Wrench className="w-5 h-5"/></div>
              <div><div className="font-bold text-sm">Maintenance</div><div className="text-[10px] uppercase">Blocks bookings</div></div>
            </div>
            <div className={`w-10 h-5 rounded-full relative ${isUnderMaintenance ? 'bg-orange-500' : 'bg-slate-300'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isUnderMaintenance ? 'left-6' : 'left-1'}`} /></div>
          </button>

          <div>
            <label htmlFor="instrument-name" className="ds-field-label">Instrument name</label>
            <input id="instrument-name" autoFocus type="text" value={name} onChange={e=>setName(e.target.value)} className="ds-input mt-1 p-3"/>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="instrument-location" className="ds-field-label">Location</label>
              <input id="instrument-location" type="text" value={location} onChange={e=>setLocation(e.target.value)} className="ds-input mt-1 p-3"/>
            </div>
            <div>
              <label htmlFor="instrument-capacity" className="ds-field-label">Capacity</label>
              <input id="instrument-capacity" type="number" min="1" value={capacity} onChange={e=>setCapacity(e.target.value)} className="ds-input mt-1 p-3 font-data tabular-nums"/>
            </div>
          </div>

          <div>
            <label htmlFor="instrument-units" className="ds-field-label">Units (optional)</label>
            <textarea
              id="instrument-units"
              value={subOptionsStr}
              onChange={e => setSubOptionsStr(e.target.value)}
              rows={2}
              className="ds-input mt-1 p-3 resize-none"
              placeholder="e.g. Hydro MV, Dry Unit"
            />
            <div className="text-[11px] text-slate-500 mt-1">
              Store unit choices for bookings. Capacity and conflicts still apply to the instrument itself.
            </div>
          </div>

          <div>
            <label className="ds-field-label flex items-center gap-1 mb-2"><Link2 className="w-3 h-3"/> Conflict instruments</label>
            <div className="ds-card-muted ds-glass-panel p-3 max-h-32 overflow-y-auto space-y-1" role="group" aria-label="Conflict instruments">
              {existingInstruments.filter(i => i.id !== (initialData?.id)).map(inst => (
                <button key={inst.id} type="button" onClick={() => toggleConflict(inst.id)} aria-pressed={selectedConflicts.includes(inst.id)} className={`w-full flex items-center gap-2 p-2 rounded-lg cursor-pointer transition text-left ${selectedConflicts.includes(inst.id) ? 'bg-red-50 text-red-700 font-bold' : 'hover:bg-white text-slate-600'}`}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedConflicts.includes(inst.id) ? 'border-red-500 bg-red-500' : 'border-slate-300'}`}>{selectedConflicts.includes(inst.id) && <CheckCircle2 className="w-3 h-3 text-white"/>}</div>
                  <span className="text-xs">{inst.name}</span>
                </button>
              ))}
              {existingInstruments.filter(i => i.id !== (initialData?.id)).length === 0 && (
                <div className="text-xs text-slate-400">No other instruments available for conflicts.</div>
              )}
            </div>
          </div>

          <div>
            <label className="ds-field-label">Color theme</label>
            <div className="flex gap-2 mt-2" role="radiogroup" aria-label="Color theme filter">
              {[
                { id: 'all', label: 'All' },
                { id: 'solid', label: 'Solid' },
                { id: 'gradient', label: 'Gradient' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setThemeFilter(opt.id)}
                  aria-pressed={themeFilter === opt.id}
                  className={`px-2.5 py-1 ds-tab text-[10px] font-bold border ${themeFilter === opt.id ? 'ds-tab-active' : 'ds-tab-inactive'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="mt-2 p-2 ds-card-muted ds-glass-panel">
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
                  aria-pressed={color === c.id}
                  aria-label={`Select color theme ${c.label || c.id}`}
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
          <div className="flex gap-3 mt-4">
            <button type="button" onClick={onClose} className="flex-1 py-3 ds-btn ds-btn-secondary ds-btn-glass">Cancel</button>
            <button type="submit" className="flex-1 py-3 ds-btn ds-btn-primary text-white">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default InstrumentModal;
