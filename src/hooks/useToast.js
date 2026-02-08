import { useCallback, useEffect, useRef, useState } from 'react';

const makeId = () =>
  (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

export const useToast = () => {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback((message, type = 'info', ttl = 3200) => {
    const id = makeId();
    setToasts((prev) => [...prev, { id, message, type }]);

    if (ttl > 0) {
      const timer = setTimeout(() => {
        dismissToast(id);
      }, ttl);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [dismissToast]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  return {
    toasts,
    pushToast,
    dismissToast
  };
};
