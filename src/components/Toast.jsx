import { useEffect, useState, createContext, useContext, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((msg) => {
    clearTimeout(timerRef.current);
    setMessage(msg);
    timerRef.current = setTimeout(() => setMessage(null), 2600);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-0 z-[100] flex justify-center px-4 pointer-events-none"
        style={{ bottom: 'calc(1rem + var(--app-bottom-nav, 0px))', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {message && (
          <div className="pointer-events-auto rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg [animation:fadeUp_.2s_ease]">
            {message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
