import React, { useEffect, useMemo, useState } from 'react';

const NoteModal = ({ isOpen, onClose, instruments = [], initialInstrumentId = null, onSave }) => {
    const [msg, setMsg] = useState('');
    const [selectedInstrumentId, setSelectedInstrumentId] = useState('');
    const sortedInstruments = useMemo(
      () => [...instruments].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })),
      [instruments]
    );

    const selectedInstrument = useMemo(
      () => instruments.find((inst) => inst.id === selectedInstrumentId) || null,
      [instruments, selectedInstrumentId]
    );

    useEffect(() => {
      if (!isOpen) {
        setMsg('');
        setSelectedInstrumentId('');
        return;
      }
      setSelectedInstrumentId(initialInstrumentId || '');
    }, [isOpen, initialInstrumentId]);

    useEffect(() => {
      if (!isOpen) return;
      const handleKeyDown = (event) => {
        if (event.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);
    if (!isOpen) return null;
    return (
      <div className="ds-overlay" role="presentation">
        <div className="ds-modal ds-modal-sm ds-modal-liquid ds-section ds-animate-modal" role="dialog" aria-modal="true" aria-labelledby="note-modal-title">
            <h3 id="note-modal-title" className="text-lg font-bold mb-2 text-slate-800">Report issue</h3>
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-1.5">Leave a message about</p>
              <select
                aria-label="Select instrument for issue report"
                value={selectedInstrumentId}
                onChange={(e) => setSelectedInstrumentId(e.target.value)}
                className="ds-input ds-glass-panel px-3 py-2 text-base font-semibold text-[var(--ds-brand-700)]"
              >
                <option value="">Select instrument</option>
                {sortedInstruments.map((inst) => (
                  <option key={inst.id} value={inst.id}>{inst.name}</option>
                ))}
              </select>
            </div>
            <label htmlFor="note-message" className="ds-field-label">Message</label>
            <textarea id="note-message" value={msg} onChange={e=>setMsg(e.target.value)} className="ds-input ds-glass-panel h-32 p-3 text-base resize-none mb-4 mt-1" placeholder="e.g. Needs cleaning..." />
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 py-3 ds-btn ds-btn-secondary ds-btn-glass">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  onSave({ message: msg, instrumentId: selectedInstrument?.id || '' });
                  setMsg('');
                }}
                disabled={!msg.trim() || !selectedInstrumentId}
                className="flex-1 py-3 ds-btn ds-btn-primary text-white"
              >
                Send report
              </button>
            </div>
        </div>
      </div>
    )
}

export default NoteModal;
