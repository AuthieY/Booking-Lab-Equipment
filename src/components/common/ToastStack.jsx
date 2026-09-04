import React from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

const TONE_MAP = {
  success: {
    icon: CheckCircle2,
    edgeClass: 'border-l-[var(--ds-success-text)]',
    iconClass: 'text-[color:var(--ds-success-text)]'
  },
  warning: {
    icon: AlertTriangle,
    edgeClass: 'border-l-[var(--ds-warning-text)]',
    iconClass: 'text-[color:var(--ds-warning-text)]'
  },
  error: {
    icon: XCircle,
    edgeClass: 'border-l-[var(--ds-danger-text)]',
    iconClass: 'text-[color:var(--ds-danger-text)]'
  },
  info: {
    icon: Info,
    edgeClass: 'border-l-[var(--ds-brand-700)]',
    iconClass: 'text-[color:var(--ds-brand-700)]'
  }
};

const ToastStack = ({ toasts, onDismiss }) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] w-[min(92vw,28rem)] space-y-2 pointer-events-none">
      {toasts.map((toast) => {
        const tone = TONE_MAP[toast.type] || TONE_MAP.info;
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto rounded-[2px] bg-[var(--ds-surface)] border border-[var(--ds-rule-strong)] border-l-2 ${tone.edgeClass} px-3 py-2 shadow-[shadow:var(--ds-shadow-md)] flex items-start gap-2`}
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone.iconClass}`} />
            <div className="text-[12px] font-medium text-[color:var(--ds-text)] flex-1">{toast.message}</div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-[2px] p-0.5 text-[color:var(--ds-text-soft)] hover:bg-[var(--ds-surface-muted)]"
              aria-label="Dismiss message"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastStack;
