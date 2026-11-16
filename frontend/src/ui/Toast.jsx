import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
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

  const api = useMemo(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m) }),
    [push]
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div style={{ position: 'fixed', bottom: 34, right: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 1100, fontFamily: T.font }}>
        {toasts.map(t => {
          const Icon = t.type === 'error' ? CircleAlert : CircleCheck;
          return (
            // White surface, the meaning in the icon's colour: a toast is read
            // over whatever screen is open, so it must not shout over it.
            <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: T.panel,
              color: T.text,
              border: `1px solid ${T.hairline}`,
              borderRadius: T.radiusLg,
              padding: '10px 14px',
              fontSize: T.fsGrid,
              fontWeight: 500,
              maxWidth: 380,
              // Floats over the grids, so it must out-elevate them.
              boxShadow: T.shadowPress,
            }}>
              <Icon size={16} color={t.type === 'error' ? T.danger : T.ok} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
