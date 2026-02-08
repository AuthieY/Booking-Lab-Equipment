import React from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

const TONE_MAP = {
  success: {
    icon: CheckCircle2,
    className: 'bg-emerald-50 border-emerald-200 text-emerald-700'
  },
  warning: {
    icon: AlertTriangle,
    className: 'bg-amber-50 border-amber-200 text-amber-700'
  },
  error: {
    icon: XCircle,
    className: 'bg-red-50 border-red-200 text-red-700'
  },
  info: {
    icon: Info,
    className: 'bg-slate-50 border-slate-200 text-slate-700'
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
            className={`pointer-events-auto rounded-xl border px-3 py-2 shadow-sm flex items-start gap-2 ${tone.className}`}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="text-xs font-medium flex-1">{toast.message}</div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded p-0.5 hover:bg-black/5"
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
