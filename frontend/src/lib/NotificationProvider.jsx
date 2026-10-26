import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { subscribe } from './notify';
import { T } from '../ui/tokens';

// The same toast as ui/Toast: a white surface with the meaning in the icon's
// colour, so a message reads over any screen without shouting over it.
const KINDS = {
  error: { Icon: CircleAlert, color: T.danger },
  success: { Icon: CircleCheck, color: T.ok },
  info: { Icon: Info, color: T.accent },
};

function Toast({ toast, onClose }) {
  const { id, message, type = 'info' } = toast;
  const { Icon, color } = KINDS[type] ?? KINDS.info;
  return (
    <div className={`ti-toast ti-toast-${type}`} role="alert">
      <Icon size={16} color={color} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
      <div className="ti-toast-message">{message}</div>
      <button type="button" className="ti-toast-close" aria-label="Dismiss" onClick={() => onClose(id)}>
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsub = subscribe(({ message, type = 'info', timeout = 6000 }) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, type }]);
      if (timeout > 0) {
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), timeout);
      }
    });
    return unsub;
  }, []);

  const handleClose = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <>
      {children}
      <div className="ti-toaster" aria-live="polite" style={containerStyle}>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={handleClose} />
        ))}
      </div>
      <style>{toastStyles}</style>
    </>
  );
}

const containerStyle = {
  position: 'fixed',
  right: 16,
  top: 16,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const toastStyles = `
.ti-toaster { pointer-events: none; }
.ti-toast {
  pointer-events: auto; display: flex; align-items: flex-start; gap: 8px;
  min-width: 260px; max-width: 400px; padding: 10px 10px 10px 14px;
  background: ${T.panel}; color: ${T.text}; border: 1px solid ${T.hairline};
  border-radius: ${T.radiusLg}px; box-shadow: ${T.shadowPress};
  font-family: ${T.font}; font-size: ${T.fsGrid}px; font-weight: 500; line-height: 1.4;
}
.ti-toast .ti-toast-message { flex: 1; }
.ti-toast-close {
  display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;
  background: transparent; border: none; border-radius: 6px; color: ${T.textMuted}; cursor: pointer;
}
.ti-toast-close:hover { background: ${T.hairlineSoft}; color: ${T.text}; }
`;

export default NotificationProvider;
