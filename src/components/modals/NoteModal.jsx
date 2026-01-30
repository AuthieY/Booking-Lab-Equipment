import React, { useState } from 'react';

const NoteModal = ({ isOpen, onClose, instrument, userName, onSave }) => {
    const [msg, setMsg] = useState('');
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-2 text-slate-800">Report / Note</h3>
            <p className="text-xs text-slate-500 mb-4">Leave a note about <span className="font-bold text-indigo-600">{instrument.name}</span>.</p>
            <textarea autoFocus value={msg} onChange={e=>setMsg(e.target.value)} className="w-full h-32 border-2 border-slate-100 p-3 rounded-xl focus:border-indigo-500 outline-none text-sm resize-none mb-4" placeholder="e.g. Needs cleaning..."></textarea>
            <div className="flex gap-3"><button onClick={onClose} className="flex-1 py-3 text-slate-500 font-bold bg-slate-50 rounded-xl">Cancel</button><button onClick={()=>{onSave(msg); setMsg('');}} disabled={!msg.trim()} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl disabled:opacity-50">Submit</button></div>
        </div>
      </div>
    )
}

export default NoteModal;