import React, { useState, useEffect } from 'react';
import { X, Sun, Moon, Clock3, Repeat, Loader2, Beaker } from 'lucide-react';
import { getColorStyle } from '../../utils/helpers';

const BookingModal = ({ isOpen, onClose, initialDate, initialHour, instrument, onConfirm, isBooking, getConflictPreview }) => {
  const [repeatOption, setRepeatOption] = useState(0); 
  const [bookingMode, setBookingMode] = useState('hourly');
  const [quantity, setQuantity] = useState(1);
  const [conflictPreview, setConflictPreview] = useState({ count: 0, first: '' });

  const styles = getColorStyle(instrument?.color || 'blue');
  const maxCap = instrument?.maxCapacity || 1;
  const isFullDay = bookingMode === 'full_day';
  const isOvernight = bookingMode === 'overnight';
  const isWorkingHours = bookingMode === 'working_hours';
  const bookingModeOptions = [
    { id: 'hourly', label: 'Hourly', detail: `${initialHour}:00`, icon: Clock3 },
    { id: 'working_hours', label: 'Working Hours', detail: '09:00-17:00', icon: Clock3 },
    { id: 'full_day', label: 'Full Day', detail: '00:00-24:00', icon: Sun },
    { id: 'overnight', label: 'Overnight', detail: '17:00-09:00', icon: Moon }
  ];
  const selectedTimeLabel = isFullDay
    ? 'Full Day'
    : isOvernight
      ? '17:00-09:00'
      : isWorkingHours
        ? '09:00-17:00'
        : `${initialHour}:00`;

  useEffect(() => { 
    if (isOpen) {
      setQuantity(1);
      setRepeatOption(0);
      setBookingMode('hourly');
    }
  }, [instrument, isOpen]);

  useEffect(() => {
    if (!isOpen || !getConflictPreview) return;
    const preview = getConflictPreview({ repeatOption, isFullDay, isOvernight, isWorkingHours, quantity });
    setConflictPreview(preview || { count: 0, first: '' });
  }, [isOpen, repeatOption, bookingMode, quantity, getConflictPreview]);

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
      <div
        className="ds-modal ds-modal-sm ds-section overflow-y-auto max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 id="booking-modal-title" className="text-xl font-bold text-slate-800">Booking details</h3>
          <button type="button" onClick={onClose} aria-label="Close booking details" className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6"/></button>
        </div>
        
        <div className="space-y-4">
          <div className={`${styles.bg} p-4 rounded-xl border-l-4 ${styles.border.replace('border', 'border-l')}`}>
            <div className={`text-lg font-bold ${styles.text}`}>{instrument?.name}</div>
            <div className="text-xs text-slate-500">Capacity: {maxCap} unit{maxCap > 1 ? 's' : ''}</div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl text-sm font-bold text-slate-600 font-data tabular-nums tracking-tight">
            {initialDate} at {selectedTimeLabel}
          </div>

          {maxCap > 1 && (
            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
              <label htmlFor="booking-quantity" className="text-xs font-bold text-indigo-600 uppercase flex items-center gap-1 mb-2">
                <Beaker className="w-3 h-3"/> Quantity (max {maxCap})
              </label>
              {/* Keep 16px input text to prevent iOS auto-zoom on focus. */}
              <input 
                id="booking-quantity"
                type="number" 
                min="1" 
                max={maxCap} 
                value={quantity} 
                aria-describedby="booking-quantity-help"
                onChange={e=>setQuantity(Math.min(maxCap, Math.max(1, Number(e.target.value))))} 
                className="w-full p-3 rounded-lg border-2 border-indigo-200 outline-none font-medium text-base text-indigo-700 font-data tabular-nums"
              />
              <div id="booking-quantity-help" className="mt-1 text-[11px] text-indigo-600">
                Enter quantity between 1 and {maxCap}.
              </div>
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-xl">
            <div className="text-[11px] font-bold text-slate-600 uppercase mb-2 tracking-wide">Booking mode</div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Booking mode">
              {bookingModeOptions.map((mode) => {
                const Icon = mode.icon;
                const isActive = bookingMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setBookingMode(mode.id)}
                    className={`p-3 rounded-xl border text-left transition ${
                      isActive
                        ? 'border-[var(--ds-brand-300)] bg-[var(--ds-brand-100)] text-[var(--ds-brand-700)]'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-bold">{mode.label}</span>
                    </div>
                    <div className="mt-1 text-[11px] font-data tabular-nums text-slate-500">{mode.detail}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl">
            <div className="flex items-center gap-2 text-slate-600 mb-3"><Repeat className="w-4 h-4"/><span className="font-bold text-xs uppercase">Repeat booking</span></div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map(opt => (
                <button key={opt} type="button" onClick={() => setRepeatOption(opt)} className={`py-2 rounded-lg text-[10px] font-bold font-data tabular-nums transition ${repeatOption === opt ? styles.darkBg + ' text-white' : 'bg-white border border-slate-200 text-slate-400'}`}>
                  {opt === 0 ? 'Once' : `${opt + 1} Wks`}
                </button>
              ))}
            </div>
          </div>

          {conflictPreview.count > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3" role="status" aria-live="polite">
              <div className="text-[11px] font-bold text-amber-700 uppercase">Conflicts found ({conflictPreview.count})</div>
              <div className="text-[11px] text-amber-700 mt-1">{conflictPreview.first}</div>
            </div>
          )}

          <button type="button" onClick={() => onConfirm(repeatOption, isFullDay, null, isOvernight, isWorkingHours, quantity)} disabled={isBooking || conflictPreview.count > 0} className={`w-full py-4 ds-btn text-white transition-all ${styles.darkBg} disabled:opacity-50`} aria-busy={isBooking}>
            {isBooking ? <Loader2 className="animate-spin w-5 h-5 mx-auto"/> : conflictPreview.count > 0 ? "Resolve conflicts" : "Confirm booking"}
          </button>
        </div>
      </div>
    </div>
  );
};
export default BookingModal;
