import React, { useEffect, useState } from 'react';

const NoteModal = ({ isOpen, onClose, instrument, userName, onSave }) => {
    const [msg, setMsg] = useState('');
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
        <div className="ds-modal ds-modal-sm ds-section ds-animate-modal" role="dialog" aria-modal="true" aria-labelledby="note-modal-title">
            <h3 id="note-modal-title" className="text-lg font-bold mb-2 text-slate-800">Report issue</h3>
            <p className="text-xs text-slate-500 mb-4">Leave a message about <span className="font-bold text-[var(--ds-brand-700)]">{instrument.name}</span>.</p>
            <label htmlFor="note-message" className="ds-field-label">Message</label>
            <textarea id="note-message" autoFocus value={msg} onChange={e=>setMsg(e.target.value)} className="ds-input h-32 p-3 text-sm resize-none mb-4 mt-1" placeholder="e.g. Needs cleaning..." />
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 py-3 ds-btn ds-btn-secondary">Cancel</button>
              <button type="button" onClick={()=>{onSave(msg); setMsg('');}} disabled={!msg.trim()} className="flex-1 py-3 ds-btn ds-btn-primary text-white">Send report</button>
            </div>
        </div>
      </div>
    )
}

export default NoteModal;
