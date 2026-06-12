import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { T } from './tokens';

const ToastCtx = createContext(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const push = useCallback((type, message) => {
    const id = nextId.current++;
    setToasts(ts => [...ts, { id, type, message }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), type === 'error' ? 8000 : 4000);
  }, []);

  const api = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div style={{ position: 'fixed', bottom: 34, right: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 1100, fontFamily: T.font }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === 'error' ? T.dangerTint : T.okTint,
            color: t.type === 'error' ? T.danger : T.ok,
            border: `1px solid ${t.type === 'error' ? T.danger : T.ok}`,
            borderRadius: T.radius,
            padding: '7px 12px',
            fontSize: T.fsGrid,
            fontWeight: 600,
            maxWidth: 380,
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
