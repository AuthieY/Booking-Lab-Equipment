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
      <div className="ds-modal ds-modal-md ds-section ds-animate-modal overflow-y-auto max-h-[90vh]" role="dialog" aria-modal="true" aria-labelledby="instrument-modal-title">
        <h3 id="instrument-modal-title" className="text-[15px] font-bold mb-4 text-[color:var(--ds-text-strong)]">{initialData ? 'Edit instrument' : 'Add instrument'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <button
            type="button"
            role="switch"
            aria-checked={isUnderMaintenance}
            aria-label="Toggle maintenance mode"
            onClick={() => setIsUnderMaintenance(!isUnderMaintenance)}
            className="ds-card-muted w-full p-4 cursor-pointer ds-transition flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-[4px] border ${isUnderMaintenance ? 'bg-[var(--ds-warning-bg)] border-[var(--ds-warning-line)] text-[color:var(--ds-warning-text)]' : 'bg-[var(--ds-surface)] border-[var(--ds-rule-strong)] text-[color:var(--ds-text-soft)]'}`}><Wrench className="w-5 h-5"/></div>
              <div>
                <div className="text-[13px] font-semibold text-[color:var(--ds-text-strong)]">Maintenance</div>
                <div className="ds-microcaps text-[color:var(--ds-text-muted)]">Blocks bookings</div>
              </div>
            </div>
            <div className={`w-10 h-5 rounded-[2px] relative shrink-0 ${isUnderMaintenance ? 'bg-[var(--ds-warning-text)]' : 'bg-[var(--ds-rule-strong)]'}`}><div className={`absolute top-1 w-3 h-3 bg-[var(--ds-surface)] rounded-[1px] transition-all ${isUnderMaintenance ? 'left-6' : 'left-1'}`} /></div>
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
            <div className="text-[11px] text-[color:var(--ds-text-muted)] mt-1">
              Store unit choices for bookings. Capacity and conflicts still apply to the instrument itself.
            </div>
          </div>

          <div>
            <label className="ds-field-label flex items-center gap-1 mb-2"><Link2 className="w-3 h-3"/> Conflict instruments</label>
            <div className="ds-card-muted p-3 max-h-32 overflow-y-auto space-y-1" role="group" aria-label="Conflict instruments">
              {existingInstruments.filter(i => i.id !== (initialData?.id)).map(inst => (
                <button key={inst.id} type="button" onClick={() => toggleConflict(inst.id)} aria-pressed={selectedConflicts.includes(inst.id)} className={`w-full flex items-center gap-2 p-2 rounded-[4px] cursor-pointer ds-transition text-left ${selectedConflicts.includes(inst.id) ? 'bg-[var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] font-semibold' : 'hover:bg-[var(--ds-surface)] text-[color:var(--ds-text-muted)]'}`}>
                  <div className={`w-4 h-4 rounded-[2px] border flex items-center justify-center ${selectedConflicts.includes(inst.id) ? 'border-[var(--ds-danger-text)] bg-[var(--ds-danger-text)]' : 'border-[var(--ds-rule-strong)]'}`}>{selectedConflicts.includes(inst.id) && <CheckCircle2 className="w-3 h-3 text-[color:var(--ds-surface)]"/>}</div>
                  <span className="text-xs">{inst.name}</span>
                </button>
              ))}
              {existingInstruments.filter(i => i.id !== (initialData?.id)).length === 0 && (
                <div className="text-[11px] text-[color:var(--ds-text-muted)]">No other instruments available for conflicts.</div>
              )}
            </div>
          </div>

          <div>
            <label className="ds-field-label">Color theme</label>
            <div className="flex gap-4 mt-2 border-b border-[var(--ds-rule)]" role="radiogroup" aria-label="Color theme filter">
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
                  className={`ds-tab px-1 pb-1.5 text-[11px] font-semibold ${themeFilter === opt.id ? 'ds-tab-active' : 'ds-tab-inactive'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="mt-2 p-2 ds-card-muted">
              <div className="ds-microcaps text-[color:var(--ds-text-muted)] mb-1">Preview</div>
              <div className="h-10 rounded-[4px] px-3 flex items-center text-white font-bold text-sm" style={{ background: selectedTheme.accent }}>
                {selectedTheme.label}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3 max-h-48 overflow-y-auto pr-1">
              {visibleThemes.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  aria-pressed={color === c.id}
                  aria-label={`Select color theme ${c.label || c.id}`}
                  className={`h-6 w-6 rounded-[2px] flex items-center justify-center ${color === c.id ? 'ring-2 ring-[var(--ds-text-strong)] ring-offset-1 ring-offset-[var(--ds-surface)]' : 'ring-1 ring-[var(--ds-rule-strong)]'}`}
                  style={{ background: c.accent }}
                  title={c.label || c.id}
                >
                  {color === c.id && <CheckCircle2 className="w-3.5 h-3.5 text-white"/>}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-[color:var(--ds-text-muted)] mt-2">Selected: {selectedTheme.label || color}</div>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="button" onClick={onClose} className="flex-1 py-3 ds-btn ds-btn-secondary">Cancel</button>
            <button type="submit" className="flex-1 py-3 ds-btn ds-btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default InstrumentModal;
