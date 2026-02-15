import React, { useState, useEffect } from 'react';
import { X, Sun, Moon, Clock3, Repeat, Loader2, Beaker } from 'lucide-react';
import { getColorStyle } from '../../utils/helpers';

const BookingModal = ({ isOpen, onClose, initialHour, instrument, onConfirm, isBooking, getConflictPreview, getQuantityLimit }) => {
  const [repeatOption, setRepeatOption] = useState(0); 
  const [bookingMode, setBookingMode] = useState('hourly');
  const [quantity, setQuantity] = useState('1');
  const [conflictPreview, setConflictPreview] = useState({ count: 0, first: '' });
  const [quantityLimit, setQuantityLimit] = useState(null);

  const styles = getColorStyle(instrument?.color || 'blue');
  const maxCap = instrument?.maxCapacity || 1;
  const isFullDay = bookingMode === 'full_day';
  const isOvernight = bookingMode === 'overnight';
  const isWorkingHours = bookingMode === 'working_hours';
  const displayHour = String(Number.isFinite(Number(initialHour)) ? Number(initialHour) : 0).padStart(2, '0');
  const bookingModeOptions = [
    { id: 'hourly', label: 'Hourly', detail: `Present hour ${displayHour}:00`, icon: Clock3 },
    { id: 'working_hours', label: 'Working Hours', detail: '09:00-17:00', icon: Clock3 },
    { id: 'full_day', label: 'Full Day', detail: '00:00-24:00', icon: Sun },
    { id: 'overnight', label: 'Overnight', detail: '17:00-09:00', icon: Moon }
  ];
  const dynamicUpperBound = Math.max(
    0,
    Math.min(maxCap, Number(quantityLimit?.maxAllowed ?? maxCap))
  );

  const normalizeQuantity = (value) => {
    if (dynamicUpperBound <= 0) return 0;
    const parsed = Number.parseInt(String(value), 10);
    if (Number.isNaN(parsed)) return 1;
    return Math.min(dynamicUpperBound, Math.max(1, parsed));
  };
  const isQuantityRequired = maxCap > 1;
  const isQuantityDepleted = isQuantityRequired && dynamicUpperBound <= 0;
  const isQuantityMissing = isQuantityRequired && quantity.trim() === '';
  const isQuantityValid = !isQuantityRequired || (!isQuantityMissing && !isQuantityDepleted);
  const resolvedQuantity = normalizeQuantity(quantity);
  const effectiveQuantity = isQuantityRequired ? resolvedQuantity : 1;
  const handleQuantityChange = (event) => {
    const rawValue = event.target.value;
    if (!/^\d*$/.test(rawValue)) return;
    if (rawValue === '') {
      setQuantity('');
      return;
    }
    if (dynamicUpperBound <= 0) {
      setQuantity('');
      return;
    }
    setQuantity(String(Math.min(dynamicUpperBound, Number(rawValue))));
  };
  const handleQuantityBlur = () => {
    if (dynamicUpperBound <= 0) {
      setQuantity('');
      return;
    }
    setQuantity(String(resolvedQuantity));
  };

  useEffect(() => { 
    if (isOpen) {
      setQuantity('1');
      setRepeatOption(0);
      setBookingMode('hourly');
      setQuantityLimit(null);
    }
  }, [instrument, isOpen]);

  useEffect(() => {
    if (!isOpen || !getQuantityLimit) {
      setQuantityLimit(null);
      return;
    }
    const limit = getQuantityLimit({ repeatOption, isFullDay, isOvernight, isWorkingHours });
    setQuantityLimit(limit || null);
  }, [isOpen, repeatOption, bookingMode, getQuantityLimit, isFullDay, isOvernight, isWorkingHours]);

  useEffect(() => {
    if (!isOpen || !isQuantityRequired) return;
    if (dynamicUpperBound <= 0) {
      setQuantity('');
      return;
    }
    if (quantity.trim() === '') return;
    const current = Number.parseInt(quantity, 10);
    if (Number.isNaN(current)) return;
    if (current > dynamicUpperBound) {
      setQuantity(String(dynamicUpperBound));
    }
  }, [isOpen, isQuantityRequired, dynamicUpperBound, quantity]);

  useEffect(() => {
    if (!isOpen || !getConflictPreview) return;
    if (isQuantityMissing || isQuantityDepleted) {
      setConflictPreview({ count: 0, first: '' });
      return;
    }
    const preview = getConflictPreview({ repeatOption, isFullDay, isOvernight, isWorkingHours, quantity: effectiveQuantity });
    setConflictPreview(preview || { count: 0, first: '' });
  }, [isOpen, repeatOption, bookingMode, effectiveQuantity, isQuantityMissing, isQuantityDepleted, getConflictPreview]);

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
        className="ds-modal ds-modal-sm ds-modal-liquid ds-section ds-animate-modal overflow-y-auto max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 id="booking-modal-title" className="text-xl font-bold text-slate-800">Booking details</h3>
          <button type="button" onClick={onClose} aria-label="Close booking details" className="ds-icon-btn-glass text-slate-500 hover:text-slate-700"><X className="w-6 h-6"/></button>
        </div>
        
        <div className="space-y-4">
          <div className="ds-instrument-glass-card ds-instrument-glass-card-clean p-4 rounded-xl" style={{ '--ds-inst-accent': styles.accent }}>
            <div className={`text-lg font-bold ${styles.text}`}>{instrument?.name}</div>
          </div>

          {maxCap > 1 && (
            <div className="ds-glass-panel p-4 rounded-xl">
              <label htmlFor="booking-quantity" className="text-xs font-bold text-indigo-600 uppercase flex items-center gap-1 mb-2">
                <Beaker className="w-3 h-3"/> Quantity (max {maxCap})
              </label>
              {/* Keep 16px input text to prevent iOS auto-zoom on focus. */}
              <input 
                id="booking-quantity"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1" 
                max={Math.max(1, dynamicUpperBound)} 
                value={quantity} 
                aria-describedby="booking-quantity-help"
                onChange={handleQuantityChange}
                onBlur={handleQuantityBlur}
                disabled={isQuantityDepleted}
                className="w-full p-3 rounded-lg border border-indigo-200/70 outline-none font-medium text-base text-indigo-700 font-data tabular-nums bg-white/50"
              />
              <div id="booking-quantity-help" className="mt-1 text-[11px] text-indigo-600">
                {isQuantityDepleted
                  ? 'No quantity available for the selected slot.'
                  : `Enter quantity between 1 and ${dynamicUpperBound}.`}
              </div>
              {isQuantityMissing && !isQuantityDepleted && (
                <div className="mt-1 text-[11px] text-red-600" role="alert">
                  Quantity is required.
                </div>
              )}
            </div>
          )}

          <div className="ds-glass-panel p-4 rounded-xl">
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
                    className={`p-3 rounded-xl border text-left ds-transition ${
                      isActive
                        ? 'ds-glass-choice-active text-[var(--ds-brand-700)]'
                        : 'ds-glass-choice text-slate-600'
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

          <div className="ds-glass-panel p-4 rounded-xl">
            <div className="flex items-center gap-2 text-slate-600 mb-3"><Repeat className="w-4 h-4"/><span className="font-bold text-xs uppercase">Repeat booking</span></div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map(opt => (
                <button key={opt} type="button" onClick={() => setRepeatOption(opt)} className={`py-2 rounded-lg text-[10px] font-bold font-data tabular-nums ds-transition ${repeatOption === opt ? styles.darkBg + ' text-white' : 'ds-glass-choice text-slate-500'}`}>
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

          <button type="button" onClick={() => onConfirm(repeatOption, isFullDay, null, isOvernight, isWorkingHours, effectiveQuantity)} disabled={isBooking || conflictPreview.count > 0 || !isQuantityValid} className={`w-full py-4 ds-btn text-white transition-all ${styles.darkBg} disabled:opacity-50`} aria-busy={isBooking}>
            {isBooking ? <Loader2 className="animate-spin w-5 h-5 mx-auto"/> : conflictPreview.count > 0 ? "Resolve conflicts" : "Confirm booking"}
          </button>
        </div>
      </div>
    </div>
  );
};
export default BookingModal;
