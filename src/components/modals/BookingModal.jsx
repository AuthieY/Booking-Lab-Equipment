import React, { useState, useEffect } from 'react';
import { X, Sun, Moon, Repeat, Loader2, Beaker } from 'lucide-react';
import { getColorStyle } from '../../utils/helpers';

const BookingModal = ({ isOpen, onClose, initialDate, initialHour, instrument, onConfirm, isBooking }) => {
  const [repeatOption, setRepeatOption] = useState(0); 
  const [isFullDay, setIsFullDay] = useState(false); 
  const [isOvernight, setIsOvernight] = useState(false); 
  const [quantity, setQuantity] = useState(1);

  const styles = getColorStyle(instrument?.color || 'blue');
  const maxCap = instrument?.maxCapacity || 1;

  useEffect(() => { 
    if (isOpen) {
      setQuantity(1); setRepeatOption(0); setIsFullDay(false); setIsOvernight(false);
    }
  }, [instrument, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800">Booking Details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6"/></button>
        </div>
        
        <div className="space-y-4">
          <div className={`${styles.bg} p-4 rounded-xl border-l-4 ${styles.border.replace('border', 'border-l')}`}>
            <div className="text-lg font-bold ${styles.text}">{instrument?.name}</div>
            <div className="text-xs text-slate-500">Capacity: {maxCap} units</div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl text-sm font-bold text-slate-600">
            {initialDate} at {isFullDay ? 'Full Day' : isOvernight ? '17:00-09:00' : `${initialHour}:00`}
          </div>

          {maxCap > 1 && (
            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
              <label className="text-xs font-bold text-indigo-600 uppercase flex items-center gap-1 mb-2"><Beaker className="w-3 h-3"/> Samples (Max {maxCap})</label>
              <input type="number" min="1" max={maxCap} value={quantity} onChange={e=>setQuantity(Math.min(maxCap, Math.max(1, Number(e.target.value))))} className="w-full p-2 rounded-lg border-2 border-indigo-200 outline-none font-bold text-indigo-700"/>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={()=>{setIsFullDay(!isFullDay); setIsOvernight(false)}} className={`p-3 rounded-xl border-2 text-xs font-bold flex items-center gap-2 transition ${isFullDay ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500'}`}><Sun className="w-4 h-4"/> Full Day</button>
            <button type="button" onClick={()=>{setIsOvernight(!isOvernight); setIsFullDay(false)}} className={`p-3 rounded-xl border-2 text-xs font-bold flex items-center gap-2 transition ${isOvernight ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-100 text-slate-500'}`}><Moon className="w-4 h-4"/> Overnight</button>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl">
            <div className="flex items-center gap-2 text-slate-600 mb-3"><Repeat className="w-4 h-4"/><span className="font-bold text-xs uppercase">Repeat Booking</span></div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map(opt => (
                <button key={opt} type="button" onClick={() => setRepeatOption(opt)} className={`py-2 rounded-lg text-[10px] font-bold transition ${repeatOption === opt ? styles.darkBg + ' text-white' : 'bg-white border border-slate-200 text-slate-400'}`}>
                  {opt === 0 ? 'Once' : `${opt + 1} Wks`}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => onConfirm(repeatOption, isFullDay, null, isOvernight, quantity)} disabled={isBooking} className={`w-full py-4 text-white font-bold rounded-xl shadow-lg transition-all ${styles.darkBg} disabled:opacity-50`}>
            {isBooking ? <Loader2 className="animate-spin w-5 h-5 mx-auto"/> : "Confirm Booking"}
          </button>
        </div>
      </div>
    </div>
  );
};
export default BookingModal;