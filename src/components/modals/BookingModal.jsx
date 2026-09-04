import React, { useState, useEffect, useMemo } from 'react';
import { X, Sun, Moon, Clock3, Repeat, Loader2, Beaker } from 'lucide-react';
import { getColorStyle } from '../../utils/helpers';

const BookingModal = ({ isOpen, onClose, initialHour, instrument, onConfirm, isBooking, getConflictPreview, getQuantityLimit }) => {
  const [repeatOption, setRepeatOption] = useState(0);
  const [bookingMode, setBookingMode] = useState('hourly');
  const [quantity, setQuantity] = useState('1');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [bookingComment, setBookingComment] = useState('');
  const [conflictPreview, setConflictPreview] = useState({ count: 0, first: '' });
  const [quantityLimit, setQuantityLimit] = useState(null);

  const styles = getColorStyle(instrument?.color || 'blue');
  const maxCap = instrument?.maxCapacity || 1;
  const isFullDay = bookingMode === 'full_day';
  const isOvernight = bookingMode === 'overnight';
  const isWorkingHours = bookingMode === 'working_hours';
  const hourNum = Number.isFinite(Number(initialHour)) ? Number(initialHour) : 0;
  const displayHour = String(hourNum).padStart(2, '0');
  const hourlyRange = `${displayHour}:00–${String(hourNum + 1).padStart(2, '0')}:00`;
  const unitOptions = useMemo(() => (
    Array.from(
      new Set((Array.isArray(instrument?.subOptions) ? instrument.subOptions : []).map((item) => String(item || '').trim()).filter(Boolean))
    )
  ), [instrument?.subOptions]);
  const requiresUnitSelection = unitOptions.length > 0;
  const bookingModeOptions = [
    { id: 'hourly', label: 'Hourly', detail: hourlyRange, icon: Clock3 },
    { id: 'working_hours', label: 'Working Hours', detail: '09:00–17:00', icon: Clock3 },
    { id: 'full_day', label: 'Full Day', detail: '00:00–24:00', icon: Sun },
    { id: 'overnight', label: 'Overnight', detail: '17:00–09:00', icon: Moon }
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
  const parsedQuantity = quantity.trim() === '' ? Number.NaN : Number.parseInt(quantity, 10);
  const isQuantityRequired = maxCap > 1;
  const isQuantityDepleted = isQuantityRequired && dynamicUpperBound <= 0;
  const isQuantityMissing = isQuantityRequired && quantity.trim() === '';
  const isQuantityOutOfRange = isQuantityRequired
    && !isQuantityMissing
    && (!Number.isFinite(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > dynamicUpperBound);
  const isQuantityValid = !isQuantityRequired || (!isQuantityMissing && !isQuantityDepleted && !isQuantityOutOfRange);
  const resolvedQuantity = normalizeQuantity(quantity);
  const effectiveQuantity = isQuantityRequired ? resolvedQuantity : 1;
  const selectedModeOption = bookingModeOptions.find((mode) => mode.id === bookingMode) || bookingModeOptions[0];
  const recordSummary = `${String(instrument?.name || '').toUpperCase()} · ${selectedModeOption.detail} · ${effectiveQuantity} ${effectiveQuantity === 1 ? 'UNIT' : 'UNITS'}`;
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
    setQuantity(rawValue);
  };
  const handleQuantityBlur = () => {
    if (dynamicUpperBound <= 0) {
      setQuantity('');
      return;
    }
    if (quantity.trim() === '') return;
    setQuantity(String(resolvedQuantity));
  };

  useEffect(() => {
    if (isOpen) {
      setQuantity(isQuantityRequired ? '' : '1');
      setRepeatOption(0);
      setBookingMode('hourly');
      setSelectedUnit(unitOptions[0] || '');
      setBookingComment('');
      setQuantityLimit(null);
    }
  }, [instrument, isOpen, unitOptions, isQuantityRequired]);

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
    if (isQuantityMissing || isQuantityDepleted || isQuantityOutOfRange) {
      setConflictPreview({ count: 0, first: '' });
      return;
    }
    const preview = getConflictPreview({ repeatOption, isFullDay, isOvernight, isWorkingHours, quantity: effectiveQuantity });
    setConflictPreview(preview || { count: 0, first: '' });
  }, [isOpen, repeatOption, bookingMode, effectiveQuantity, isQuantityMissing, isQuantityDepleted, isQuantityOutOfRange, getConflictPreview]);

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
    <div className="ds-overlay ds-overlay-sheet" role="presentation">
      <div
        className="ds-modal ds-modal-md ds-sheet overflow-y-auto sm:max-h-[90vh]"
        style={{ borderTop: `2px solid ${styles.accent}` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
      >
        <div className="ds-sheet-grab" />

        <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-3 border-b border-[var(--ds-rule)]">
          <div className="min-w-0">
            <h3 id="booking-modal-title" className="text-[15px] font-bold text-[color:var(--ds-text-strong)] truncate">
              {instrument?.name}
            </h3>
            <div className="mt-0.5 text-[12px] font-data-mono text-[color:var(--ds-text-muted)]">
              {displayHour}:00
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close booking details" className="ds-icon-btn-glass shrink-0"><X className="w-5 h-5"/></button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {requiresUnitSelection && (
            <div>
              <label htmlFor="booking-unit" className="ds-field-label block mb-1">
                Unit
              </label>
              <select
                id="booking-unit"
                value={selectedUnit}
                onChange={(event) => setSelectedUnit(event.target.value)}
                className="ds-input p-3 text-base"
              >
                <option value="">Select unit</option>
                {unitOptions.map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </div>
          )}

          {maxCap > 1 && (
            <div>
              <label htmlFor="booking-quantity" className="ds-field-label flex items-center gap-1 mb-1">
                <Beaker className="w-3 h-3"/> Quantity
              </label>
              {/* Keep 16px input text to prevent iOS auto-zoom on focus. */}
              <div className="flex items-baseline gap-2">
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
                  className="ds-input w-24 p-3 text-base font-data-mono tabular-nums"
                />
                <div
                  id="booking-quantity-help"
                  className={`text-[11px] ${isQuantityDepleted ? 'font-semibold text-[color:var(--ds-warning-text)]' : 'text-[color:var(--ds-text-soft)]'}`}
                >
                  {isQuantityDepleted
                    ? `0 of ${maxCap} free for this slot`
                    : `of ${dynamicUpperBound} free`}
                </div>
              </div>
              {isQuantityMissing && !isQuantityDepleted && (
                <div className="mt-1 text-[11px] text-[color:var(--ds-danger-text)]" role="alert">
                  Quantity is required.
                </div>
              )}
              {isQuantityOutOfRange && !isQuantityDepleted && (
                <div className="mt-1 text-[11px] text-[color:var(--ds-danger-text)]" role="alert">
                  Enter quantity between 1 and {dynamicUpperBound}.
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="booking-comment" className="ds-field-label block mb-1">
              Comment (optional)
            </label>
            <textarea
              id="booking-comment"
              value={bookingComment}
              onChange={(event) => setBookingComment(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Add any special note for others..."
              className="ds-input p-3 text-sm resize-none"
            />
            <div className="mt-1 text-[11px] text-[color:var(--ds-text-soft)] text-right font-data tabular-nums">
              {bookingComment.length}/500
            </div>
          </div>

          <div>
            <div className="ds-field-label mb-1">Booking mode</div>
            <div
              className="border border-[var(--ds-rule)] rounded-[4px] overflow-hidden divide-y divide-[var(--ds-rule)]"
              role="radiogroup"
              aria-label="Booking mode"
            >
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
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left ds-transition ${
                      isActive ? 'ds-glass-choice-active' : 'ds-glass-choice'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[color:var(--ds-brand-700)]' : 'text-[color:var(--ds-text-soft)]'}`} />
                      <span className={`text-[13px] font-medium ${isActive ? 'text-[color:var(--ds-brand-700)]' : 'text-[color:var(--ds-text)]'}`}>{mode.label}</span>
                    </span>
                    <span className="text-[11px] font-data-mono text-[color:var(--ds-text-soft)] shrink-0">{mode.detail}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="ds-field-label flex items-center gap-1 mb-1"><Repeat className="w-3 h-3"/> Repeat booking</div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map(opt => (
                <button key={opt} type="button" onClick={() => setRepeatOption(opt)} className={`py-2 border rounded-[4px] text-[11px] font-semibold font-data tabular-nums ds-transition ${repeatOption === opt ? 'ds-glass-choice-active text-[color:var(--ds-brand-700)]' : 'ds-glass-choice text-[color:var(--ds-text-muted)]'}`}>
                  {opt === 0 ? 'Once' : `${opt + 1} Wks`}
                </button>
              ))}
            </div>
          </div>

          {conflictPreview.count > 0 && (
            <div className="border-l-2 border-l-[var(--ds-warning-text)] pl-3 py-0.5" role="status" aria-live="polite">
              <div className="ds-microcaps text-[color:var(--ds-warning-text)]">Conflicts found ({conflictPreview.count})</div>
              <div className="mt-1 text-[12px] text-[color:var(--ds-warning-text)]">{conflictPreview.first}</div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-[var(--ds-surface)] border-t border-[var(--ds-rule)] px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 text-[11px] font-data-mono uppercase text-[color:var(--ds-text-muted)] truncate">
            {recordSummary}
          </div>
          <button
            type="button"
            onClick={() => onConfirm(repeatOption, isFullDay, selectedUnit, isOvernight, isWorkingHours, effectiveQuantity, bookingComment)}
            disabled={isBooking || conflictPreview.count > 0 || !isQuantityValid || (requiresUnitSelection && !selectedUnit)}
            className="ds-btn ds-btn-primary shrink-0 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide"
            aria-busy={isBooking}
          >
            {isBooking ? <Loader2 className="animate-spin w-4 h-4"/> : conflictPreview.count > 0 ? "Resolve conflicts" : "Confirm booking"}
          </button>
        </div>
      </div>
    </div>
  );
};
export default BookingModal;
