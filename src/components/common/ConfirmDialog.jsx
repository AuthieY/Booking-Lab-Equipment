import React from 'react';

const TONE_STYLE = {
  danger: 'bg-[var(--ds-danger-text)] text-[color:var(--ds-on-danger)]',
  warning: 'ds-btn-warning',
  primary: 'ds-btn-primary'
};

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  onCancel,
  onConfirm
}) => {
  if (!isOpen) return null;

  return (
    <div className="ds-overlay z-[100]" role="presentation">
      <div
        className="ds-modal ds-modal-sm ds-section ds-animate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h3 id="confirm-dialog-title" className="text-[15px] font-bold text-[color:var(--ds-text-strong)]">
          {title}
        </h3>
        <p className="text-[12px] text-[color:var(--ds-text-muted)] mt-2">{message}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 ds-btn ds-btn-secondary">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 ds-btn ${TONE_STYLE[tone] || TONE_STYLE.primary}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
